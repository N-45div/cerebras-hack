#!/usr/bin/env node
// OpenClaw link-understanding processor (tools.links.models, type "cli").
// OpenClaw fetches each URL in the user's message itself (SSRF-guarded) and pipes the page
// body to this script on stdin; whatever this prints is added to the conversation before the
// model runs. Here the URLs are stores' own live Shopify product searches, so this turns the
// JSON into one plain line per product. Nothing is invented: if the store returns nothing,
// nothing is printed.
//
// stdin: the body of https://STORE/search/suggest.json?q=...  env: OPENCLAW_LINK_FINAL_URL
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(raw); } catch { process.stdout.write(''); return; }
  const products = data?.resources?.results?.products || [];
  const base = new URL(process.env.OPENCLAW_LINK_FINAL_URL || process.env.OPENCLAW_LINK_URL || 'https://example.com');
  const store = base.hostname.replace(/^www\./, '');
  const lines = products.map((p) => {
    const url = `${base.origin}${String(p.url || '').split('?')[0]}`;
    const price = p.price != null ? `$${Number(p.price).toFixed(2)} USD` : 'price n/a';
    return `${p.title} | ${store} | ${price} | ${p.available ? 'in stock' : 'sold out'} | ${url}`;
  });
  process.stdout.write(lines.length ? `Live products from ${store}:\n${lines.join('\n')}\n` : '');
});
