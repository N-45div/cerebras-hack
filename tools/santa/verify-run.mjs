#!/usr/bin/env node
// Proves a Santa run wasn't mocked: every product in Kimi's final answer must appear,
// with the same price, in the live web_fetch results recorded in that run's transcript.
//   node tools/santa/verify-run.mjs <session-id-prefix>
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DB = join(process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw'), 'agents', 'main', 'agent', 'openclaw-agent.sqlite');
const prefix = process.argv[2];
const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare('select event_json, event_zstd from transcript_events where session_id like ? order by seq').all(prefix + '%');
const events = rows.map((r) => r.event_json || (r.event_zstd ? zlib.zstdDecompressSync(Buffer.from(r.event_zstd)).toString('utf8') : ''));

// Tool output, fully unescaped (results are JSON nested inside JSON strings).
let tool = events.filter((s) => !s.includes('"role":"assistant"')).join('\n');
for (let k = 0; k < 4; k++) tool = tool.split('\\\\').join('\\').split('\\"').join('"').split('\\n').join('\n');

if (process.argv[3] === '--dump') {
  const i = tool.indexOf(process.argv[4]);
  console.log(i, tool.slice(Math.max(0, i - 1500), i + 300));
  process.exit(0);
}

const finals = events.filter((s) => s.includes('"role":"assistant"')).map((s) => JSON.parse(s).message);
const text = finals.map((m) => (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')).filter((t) => t.includes('/products/')).pop() || '';
const lines = text.split('\n').filter((l) => l.includes('/products/'));
console.log(`run ${prefix}: ${rows.length} events, ${lines.length} product lines in the final answer\n`);

for (const l of lines) {
  const url = (l.match(/https?:\/\/[^\s)]+\/products\/[^\s)?]+/) || [''])[0];
  const handle = url.split('/products/')[1];
  const price = (l.match(/\$([\d,.]+)/) || [])[1];
  // Each search result is a JSON object; take the one whose url has this handle.
  // Shopify suggest records are pretty-printed with "handle"; price and title follow it,
  // "available" opens the record before it.
  const at = tool.indexOf(`"handle": "${handle}"`);
  const found = at >= 0;
  const after = found ? tool.slice(at, at + 4000) : '';
  const before = found ? tool.slice(Math.max(0, at - 6000), at) : '';
  const title = (after.match(/"title":\s*"([^"]+)"/) || [])[1];
  const livePrice = (after.match(/"price":\s*"([\d.]+)"/) || [])[1];
  const available = ([...before.matchAll(/"available":\s*(true|false)/g)].pop() || [])[1];
  const ok = found && livePrice && Math.abs(Number(livePrice) - Number(price.replace(/,/g, ''))) < 0.01;
  console.log(`${ok ? 'VERIFIED' : found ? 'MISMATCH' : 'NOT FOUND'}  ${url}`);
  console.log(`          answer: $${price}   live store record: ${found ? `"${title}" $${livePrice} available=${available}` : '-'}`);
}
