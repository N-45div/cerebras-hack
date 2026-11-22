#!/usr/bin/env node
// Records a walkthrough of a finished OpenClaw web chat session (page only, 1920x1080):
// opens the session, scrolls from the prompt to the final answer, holds on the TPS readout.
//   node src/record-session.mjs --path /chat/main/<session-slug> [--scroll 14] [--hold 7] [--out renders/x.mp4]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from './config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PATH = opt('--path', '/');
const SCROLL = Number(opt('--scroll', 14));
const HOLD = Number(opt('--hold', 7));
const PORT = opt('--port', '18799');
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(join(ROOT, 'renders'), { recursive: true });
const outFile = join(ROOT, opt('--out', `renders/session-${Date.now()}.mp4`));

const tabs = await (await fetch(`http://127.0.0.1:${config.cdpPort}/json/list`)).json();
const tab = tabs.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${PORT}`));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;
let latest = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Page.screencastFrame') { latest = Buffer.from(m.params.data, 'base64'); send('Page.screencastFrameAck', { sessionId: m.params.sessionId }); }
};
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.bringToFront');
// In-app navigation (keeps the signed-in UI), then scroll the chat to the top.
await evaluate(`[...document.querySelectorAll('a')].find(a => a.getAttribute('href') === ${JSON.stringify(PATH)})?.click()`);
await sleep(4000);
const scroller = "[...document.querySelectorAll('*')].filter(e => e.offsetParent && e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.closest('main')).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]";
await evaluate(`(${scroller}).scrollTop = 0`);
await sleep(800);
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
for (let i = 0; i < 50 && !latest; i++) await sleep(100);

const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile],
  { stdio: ['pipe', 'ignore', 'pipe'] });
const ffDone = new Promise((r) => ff.on('close', r));
const t0 = Date.now();
let written = 0;
const pump = setInterval(() => {
  const due = Math.floor(((Date.now() - t0) / 1000) * FPS) + 1;
  while (written < due && latest) { ff.stdin.write(latest); written++; }
}, 1000 / FPS / 2);

await sleep(2500); // the prompt
const steps = SCROLL * 20;
for (let i = 1; i <= steps; i++) {
  await evaluate(`(() => { const s = ${scroller}; s.scrollTop = (s.scrollHeight - s.clientHeight) * ${i / steps}; })()`);
  await sleep(50);
}
await sleep(HOLD * 1000); // the answer and the readout
clearInterval(pump);
ff.stdin.end();
await ffDone;
await send('Page.stopScreencast');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
console.log(`Saved: ${outFile} (${(written / FPS).toFixed(1)}s)`);
process.exit(0);
