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
const TARGET = Number(opt('--target', 0)); // keep recording until a successful take's mean tok/s reaches this
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
  await s.evaluate("[...document.querySelectorAll('a,button')].find(b => b.offsetParent && b.getAttribute('aria-label') === 'New conversation')?.click()");
  await sleep(5000);
  s.close();
}

async function result() {
  const s = await tabSession();
  // Older sessions stay mounted in the DOM: judge only the newest (last visible) chat view.
  // Hit-test: keep only elements actually painted in the viewport (hidden sessions fail this).
  const onScreen = `((e) => { const r = e.getBoundingClientRect(); if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) return false; const h = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2); return !!h && (e === h || e.contains(h) || h.contains(e)); })`;
  await s.evaluate("[...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).forEach(e => { e.scrollTop = e.scrollHeight; })");
  await sleep(800);
  const links = await s.evaluate(`[...new Set([...document.querySelectorAll('a[href*="/products/"]')].filter(${onScreen}).map(a => a.href))]`);
  const text = await s.evaluate(`[...document.querySelectorAll('span,div')].filter(e => /tok\\/s mean/.test(e.textContent) && e.children.length === 0).filter(${onScreen}).map(e => e.textContent).pop() || ''`);
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
  // Shopify rate-limits per IP across all stores; a take while it's throttling us wastes a run.
  const shop = await fetch('https://www.keychron.com/search/suggest.json?q=gift&resources[type]=product&resources[limit]=2&country=US&currency=USD', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' } }).then((r) => r.status).catch(() => 0);
  if (shop !== 200) log(`shopify status ${shop}, waiting`);
  if (p && p.wait <= QUIET && shop === 200) {
    tries++;
    const out = `renders/santa-take-${Date.now()}.mp4`;
    log(`quiet enough, attempt ${tries}: recording ${out}`);
    await newSession();
    const rec = spawnSync(process.execPath, [join(ROOT, 'src', 'record-openclaw.mjs'), '--prompt', join(ROOT, 'prompts', 'santa.txt'), '--out', out, '--hold', '8', '--max', '900'], { encoding: 'utf8' });
    log((rec.stdout || '').trim().split('\n').pop());
    const r = await result();
    const tps = /([\d,]+) tok\/s mean · ([\d,]+) p90/.exec(r.text);
    const failed = /Couldn't finish|needs a short break/i.test(r.text);
    const shopLinks = r.links.filter((u) => !/bing\.com|127\.0\.0\.1|openclaw|\/\/store\//i.test(u));
    log(`readout: ${tps ? tps[0] : 'none'} · product links: ${shopLinks.length} · failed: ${failed}`);
    if (shopLinks.length >= 5) { // the final list exists (failure notices from older sessions may share the view)
      const mean = tps ? Number(tps[1].replace(/,/g, '')) : 0;
      log(`SUCCESS ${out} mean ${mean}`);
      console.log(JSON.stringify({ take: out, readout: tps && tps[0], links: shopLinks }));
      if (mean >= TARGET) process.exit(0); // good enough: stop; otherwise keep trying for a faster take
    }
    await sleep(90000); // let the rate limiter recover, then try again
    continue;
  }
  await sleep(EVERY * 1000);
}
log('gave up: no successful take');
process.exit(1);
