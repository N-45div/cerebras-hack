#!/usr/bin/env node
// Records an OpenClaw web chat run (page only, 1920x1080, via the DevTools screencast):
// types a prompt into the chat tab, follows the run, and stops HOLD seconds after the
// agent finishes. Used for the Speed Bounty take on the patched OpenClaw build.
//   node tools/santa/record-openclaw.mjs --prompt tools/santa/prompts/santa-search.txt [--port 18799] [--hold 8] [--max 900]
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from '../../src/config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PROMPT = readFileSync(opt('--prompt', join(ROOT, 'tools', 'santa', 'prompts', 'santa-search.txt')), 'utf8').trim();
const PORT = opt('--port', '18799');
const HOLD = Number(opt('--hold', 8));
const MAX = Number(opt('--max', 900));
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(join(ROOT, 'renders'), { recursive: true });
const outFile = join(ROOT, opt('--out', `renders/openclaw-${Date.now()}.mp4`));

const tabs = await (await fetch(`http://127.0.0.1:${config.cdpPort}/json/list`)).json();
const tab = tabs.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${PORT}`));
if (!tab) { console.error(`No OpenClaw tab on port ${PORT} in the debug Chrome`); process.exit(1); }
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;
let latest = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Page.screencastFrame') {
    latest = Buffer.from(m.params.data, 'base64');
    send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.bringToFront');
await sleep(1000);
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
for (let i = 0; i < 50 && !latest; i++) await sleep(100);

const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0d',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile],
  { stdio: ['pipe', 'ignore', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', (d) => { ffErr = (ffErr + d).slice(-3000); });
const ffDone = new Promise((r) => ff.on('close', r));
const t0 = Date.now();
let written = 0;
const pump = setInterval(() => {
  const due = Math.floor(((Date.now() - t0) / 1000) * FPS) + 1;
  while (written < due && latest) { ff.stdin.write(latest); written++; }
}, 1000 / FPS / 2);

// Type the prompt (visibly, in a few chunks) and send it.
await sleep(1500);
await evaluate("[...document.querySelectorAll('textarea')].find(t => t.offsetParent !== null).focus()");
for (const part of PROMPT.match(/(\S+\s*){1,6}/g)) { await send('Input.insertText', { text: part }); await sleep(60); }
await sleep(600);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

const busyExpr = "!![...document.querySelectorAll('button')].find(b => b.offsetParent !== null && /stop/i.test((b.getAttribute('aria-label') || '') + (b.title || '')))";
let sawBusy = false;
const marks = [];
while ((Date.now() - t0) / 1000 < MAX) {
  const busy = await evaluate(busyExpr);
  if (busy && !sawBusy) { sawBusy = true; marks.push(['start', (Date.now() - t0) / 1000]); }
  if (sawBusy && !busy) { marks.push(['done', (Date.now() - t0) / 1000]); break; }
  await sleep(500);
}
// Scroll to the end so the final answer and the session readout are on screen.
await evaluate("document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; })");
await sleep(HOLD * 1000);
clearInterval(pump);
ff.stdin.end();
await ffDone;
await send('Page.stopScreencast');
ws.close();
if (!/muxing overhead/.test(ffErr)) console.error('ffmpeg:\n' + ffErr);
console.log(`Saved: ${outFile} (${(written / FPS).toFixed(1)}s) marks: ${JSON.stringify(marks)}`);
process.exit(0);
