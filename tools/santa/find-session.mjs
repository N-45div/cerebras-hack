#!/usr/bin/env node
// Prints the OpenClaw session id (prefix) whose final answer contains the given text.
//   OPENCLAW_STATE_DIR=<state dir> node tools/santa/find-session.mjs "<text in the answer>"
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';
const db = new DatabaseSync(join(process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw'), 'agents', 'main', 'agent', 'openclaw-agent.sqlite'), { readOnly: true });
const rows = db.prepare('select session_id, event_json, event_zstd from transcript_events order by rowid desc limit 4000').all();
for (const r of rows) {
  const s = r.event_json || (r.event_zstd ? zlib.zstdDecompressSync(Buffer.from(r.event_zstd)).toString('utf8') : '');
  if (s.includes('"role":"assistant"') && s.includes(process.argv[2]) && s.includes('Santa')) { console.log(r.session_id.slice(0, 8)); process.exit(0); }
}
process.exit(1);
