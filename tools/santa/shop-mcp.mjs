#!/usr/bin/env node
// "find_products": a one-step shopping tool for OpenClaw (MCP over stdio, no dependencies).
//
// The agent passes its own gift search queries; this tool does the legwork in code:
//   1. searches the open web for each query (context.dev search; no built-in store list),
//   2. reads candidate pages with context.dev's product extractor,
//   3. returns one clean line per real product page that has a price:
//      title | store | price | in stock | link
// It invents nothing: a page without a detected product and price is skipped.
// context.dev allows one request at a time on this plan, so requests run sequentially.
//
// Configure in OpenClaw:  openclaw mcp add shop --command node --arg <repo>/tools/santa/shop-mcp.mjs
// Needs CONTEXT_DEV_API_KEY in the environment (or the repo's .env).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let KEY = process.env.CONTEXT_DEV_API_KEY;
if (!KEY && existsSync(join(ROOT, '.env'))) KEY = (readFileSync(join(ROOT, '.env'), 'utf8').match(/^CONTEXT_DEV_API_KEY=(.+)$/m) || [])[1]?.trim();
const API = 'https://api.context.dev/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => process.stderr.write(`[shop] ${a.join(' ')}\n`);

async function call(path, body) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 429) { await sleep(1000 * Math.max(1, Number(j?.error_data?.retry_after_seconds || res.headers.get('retry-after') || 1)) + 200 * attempt); continue; }
    if (!res.ok) throw new Error(`${path} ${res.status} ${j.message || ''}`.trim());
    return j;
  }
  throw new Error(`${path} kept hitting the rate limit`);
}

function priceOf(p) {
  const v = p?.price ?? p?.offers?.price ?? p?.salePrice;
  if (v == null || v === '') return null;
  if (typeof v === 'object') {
    const amount = v.amount ?? v.value ?? v.price; const cur = v.currency ?? v.currencyCode ?? p?.currency ?? '';
    return amount == null ? null : `${typeof amount === 'number' ? amount.toFixed(2) : amount} ${cur}`.trim();
  }
  const cur = p?.currency ?? p?.priceCurrency ?? '';
  return `${typeof v === 'number' ? v.toFixed(2) : v}${cur ? ' ' + cur : ''}`;
}

async function findProducts(queries, perQuery) {
  const out = [];
  for (const q of queries) {
    out.push(`Query: ${q}`);
    let found = 0;
    let results = [];
    try { results = (await call('/web/search', { query: q, numResults: 8 })).results || []; } catch (e) { out.push(`  (search failed: ${e.message})`); continue; }
    for (const r of results) {
      if (found >= perQuery) break;
      try {
        const page = await call('/web/scrape', { url: r.url, formats: { product: true } });
        const d = page?.product?.data;
        const p = d?.isProductPage ? d.product : null;
        const price = p && priceOf(p);
        if (!p || !price || !p.name) continue;
        const store = new URL(r.url).hostname.replace(/^www\./, '');
        const stock = p.availability ?? p.inStock ?? p.available;
        out.push(`- ${p.name} | ${store} | ${price} | ${stock == null ? 'stock n/a' : String(stock)} | ${r.url.split('#')[0]}`);
        found++;
      } catch (e) { log('scrape failed', r.url, e.message); }
    }
    if (!found) out.push('  (no priced product pages found)');
  }
  return out.join('\n');
}

// ---- minimal MCP (JSON-RPC 2.0 over newline-delimited stdio) ----
const TOOL = {
  name: 'find_products',
  description: 'Search the open web for real products. Give your own search queries (one per gift idea). Returns, per query, real product pages with a detected price as lines: title | store | price | stock | link.',
  inputSchema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, description: 'Your search queries, one per gift idea.' },
      perQuery: { type: 'integer', minimum: 1, maximum: 5, default: 2, description: 'Products to return per query.' },
    },
    required: ['queries'],
  },
};
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    const { id, method, params } = msg;
    if (method === 'initialize') send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'santa-shop', version: '1.0.0' } } });
    else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
    else if (method === 'tools/call') {
      try {
        const a = params?.arguments || {};
        const text = await findProducts((a.queries || []).slice(0, 8), Math.min(5, Math.max(1, a.perQuery || 2)));
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      } catch (e) { send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } }); }
    } else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
    else if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } });
  }
});
