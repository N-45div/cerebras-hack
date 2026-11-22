#!/usr/bin/env node
// Records a demo take straight from the dashboard tab via the DevTools screencast:
// only the page itself is captured (exact 1920x1080), never the desktop, other windows
// or notifications, and it works even if the window is not in front.
//   1. node src/seed.mjs              fill the browser, wait ~20s for pages to load
//   2. node tools/video/record.mjs            starts dashboard + recording, presses the big red button
//      --trigger openclaw             the run is started by an OpenClaw agent message instead
//      --hold 9                       seconds to keep recording on the digest
//      --lead 3                       seconds on the start screen before the run
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from '../../src/config.mjs';
import { listTabs } from '../../src/chrome.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const TRIGGER = opt('--trigger', 'button');
const HOLD = Number(opt('--hold', 9));
const LEAD = Number(opt('--lead', 3));
const FPS = 30;
const DASH = `http://127.0.0.1:${config.dashboardPort}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(join(ROOT, 'renders'), { recursive: true });
const outFile = join(ROOT, 'renders', `take-${Date.now()}.mp4`);

// 1) Start the dashboard (directly, or via OpenClaw's tab-bankruptcy skill).
let engine;
if (TRIGGER === 'openclaw') {
  engine = spawn('openclaw', ['agent', '--local', '--agent', 'main', '--thinking', 'low', '-m',
    '"I have way too many tabs open. Declare tab bankruptcy."'], {
    shell: true, stdio: 'inherit',
    env: { ...process.env, AUTO_DELAY_MS: String((LEAD + 4) * 1000), CUSTOM_API_KEY: process.env.CUSTOM_API_KEY || 'unused' },
  });
} else {
  engine = spawn(process.execPath, [join(ROOT, 'src', 'bankrupt.mjs'), '--stay'], { stdio: ['ignore', 'inherit', 'inherit'] });
}
// Wait for the engine's "ready" event (it replaces any old dashboard tab before sending it).
for (let i = 0; i < 900; i++) {
  try { if ((await fetch(DASH + '/')).ok) break; } catch {}
  await sleep(200);
}
await new Promise((resolve) => {
  fetch(DASH + '/events').then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) return resolve();
      buf += dec.decode(value, { stream: true });
      if (buf.includes('"type":"ready"')) { reader.cancel().catch(() => {}); return resolve(); }
    }
  }).catch(() => resolve());
});
await sleep(1000);
let dashTab;
for (let i = 0; i < 50 && !dashTab; i++) {
  try { dashTab = (await listTabs()).find((t) => t.url.startsWith(DASH)); } catch {}
  if (!dashTab) await sleep(200);
}
if (!dashTab) { console.error('Dashboard tab never appeared'); process.exit(1); }

// 2) CDP session on the dashboard tab.
const ws = new WebSocket(dashTab.webSocketDebuggerUrl);
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
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.bringToFront');
await sleep(1200); // re-layout at 1080p and let fonts settle
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
for (let i = 0; i < 50 && !latest; i++) await sleep(100);

// 3) Constant-frame-rate encode: write the newest frame 30 times a second.
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
  // Catch up if the timer drifted, so the video length matches wall time.
  const due = Math.floor(((Date.now() - t0) / 1000) * FPS) + 1;
  while (written < due && latest) { ff.stdin.write(latest); written++; }
}, 1000 / FPS / 2);

// 4) Follow the event stream until the digest is up.
const done = new Promise((resolve) => {
  fetch(DASH + '/events').then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) return resolve();
      buf += dec.decode(value, { stream: true });
      if (buf.includes('"type":"done"') || buf.includes('"type":"error"')) return resolve();
    }
  }).catch(() => resolve());
});

if (TRIGGER !== 'openclaw') {
  await sleep(LEAD * 1000);
  await fetch(DASH + '/go', { method: 'POST' });
}
await done;
await sleep(HOLD * 1000);

// 5) Stop and clean up.
clearInterval(pump);
ff.stdin.end();
await ffDone;
await send('Page.stopScreencast');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
if (TRIGGER !== 'openclaw') engine.kill();
if (!/muxing overhead/.test(ffErr)) console.error('ffmpeg:\n' + ffErr);
console.log(`Saved take: ${outFile} (${(written / FPS).toFixed(1)}s)`);
process.exit(0);
