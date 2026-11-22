#!/usr/bin/env node
// Proves a Santa run's picks weren't made up: for each line under "Santa's picks:", the product
// name, price and link must all appear in the tool results (search / scrape / fetch) that the run
// itself received, as recorded in its OpenClaw transcript.
//   node src/verify-picks.mjs <session-id-prefix>
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('D:/speedpatch/state/agents/main/agent/openclaw-agent.sqlite', { readOnly: true });
const prefix = process.argv[2];
const dec = (r) => r.event_json || (r.event_zstd ? zlib.zstdDecompressSync(Buffer.from(r.event_zstd)).toString('utf8') : '');
const events = db.prepare('select event_json, event_zstd from transcript_events where session_id like ? order by seq').all(prefix + '%').map(dec);

let tool = events.filter((s) => !s.includes('"role":"assistant"')).join('\n');
for (let k = 0; k < 4; k++) tool = tool.split('\\\\').join('\\').split('\\"').join('"').split('\\n').join('\n').split('\\/').join('/');
const norm = (s) => s.toLowerCase().replace(/&amp;/g, '&').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
const toolN = norm(tool);

const final = events.filter((s) => s.includes('"role":"assistant"')).map((s) => JSON.parse(s).message)
  .map((m) => (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')).filter((t) => t.includes("Santa's picks")).pop() || '';
const picks = final.slice(final.indexOf("Santa's picks")).split('\n').filter((l) => /^\d+\./.test(l.trim()));
console.log(`run ${prefix}: ${events.length} events; ${picks.length} picks\n`);
for (const l of picks) {
  const name = (l.match(/\*\*(.+?)\*\*/) || [])[1] || '';
  const price = (l.match(/\$([\d,.]+)/) || [])[1] || '';
  const link = (l.match(/https?:\/\/\S+/) || [''])[0].replace(/[).,]+$/, '');
  const linkCore = link.split('?')[0];
  const hasName = toolN.includes(norm(name)) || norm(name).split(' ').filter((w) => w.length > 3).every((w) => toolN.includes(w));
  const hasPrice = price && (toolN.includes(price) || toolN.includes(price.replace(/\.00$/, '')));
  const hasLink = toolN.includes(norm(linkCore));
  console.log(`${hasName && hasPrice && hasLink ? 'VERIFIED' : 'CHECK   '}  name:${hasName} price $${price}:${hasPrice} link:${hasLink}  ${name.slice(0, 50)}`);
  console.log(`          ${link}`);
}
