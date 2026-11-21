#!/usr/bin/env node
// Is Cerebras busy right now? Measures queue wait vs decode speed with 3 tiny parallel calls.
//   node src/probe.mjs
import { chat } from './llm.mjs';

const t0 = Date.now();
const r = await Promise.all([0, 1, 2].map(async () => {
  const t = Date.now();
  const x = await chat([{ role: 'user', content: 'Name 30 animals, comma separated.' }], { maxTokens: 500 });
  const wall = Date.now() - t;
  const decodeMs = x.tps ? (x.tokens / x.tps) * 1000 : 0;
  return { wall, wait: Math.max(0, wall - decodeMs), tps: Math.round(x.tps) };
}));
const avg = (k) => Math.round(r.reduce((a, b) => a + b[k], 0) / r.length);
const wait = avg('wait');
console.log(`queue+network wait ~${(wait / 1000).toFixed(1)}s · decode ${avg('tps')} tok/s · total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(wait < 3000 ? 'GOOD TIME TO RECORD' : wait < 10000 ? 'OK, could be better' : 'BUSY, wait and probe again');
