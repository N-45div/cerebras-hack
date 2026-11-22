#!/usr/bin/env node
// Lists every tool call a Santa run made (tool name + arguments), from its OpenClaw transcript.
// Used to audit autonomy: shows exactly what the agent chose to search, fetch or scrape.
//   OPENCLAW_STATE_DIR=<state dir> node tools/santa/list-tool-calls.mjs <session-id-prefix>
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';

const db = new DatabaseSync(join(process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw'), 'agents', 'main', 'agent', 'openclaw-agent.sqlite'), { readOnly: true });
const rows = db.prepare('select event_json, event_zstd from transcript_events where session_id like ? order by seq').all(process.argv[2] + '%');
for (const r of rows) {
  const s = r.event_json || (r.event_zstd ? zlib.zstdDecompressSync(Buffer.from(r.event_zstd)).toString('utf8') : '');
  let e; try { e = JSON.parse(s); } catch { continue; }
  const m = e.message;
  if (m?.role !== 'assistant') continue;
  for (const c of m.content || []) {
    if (c.type === 'toolCall' || c.type === 'tool_use' || c.name) {
      const args = c.arguments ?? c.input ?? c.args ?? {};
      console.log(`${c.name}  ${JSON.stringify(args).slice(0, 160)}`);
    }
  }
}
