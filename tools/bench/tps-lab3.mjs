#!/usr/bin/env node
// Which engine settings make Tab Bankruptcy's own calls decode fastest on Cerebras?
// Real clerk prompt, real excerpts from the last run; speed = completion_tokens / server completion_time.
//   node tools/bench/tps-lab3.mjs [--runs 3]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from '../../src/config.mjs';

const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1] || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = readFileSync(join(ROOT, 'src', 'bankrupt.mjs'), 'utf8');
const CATS = [...src.matchAll(/\['([^']+(?:\\'[^']*)?)', '[^']+'\]/g)].map((m) => m[1].replace(/\\'/g, "'"));
const sys = (echo) => `You are the clerk of Tab Bankruptcy Court. For each browser tab you get its index, title, URL and an excerpt. Return ONLY JSON:
{"tabs":[{"i":<index>,${echo ? '"title":"<the tab title, copied exactly>",' : ''}${echo === 2 ? '"url":"<the tab URL, copied exactly>",' : ''}"category":"<one of: ${CATS.join(' | ')}>","tldr":"<=18 words, accurate>","verdict":"keep"|"skim"|"let go","roast":"<=12 words, playful"}]}`;
const items = JSON.parse(readFileSync(join(ROOT, 'out', 'excerpts-latest.json'), 'utf8'));
const prompt = (b) => b.map((it) => `#${it.i}\nTITLE: ${it.title}\nURL: ${it.url}\nTEXT: ${(it.text || '(empty page)').slice(0, 650)}`).join('\n\n');

const configs = [
  { name: '8 tabs, temp 0.8, copy title', n: 8, temp: 0.8, echo: true },
  { name: '8 tabs, temp 0.8, copy title+url', n: 8, temp: 0.8, echo: 2 },
  { name: '12 tabs, temp 0.8, copy title+url', n: 12, temp: 0.8, echo: 2 },
];

async function call(cfg, batch) {
  for (let t = 0; t < 40; t++) {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.models[0], messages: [{ role: 'system', content: sys(cfg.echo) }, { role: 'user', content: prompt(batch) }], max_tokens: 900 + 260 * cfg.n, temperature: cfg.temp, reasoning_effort: 'low', response_format: { type: 'json_object' } }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.status === 200) return { n: d.usage.completion_tokens, r: d.usage.completion_tokens_details?.reasoning_tokens, s: d.time_info.completion_time };
    await sleep(6000 + Math.random() * 4000);
  }
  throw new Error('gave up');
}

for (const cfg of configs) {
  const rs = [];
  for (let k = 0; k < RUNS; k++) {
    const batch = items.slice(k * 8, k * 8 + cfg.n); // different real tabs each run
    rs.push(await call(cfg, batch));
  }
  const tps = rs.map((x) => x.n / x.s);
  console.log(`${cfg.name.padEnd(30)} mean ${Math.round(tps.reduce((a, b) => a + b, 0) / tps.length)} tok/s  runs ${tps.map((x) => Math.round(x)).join('/')}  (tokens ${rs.map((x) => `${x.n}/${x.r}r`).join(', ')})`);
}
