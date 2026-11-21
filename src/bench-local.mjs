#!/usr/bin/env node
// Same work, two machines: replays the exact tab-summary prompts from the last run
// on (a) a local model on this laptop's GPU via Ollama and (b) Kimi on Cerebras.
// Decode speed is measured the same way on both: output tokens / server decode time.
//
//   node src/bench-local.mjs [--model qwen3:8b] [--batches 6]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, config } from './config.mjs';
import { chat } from './llm.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const LOCAL_MODEL = opt('--model', 'qwen3:8b');
const NB = Number(opt('--batches', 6));
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// Same system prompt as the real run (kept in sync by reading the source).
const src = readFileSync(join(ROOT, 'src', 'bankrupt.mjs'), 'utf8');
const CATS = [...src.matchAll(/\['([^']+(?:\\'[^']*)?)', '[^']+'\]/g)].map((m) => m[1].replace(/\\'/g, "'"));
const SYS = `You are the clerk of Tab Bankruptcy Court. For each browser tab you get its index, title, URL and an excerpt. Return ONLY JSON:
{"tabs":[{"i":<index>,"category":"<one of: ${CATS.join(' | ')}>","tldr":"<=18 words, accurate>","verdict":"keep"|"skim"|"let go","roast":"<=12 words, playful"}]}`;

const items = JSON.parse(readFileSync(join(ROOT, 'out', 'excerpts-latest.json'), 'utf8'));
const batches = [];
for (let k = 0; k < items.length && batches.length < NB; k += config.batchSize) batches.push(items.slice(k, k + config.batchSize));
const prompt = (b) => b.map((it) => `#${it.i}\nTITLE: ${it.title}\nURL: ${it.url}\nTEXT: ${it.text || '(empty page)'}`).join('\n\n');

let gpuName = 'local GPU';
try { gpuName = execSync('nvidia-smi --query-gpu=name --format=csv,noheader').toString().trim(); } catch {}

async function local(b) {
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model: LOCAL_MODEL, stream: false, format: 'json', think: false,
      options: { temperature: 0.8, num_predict: 1200 },
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: prompt(b) }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return { tokens: d.eval_count, decodeS: d.eval_duration / 1e9, wallS: (Date.now() - t0) / 1000 };
}

async function cerebras(b) {
  const t0 = Date.now();
  const r = await chat([{ role: 'system', content: SYS }, { role: 'user', content: prompt(b) }], { json: true, maxTokens: 2000, temperature: 0.8 });
  return { tokens: r.tokens, decodeS: r.tokens / (r.tps || 1), wallS: (Date.now() - t0) / 1000, model: r.model };
}

function summarize(rows) {
  const tps = rows.map((r) => r.tokens / r.decodeS);
  return {
    meanTps: Math.round(tps.reduce((a, b) => a + b, 0) / tps.length),
    totalTokens: rows.reduce((a, r) => a + r.tokens, 0),
    sequentialWallS: +rows.reduce((a, r) => a + r.wallS, 0).toFixed(1),
  };
}

console.log(`Benchmarking ${batches.length} batches (${batches.reduce((a, b) => a + b.length, 0)} tabs), run one at a time on each side.`);
// Warm up the local model so load time is not counted.
await local(batches[0]).catch((e) => { console.error('Ollama error:', e.message); process.exit(1); });

const L = [], C = [];
for (const b of batches) {
  L.push(await local(b));
  C.push(await cerebras(b));
  process.stdout.write('.');
}
const out = {
  at: new Date().toISOString(),
  task: 'Tab Bankruptcy tab-summary batches (same prompts, same excerpts)',
  method: 'decode tok/s = output tokens / server-reported decode time; batches run sequentially',
  gpu: { device: gpuName, runtime: 'Ollama', model: LOCAL_MODEL, ...summarize(L) },
  cerebras: { device: 'Cerebras Inference', model: C[0]?.model, ...summarize(C) },
};
out.speedup = +(out.cerebras.meanTps / out.gpu.meanTps).toFixed(1);
writeFileSync(join(ROOT, 'out', 'bench.json'), JSON.stringify(out, null, 2));
console.log('\n' + JSON.stringify(out, null, 2));
