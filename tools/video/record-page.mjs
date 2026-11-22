#!/usr/bin/env node
// Records any page in this repo (served locally) to an MP4 via the DevTools screencast:
// page only, exact 1920x1080. Stops HOLD seconds after the page sets window.__DONE__.
//   node tools/video/record-page.mjs --page web/kimi-race.html [--hold 5] [--max 120] [--out renders/race.mp4]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { ROOT } from '../../src/config.mjs';
import { launch, openTab, closeTab } from '../../src/chrome.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PAGE = opt('--page', 'web/kimi-race.html');
const HOLD = Number(opt('--hold', 5));
const MAX = Number(opt('--max', 120));
const FPS = 30;
const PORT = 4848;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(join(ROOT, 'renders'), { recursive: true });
const outFile = join(ROOT, opt('--out', `renders/page-${Date.now()}.mp4`));

const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, '');
  if (p.startsWith('..') || p.includes('.env')) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1');

await launch();
const tab = await openTab(`http://127.0.0.1:${PORT}/${PAGE}?rec=1`);
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
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
await send('Page.reload'); // start the page's own timeline after the 1080p override
await sleep(300);
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
for (let i = 0; i < 50 && !latest; i++) await sleep(100);
setTimeout(() => send('Runtime.evaluate', { expression: 'window.__START__ = true' }), 1500); // a beat on the first frame

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

while ((Date.now() - t0) / 1000 < MAX) {
  const r = await send('Runtime.evaluate', { expression: '!!window.__DONE__', returnByValue: true });
  if (r?.result?.value) { console.error(`page done after ${((Date.now() - t0) / 1000).toFixed(1)}s`); break; }
  await sleep(200);
}
await sleep(HOLD * 1000);
clearInterval(pump);
ff.stdin.end();
await ffDone;
await send('Page.stopScreencast');
ws.close();
await closeTab(tab.id).catch(() => {});
server.close();
if (!/muxing overhead/.test(ffErr)) console.error('ffmpeg:\n' + ffErr);
console.log(`Saved: ${outFile} (${(written / FPS).toFixed(1)}s)`);
process.exit(0);
