#!/usr/bin/env node
// Records a demo take of ONLY the Tab Bankruptcy Chrome window (never the full desktop).
//   1. node src/seed.mjs              fill the browser, wait ~20s for pages to load
//   2. node src/record.mjs            dashboard + recording; presses the big red button itself
//      --trigger openclaw             the run is started by an OpenClaw agent message instead
//      --hold 9                       seconds to keep recording on the digest
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from './config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const TRIGGER = opt('--trigger', 'button');
const HOLD = Number(opt('--hold', 9));
const DASH = `http://127.0.0.1:${config.dashboardPort}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(join(ROOT, 'renders'), { recursive: true });
const outFile = join(ROOT, 'renders', `take-${Date.now()}.mp4`);

let engine;
if (TRIGGER === 'openclaw') {
  // OpenClaw's agent runs the tab-bankruptcy skill, which starts the dashboard with --auto.
  // AUTO_DELAY_MS gives us time to start recording on the start screen first.
  engine = spawn('openclaw', ['agent', '--local', '--agent', 'main', '--thinking', 'low', '-m',
    '"I have way too many tabs open. Declare tab bankruptcy."'], {
    shell: true, stdio: 'inherit',
    env: { ...process.env, AUTO_DELAY_MS: '7000', CUSTOM_API_KEY: process.env.CUSTOM_API_KEY || 'unused' },
  });
} else {
  engine = spawn(process.execPath, [join(ROOT, 'src', 'bankrupt.mjs'), '--stay'], { stdio: ['ignore', 'inherit', 'inherit'] });
}

// Wait for the dashboard server.
for (let i = 0; i < 600; i++) {
  try { if ((await fetch(DASH + '/')).ok) break; } catch {}
  await sleep(200);
}
await sleep(1500); // let the dashboard tab render

// Follow the event stream so we know when the digest is up.
const done = new Promise((resolve) => {
  fetch(DASH + '/events').then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) return resolve();
      buf += dec.decode(value, { stream: true });
      if (buf.includes('"type":"done"')) return resolve();
    }
  }).catch(() => resolve());
});

// Restore + maximize + focus the dashboard window (gdigrab captures a minimized window as 181x25).
const ps = `Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
                 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
$p = Get-Process chrome | Where-Object { $_.MainWindowTitle -like 'Tab Bankruptcy*' } | Select-Object -First 1
if ($p) { [W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [W]::ShowWindow($p.MainWindowHandle, 3) | Out-Null; [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; 'focused' } else { 'not found' }`;
await new Promise((r) => spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' }).on('close', r));
await sleep(800);

// Record only the Chrome window whose title is our dashboard.
const ffClosed = { v: false };
// Chrome draws with the GPU, so window-title capture comes out black; capture the screen
// the maximized window covers and crop off the taskbar instead. Turn on Do Not Disturb!
const TASKBAR = Number(process.env.TASKBAR_PX || 60);
const ff = spawn('ffmpeg', ['-y', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0',
  '-i', 'desktop',
  '-vf', `crop=iw:ih-${TASKBAR}:0:0,scale=1920:-2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0d`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', outFile],
  { stdio: ['pipe', 'ignore', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', (d) => { ffErr = (ffErr + d).slice(-3000); });
const ffDone = new Promise((r) => ff.on('close', () => { ffClosed.v = true; r(); }));

if (TRIGGER !== 'openclaw') {
  await sleep(2500); // a beat on the start screen
  await fetch(DASH + '/go', { method: 'POST' });
}
await done;
await sleep(HOLD * 1000);

if (!ffClosed.v) ff.stdin.write('q');
await ffDone;
if (ffClosed.v && !/muxing overhead|kb\/s:/.test(ffErr)) console.error('ffmpeg output:\n' + ffErr);
if (TRIGGER !== 'openclaw') engine.kill();
if (/Can't find window|No such window/i.test(ffErr)) console.error('ffmpeg could not find the Chrome window titled "Tab Bankruptcy". Make the dashboard tab active and retry.\n' + ffErr);
console.log(`Saved take: ${outFile}`);
process.exit(0);
