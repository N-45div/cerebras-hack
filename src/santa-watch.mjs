#!/usr/bin/env node
// Waits for a quiet Cerebras queue, then records the Speed Bounty take in a fresh
// OpenClaw web chat session. Repeats until the agent's final reply has 5+ product links.
//   node src/santa-watch.mjs [--every 600] [--quiet 6] [--tries 6] [--hours 12]
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, config } from './config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const EVERY = Number(opt('--every', 600));
const QUIET = Number(opt('--quiet', 6));
const TRIES = Number(opt('--tries', 6));
const HOURS = Number(opt('--hours', 12));
const PORT = '18799';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('en-GB'), ...a);

async function tabSession() {
  const tabs = await (await fetch(`http://127.0.0.1:${config.cdpPort}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${PORT}`));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;
  return { send, evaluate, close: () => ws.close() };
}

async function newSession() {
  const s = await tabSession();
  await s.evaluate("[...document.querySelectorAll('textarea')].find(t => t.offsetParent !== null).focus()");
  await s.send('Input.insertText', { text: '/new' });
  await sleep(300);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(6000);
  s.close();
}

async function result() {
  const s = await tabSession();
  const text = await s.evaluate("[...document.querySelectorAll('main')].filter(e => e.offsetParent).map(e => e.innerText).join('\\n')");
  const links = await s.evaluate("[...new Set([...document.querySelectorAll('main a[href^=http]')].filter(a => a.offsetParent).map(a => a.href))]");
  s.close();
  return { text: text || '', links: links || [] };
}

function probeWait() {
  const r = spawnSync(process.execPath, [join(ROOT, 'src', 'probe.mjs')], { encoding: 'utf8', timeout: 240000 });
  const m = /wait ~([\d.]+)s · decode (\d+)/.exec(r.stdout || '');
  return m ? { wait: Number(m[1]), tps: Number(m[2]) } : null;
}

const end = Date.now() + HOURS * 3600e3;
let tries = 0;
while (Date.now() < end && tries < TRIES) {
  const p = probeWait();
  log(p ? `probe: queue ~${p.wait}s, decode ${p.tps} tok/s` : 'probe failed (429s)');
  if (p && p.wait <= QUIET) {
    tries++;
    const out = `renders/santa-take-${Date.now()}.mp4`;
    log(`quiet enough, attempt ${tries}: recording ${out}`);
    await newSession();
    const rec = spawnSync(process.execPath, [join(ROOT, 'src', 'record-openclaw.mjs'), '--prompt', join(ROOT, 'prompts', 'santa.txt'), '--out', out, '--hold', '8', '--max', '900'], { encoding: 'utf8' });
    log((rec.stdout || '').trim().split('\n').pop());
    const r = await result();
    const tps = /([\d,]+) tok\/s mean · ([\d,]+) p90/.exec(r.text);
    const failed = /Couldn't finish|needs a short break/i.test(r.text);
    const shopLinks = r.links.filter((u) => !/bing\.com|127\.0\.0\.1|openclaw/.test(u));
    log(`readout: ${tps ? tps[0] : 'none'} · product links: ${shopLinks.length} · failed: ${failed}`);
    if (!failed && shopLinks.length >= 5) {
      log('SUCCESS ' + out);
      console.log(JSON.stringify({ take: out, readout: tps && tps[0], links: shopLinks }, null, 1));
      process.exit(0);
    }
    continue; // retry right away while it's quiet
  }
  await sleep(EVERY * 1000);
}
log('gave up: no successful take');
process.exit(1);
