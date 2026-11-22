#!/usr/bin/env node
// One real Tab Bankruptcy prompt (8 tabs from the last run), run on both machines:
//   (a) this laptop's GPU via Ollama, (b) Kimi K3.1 Pro on Cerebras.
// Saves each side's real output and its server-measured decode time to out/race.json,
// which web/race.html replays side by side (queue and network time excluded on both).
//
//   node src/race.mjs [--model qwen3:8b] [--tabs 8]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './config.mjs';
import { chat } from './llm.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const LOCAL_MODEL = opt('--model', 'qwen3:8b');
const NTABS = Number(opt('--tabs', 8));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

const src = readFileSync(join(ROOT, 'src', 'bankrupt.mjs'), 'utf8');
const CATS = [...src.matchAll(/\['([^']+(?:\\'[^']*)?)', '[^']+'\]/g)].map((m) => m[1].replace(/\\'/g, "'"));
const SYS = `You are the clerk of Tab Bankruptcy Court. For each browser tab you get its index, title, URL and an excerpt. Return ONLY JSON:
{"tabs":[{"i":<index>,"category":"<one of: ${CATS.join(' | ')}>","tldr":"<=18 words, accurate>","verdict":"keep"|"skim"|"let go","roast":"<=12 words, playful"}]}`;

const items = JSON.parse(readFileSync(join(ROOT, 'out', 'excerpts-latest.json'), 'utf8')).slice(0, NTABS);
const user = items.map((it) => `#${it.i}\nTITLE: ${it.title}\nURL: ${it.url}\nTEXT: ${(it.text || '(empty page)').slice(0, 650)}`).join('\n\n');
const messages = [{ role: 'system', content: SYS }, { role: 'user', content: user }];

let gpuName = 'local GPU';
try { gpuName = execSync('nvidia-smi --query-gpu=name --format=csv,noheader').toString().trim(); } catch {}

async function gpu() {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: LOCAL_MODEL, stream: false, format: 'json', think: false, messages,
      options: { num_predict: 2000, temperature: 0.8 } }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return { text: d.message.content, tokens: d.eval_count, decodeS: d.eval_duration / 1e9 };
}

async function cerebras() {
  for (let tries = 0; ; tries++) {
    try {
      const r = await chat(messages, { json: true, maxTokens: 3000, temperature: 0.8 });
      return { text: r.text, tokens: r.tokens, decodeS: r.tokens / r.tps, model: r.model };
    } catch (e) {
      if (tries >= 20 || !/429|5\d\d/.test(e.message)) throw e;
      process.stdout.write('q');
      await new Promise((res) => setTimeout(res, 15000));
    }
  }
}

console.log(`Racing ${items.length} tabs on ${gpuName} (${LOCAL_MODEL}) vs Cerebras.`);
await gpu(); // warm-up so model load time is not counted
const g = await gpu();
const c = await cerebras();
const pretty = (t) => { try { return JSON.stringify(JSON.parse(t), null, 1); } catch { return t; } };
const out = {
  at: new Date().toISOString(),
  tabs: items.map((it) => it.title),
  method: 'Same prompt on both. Speed = output tokens / server-measured decode time (Ollama eval_duration, Cerebras time_info.completion_time). Queue and network time excluded on both sides.',
  gpu: { label: `${gpuName} · ${LOCAL_MODEL} (Ollama)`, ...g, text: pretty(g.text), tps: g.tokens / g.decodeS },
  cerebras: { label: 'Cerebras · Kimi K3.1 Pro', ...c, text: pretty(c.text), tps: c.tokens / c.decodeS },
};
out.speedup = out.cerebras.tps / out.gpu.tps;
writeFileSync(join(ROOT, 'out', 'race.json'), JSON.stringify(out, null, 2));
console.log(`\nGPU: ${g.tokens} tok in ${g.decodeS.toFixed(2)}s = ${out.gpu.tps.toFixed(0)} tok/s`);
console.log(`Cerebras (${c.model}): ${c.tokens} tok in ${c.decodeS.toFixed(2)}s = ${out.cerebras.tps.toFixed(0)} tok/s`);
console.log(`Speedup: ${out.speedup.toFixed(1)}x`);
