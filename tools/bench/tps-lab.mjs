#!/usr/bin/env node
// What makes Kimi decode faster on Cerebras? Same model, different output shapes and
// temperatures; speed = completion_tokens / server completion_time (what the speed patch reads).
// Retries patiently through 429s so it can run during the hackathon overload.
//   node tools/bench/tps-lab.mjs [--reps 2]
import { config } from '../../src/config.mjs';

const REPS = Number(process.argv[process.argv.indexOf('--reps') + 1] || 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const items = [
  ['Keychron Desk Mat', 'Keychron', '19.99', 'https://www.keychron.com/products/keychron-desk-mat'],
  ['Nest v2', 'Orbitkey', '93.67', 'https://www.orbitkey.com/products/nest-v2'],
  ['Slim Pouch 2', 'Aer', '49.00', 'https://www.aersf.com/products/slim-pouch-2'],
  ['Valet Tray (Maple - Medium)', 'Ugmonk', '79.00', 'https://ugmonk.com/products/valet-tray-maple-medium'],
  ['AeroPress Coffee Maker - Original', 'AeroPress', '39.95', 'https://aeropress.com/products/aeropress-coffee-maker'],
];
const data = items.map((x) => x.join(' | ')).join('\n');

const cases = {
  creative: 'Write a playful 350-word Christmas story about Santa shopping for a software engineer.',
  list_with_lines: `From these real products, write a numbered list: **name** (store) $price, link on its own line, then one fun line on why it's a great gift for a software engineer.\n${data}`,
  list_copy_only: `Format these real products as a numbered markdown list exactly as: N. **name** — store — $price USD — link. No other text.\n${data}`,
};

async function call(prompt, temperature, maxTokens = 1500) {
  for (let t = 0; t < 40; t++) {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.models[0], messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature, reasoning_effort: 'low' }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.status === 200) {
      const n = d.usage?.completion_tokens || 0, s = d.time_info?.completion_time || 0;
      return { n, s, tps: s ? n / s : 0, reasoning: d.usage?.completion_tokens_details?.reasoning_tokens };
    }
    if (res.status === 429 || res.status >= 500) { await sleep(8000 + Math.random() * 4000); continue; }
    throw new Error(`${res.status} ${JSON.stringify(d).slice(0, 200)}`);
  }
  throw new Error('gave up after 40 tries');
}

for (const temp of [1.0, 0.2]) {
  for (const [name, prompt] of Object.entries(cases)) {
    for (let r = 0; r < REPS; r++) {
      try {
        const x = await call(prompt, temp);
        console.log(`${name.padEnd(16)} temp ${temp}  ${String(x.n).padStart(5)} tok (${x.reasoning ?? '?'} reasoning)  ${x.s.toFixed(2)}s  ${x.tps.toFixed(0)} tok/s`);
      } catch (e) { console.log(`${name} temp ${temp}: ${e.message}`); }
    }
  }
}
