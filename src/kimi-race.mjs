#!/usr/bin/env node
// Kimi vs Kimi: the same Tab Bankruptcy prompt on Kimi K3.1 Pro served by Cerebras and by
// Moonshot's own GPU platform (kimi-k3.1-pro and kimi-k3.1-pro-highspeed). All streamed;
// speed uses the hackathon formula: (output tokens - 1) / (last token time - first token time).
// Every chunk's arrival time is kept so web/race.html can replay exactly what streamed.
//   node src/kimi-race.mjs [--tabs 8] [--runs 3]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from './config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const NTABS = Number(opt('--tabs', 8));
const RUNS = Number(opt('--runs', 3));
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const MOONSHOT_KEY = (env.match(/^MOONSHOT_API_KEY=(.+)$/m) || [])[1]?.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = readFileSync(join(ROOT, 'src', 'bankrupt.mjs'), 'utf8');
const CATS = [...src.matchAll(/\['([^']+(?:\\'[^']*)?)', '[^']+'\]/g)].map((m) => m[1].replace(/\\'/g, "'"));
const SYS = `You are the clerk of Tab Bankruptcy Court. For each browser tab you get its index, title, URL and an excerpt. Return ONLY JSON:
{"tabs":[{"i":<index>,"category":"<one of: ${CATS.join(' | ')}>","tldr":"<=18 words, accurate>","verdict":"keep"|"skim"|"let go","roast":"<=12 words, playful"}]}`;
const items = JSON.parse(readFileSync(join(ROOT, 'out', 'excerpts-latest.json'), 'utf8')).slice(0, NTABS);
const user = items.map((it) => `#${it.i}\nTITLE: ${it.title}\nURL: ${it.url}\nTEXT: ${(it.text || '(empty page)').slice(0, 650)}`).join('\n\n');
const messages = [{ role: 'system', content: SYS }, { role: 'user', content: user }];

const lanes = [
  { id: 'cerebras', label: 'Cerebras', model: config.models[0], base: config.baseUrl, key: config.apiKey },
  { id: 'moonshot-highspeed', label: 'Moonshot GPU (highspeed tier)', model: 'kimi-k3.1-pro-highspeed', base: 'https://api.moonshot.ai/v1', key: MOONSHOT_KEY },
  { id: 'moonshot', label: 'Moonshot GPU', model: 'kimi-k3.1-pro', base: 'https://api.moonshot.ai/v1', key: MOONSHOT_KEY },
];

async function streamOnce(lane) {
  const body = { model: lane.model, messages, max_tokens: 4000, temperature: 1, reasoning_effort: 'low', stream: true, stream_options: { include_usage: true } };
  for (let attempt = 0; attempt < 40; attempt++) {
    const t0 = performance.now();
    const res = await fetch(`${lane.base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${lane.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 400 && body.reasoning_effort) {
      const e = await res.text();
      if (/reasoning/i.test(e)) { delete body.reasoning_effort; attempt--; continue; }
      throw new Error(`${lane.id} 400 ${e.slice(0, 200)}`);
    }
    if (res.status === 429 || res.status >= 500) { await res.text().catch(() => {}); await sleep(6000 + Math.random() * 4000); continue; }
    if (res.status !== 200) throw new Error(`${lane.id} ${res.status} ${(await res.text()).slice(0, 200)}`);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    const chunks = []; let usage = null; let first = null; let last = null; let reasoningChars = 0; let timeInfo = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.usage) usage = j.usage;
        if (j.choices?.[0]?.usage) usage = j.choices[0].usage;
        if (j.time_info) timeInfo = j.time_info;
        const d = j.choices?.[0]?.delta || {};
        const r = d.reasoning_content || d.reasoning || '';
        const c = d.content || '';
        if (r || c) {
          const t = performance.now();
          if (first === null) first = t;
          last = t;
          reasoningChars += r.length;
          chunks.push({ t: +(t - first).toFixed(1), c, r: r.length });
        }
      }
    }
    const n = usage?.completion_tokens || 0;
    const decodeS = (last - first) / 1000;
    // A response delivered in one burst isn't a stream: first-to-last-token time is meaningless.
    if (chunks.length < 10 || (n > 50 && decodeS < 0.2)) throw new Error(`${lane.id}: not streamed (${chunks.length} chunks in ${decodeS.toFixed(2)}s); discarding this run`);
    return {
      ttftS: +((first - t0) / 1000).toFixed(2), decodeS: +decodeS.toFixed(3), tokens: n,
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
      tps: decodeS > 0 ? (n - 1) / decodeS : 0,
      serverTps: timeInfo?.completion_time ? n / timeInfo.completion_time : null,
      text: chunks.map((x) => x.c).join(''), chunks,
    };
  }
  throw new Error(`${lane.id}: gave up after 40 tries`);
}

const results = {};
for (let run = 0; run < RUNS; run++) {
  for (const lane of lanes) {
    try {
      const r = await streamOnce(lane);
      (results[lane.id] ||= []).push(r);
      console.log(`run ${run + 1} ${lane.id.padEnd(18)} ttft ${String(r.ttftS).padStart(6)}s  ${String(r.tokens).padStart(5)} tok (${r.reasoningTokens ?? '?'} reasoning) in ${r.decodeS.toFixed(2)}s = ${r.tps.toFixed(0)} tok/s${r.serverTps ? ` (server ${r.serverTps.toFixed(0)})` : ''}`);
    } catch (e) { console.log(`run ${run + 1} ${lane.id}: ${e.message}`); }
  }
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = {};
for (const lane of lanes) {
  const rs = results[lane.id] || [];
  if (!rs.length) continue;
  const med = median(rs.map((r) => r.tps));
  const rep = rs.reduce((a, b) => (Math.abs(b.tps - med) < Math.abs(a.tps - med) ? b : a));
  summary[lane.id] = { label: lane.label, model: lane.model, runs: rs.map((r) => Math.round(r.tps)), medianTps: Math.round(med), medianTtftS: median(rs.map((r) => r.ttftS)), rep };
}
const out = {
  at: new Date().toISOString(), tabs: items.map((it) => it.title), runs: RUNS,
  method: 'Same prompt, streamed, temperature 1. Speed = (output tokens - 1) / (last token time - first token time), measured client-side the same way for every lane; median of runs. Time to first token (which includes queueing) is reported separately.',
  lanes: summary,
};
writeFileSync(join(ROOT, 'out', 'kimi-race.json'), JSON.stringify(out, null, 1));
console.log('\nmedian tok/s:', Object.entries(summary).map(([k, v]) => `${k} ${v.medianTps} (runs ${v.runs.join('/')}, ttft ~${v.medianTtftS}s)`).join(' | '));
