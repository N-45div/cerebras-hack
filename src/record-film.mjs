#!/usr/bin/env node
// Records the real end-to-end run for the main film (page only, 1920x1080, DevTools screencast):
//   1. the standard OpenClaw web chat: a new conversation, the request typed and sent;
//   2. when OpenClaw's agent runs the tab-bankruptcy skill, the dashboard tab it opens;
//   3. back to OpenClaw for the agent's reply.
// One continuous video; the switch times are printed so the edit can label any speed-up.
//   node src/record-film.mjs [--port 18789] [--hold-dash 6] [--hold-reply 7] [--out renders/film-take.mp4]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from './config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PORT = opt('--port', '18789');
const PROMPT = opt('--prompt', 'I have way too many tabs open. Declare tab bankruptcy.');
const HOLD_DASH = Number(opt('--hold-dash', 6));
const HOLD_REPLY = Number(opt('--hold-reply', 7));
const MAX = Number(opt('--max', 900));
const FPS = 30;
const DASH = `http://127.0.0.1:${config.dashboardPort}`;
const CDP = `http://127.0.0.1:${config.cdpPort}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(join(ROOT, 'renders'), { recursive: true });
const outFile = join(ROOT, opt('--out', `renders/film-take-${Date.now()}.mp4`));

let latest = null;
async function attach(tab) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = new Map(); let casting = false;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Page.screencastFrame') {
      if (casting) latest = Buffer.from(m.params.data, 'base64');
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
    }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  return {
    send, evaluate,
    async show() {
      await send('Page.bringToFront');
      await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
      casting = true;
    },
    async hide() { casting = false; await send('Page.stopScreencast'); },
    close: () => ws.close(),
  };
}
const listTabs = async () => (await (await fetch(`${CDP}/json/list`)).json()).filter((t) => t.type === 'page');

// 1) OpenClaw chat: fresh conversation.
const ocTab = (await listTabs()).find((t) => t.url.startsWith(`http://127.0.0.1:${PORT}`));
if (!ocTab) { console.error(`No OpenClaw tab on port ${PORT}`); process.exit(1); }
const oc = await attach(ocTab);
await oc.evaluate("[...document.querySelectorAll('a,button')].find(b => b.offsetParent && /new conversation|new chat|new session/i.test(b.getAttribute('aria-label') || b.title || ''))?.click()");
await sleep(4000);
await oc.show();
for (let i = 0; i < 50 && !latest; i++) await sleep(100);

const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0d',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile],
  { stdio: ['pipe', 'ignore', 'pipe'] });
const ffDone = new Promise((r) => ff.on('close', r));
const t0 = Date.now();
const now = () => +((Date.now() - t0) / 1000).toFixed(2);
let written = 0;
const pump = setInterval(() => {
  const due = Math.floor(((Date.now() - t0) / 1000) * FPS) + 1;
  while (written < due && latest) { ff.stdin.write(latest); written++; }
}, 1000 / FPS / 2);
const marks = { start: 0 };

// Type the request and send it.
await sleep(1500);
await oc.evaluate("[...document.querySelectorAll('textarea')].find(t => t.offsetParent !== null).focus()");
for (const part of PROMPT.match(/(\S+\s*){1,3}/g)) { await oc.send('Input.insertText', { text: part }); await sleep(120); }
await sleep(700);
await oc.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
await oc.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
marks.sent = now();

// 2) Wait for the skill to open the dashboard, then follow it.
let dashTab = null;
while (!dashTab && now() < MAX) {
  dashTab = (await listTabs()).find((t) => t.url.startsWith(DASH));
  if (!dashTab) await sleep(400);
}
if (!dashTab) { console.error('The dashboard never opened (did the agent run the skill?)'); }
let dash = null;
if (dashTab) {
  marks.dashboardOpened = now();
  dash = await attach(dashTab);
  await oc.hide();
  await dash.show();
  // Follow the engine's event stream until the digest is up.
  await new Promise((resolve) => {
    const tryConnect = () => fetch(DASH + '/events').then(async (res) => {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) return resolve();
        buf += dec.decode(value, { stream: true });
        if (!marks.go && buf.includes('"type":"go"')) marks.go = now();
        if (!marks.firstTab && buf.includes('"type":"tab"')) marks.firstTab = now();
        if (buf.includes('"type":"done"') || buf.includes('"type":"error"')) { marks.digest = now(); return resolve(); }
      }
    }).catch(() => setTimeout(tryConnect, 300));
    tryConnect();
  });
  await sleep(HOLD_DASH * 1000);
  // 3) Back to OpenClaw for the agent's reply.
  marks.backToOpenClaw = now();
  await dash.hide();
  await oc.show();
}

const busy = "!![...document.querySelectorAll('button')].find(b => b.offsetParent !== null && /stop/i.test((b.getAttribute('aria-label') || '') + (b.title || '')))";
await sleep(1500);
while (now() < MAX && await oc.evaluate(busy)) await sleep(500);
marks.replyDone = now();
await oc.evaluate("[...document.querySelectorAll('*')].filter(e => e.offsetParent && e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).forEach(e => { e.scrollTop = e.scrollHeight; })");
await sleep(HOLD_REPLY * 1000);

clearInterval(pump);
ff.stdin.end();
await ffDone;
await oc.hide();
await oc.send('Emulation.clearDeviceMetricsOverride');
oc.close(); dash?.close();
marks.end = now();
writeFileSync(outFile.replace(/\.mp4$/, '.marks.json'), JSON.stringify(marks, null, 1));
console.log(`Saved: ${outFile} (${(written / FPS).toFixed(1)}s) marks: ${JSON.stringify(marks)}`);
process.exit(0);
