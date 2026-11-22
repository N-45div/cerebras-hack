#!/usr/bin/env node
// Does a long copied table (every live search result) decode faster than a 5-line answer?
// Uses real Shopify search results as the "tool output", like the OpenClaw run sees.
import { config } from '../../src/config.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' };
const stores = [['www.keychron.com', 'keyboard'], ['www.orbitkey.com', 'organiser'], ['ugmonk.com', 'desk'], ['www.craighill.co', 'desk'], ['fellowproducts.com', 'mug']];
const results = await Promise.all(stores.map(async ([h, q]) => {
  const r = await fetch(`https://${h}/search/suggest.json?q=${q}&resources[type]=product&resources[limit]=6&country=US&currency=USD`, { headers: UA });
  const j = await r.json();
  return { store: h, products: j.resources.results.products.map((p) => ({ title: p.title, price: p.price, available: p.available, url: p.url.split('?')[0], vendor: p.vendor })) };
}));
const data = JSON.stringify(results);
const prompts = {
  five_lines: `Live store search results:\n${data}\n\nReply with exactly 5 lines, one available product under $100 per store, copying values: N. **title** — store — $price USD — https://STORE/products/handle`,
  full_table: `Live store search results:\n${data}\n\nReply with Santa's checked list: a markdown table of EVERY product above, copying values exactly (columns: # | title | store | price USD | available | link as https://STORE/products/handle). Then "Santa's picks:" and 5 lines, one available product under $100 per store: N. **title** — store — $price USD — link.`,
};
async function call(p, temperature) {
  for (let t = 0; t < 40; t++) {
    const res = await fetch(`${config.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.models[0], messages: [{ role: 'user', content: p }], max_tokens: 4000, temperature, reasoning_effort: 'low' }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 200) { const n = d.usage.completion_tokens, s = d.time_info.completion_time; return { n, r: d.usage.completion_tokens_details?.reasoning_tokens, s, tps: n / s }; }
    await sleep(8000 + Math.random() * 4000);
  }
  throw new Error('gave up');
}
for (const [name, p] of Object.entries(prompts)) for (let i = 0; i < 2; i++) {
  const x = await call(p, 0.2);
  console.log(`${name.padEnd(11)} ${String(x.n).padStart(5)} tok (${x.r} reasoning) ${x.s.toFixed(2)}s ${x.tps.toFixed(0)} tok/s`);
}
