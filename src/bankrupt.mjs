#!/usr/bin/env node
// TAB BANKRUPTCY: Kimi K3.1 Pro on Cerebras reads every open tab, files it,
// roasts you, and closes it. Every URL is saved, so nothing is truly lost.
//
//   node src/bankrupt.mjs            # opens dashboard, waits for the big red button
//   node src/bankrupt.mjs --auto     # starts immediately (used by the OpenClaw skill)
//   flags: --no-close  --limit N  --stay
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.mjs';
import { chat, parseJson, limiter, speedSummary, getActiveModel, stats } from './llm.mjs';
import * as chrome from './chrome.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const AUTO = flag('--auto');
const NO_CLOSE = flag('--no-close');
const STAY = flag('--stay');
const LIMIT = Number(opt('--limit', 0));
const DASH = `http://127.0.0.1:${config.dashboardPort}/`;

export const CATEGORIES = [
  ['Recipes you\'ll never cook', '🍳'],
  ['Repos you meant to star', '⭐'],
  ['Docs you pretended to read', '📚'],
  ['Papers you\'ll cite without reading', '🎓'],
  ['Wikipedia rabbit holes', '🕳️'],
  ['Shopping carts of shame', '🛒'],
  ['Career anxiety', '💼'],
  ['Videos for "later"', '📺'],
  ['Forum threads & Q&A', '💬'],
  ['News you already forgot', '📰'],
  ['Essays that will change your life (eventually)', '🧠'],
  ['Other', '🗂️'],
];

export const SYS_TABS = `You are the clerk of Tab Bankruptcy Court. A person kept far too many browser tabs open.
For each tab you get its index, title, URL and an excerpt of the page text. Return ONLY JSON:
{"tabs":[{"i":<index>,"category":"<one category from the list>","tldr":"<=18 words: what the page ACTUALLY says (be accurate)>","verdict":"keep"|"skim"|"let go","roast":"<=12 words: a playful jab at the person who hoarded this tab"}]}
Categories: ${CATEGORIES.map((c) => c[0]).join(' | ')}
Verdicts: "keep" = genuinely worth reading in full; "skim" = 2 minutes max; "let go" = they will never read it, it is stale, a homepage, a login wall or an error page.
Be funny but never mean-spirited. No markdown.`;

const SYS_DIGEST = `You are the judge of Tab Bankruptcy Court. You get one line per open tab: index|title|url|start of the page text.
Return ONLY JSON:
{"headline":"<punchy verdict, max 12 words>",
 "roast":"<a 60-90 word affectionate roast of this person's tab habits, referencing specific tabs>",
 "quips":{"<category name>":"<max 10-word quip>"} for each of these categories that fits their tabs: ${CATEGORIES.map((c) => c[0]).join(' | ')},
 "keep":[<up to 5 indexes truly worth reading>],
 "regret":{"i":<index of the one tab they'll regret closing>,"why":"<max 15 words>"},
 "diagnosis":"<a fake medical-style diagnosis of their condition, max 12 words>"}
No markdown.`;

// ---------- live event stream for the dashboard ----------
const clients = new Set();
const history = [];
function emit(type, data = {}) {
  const msg = `data: ${JSON.stringify({ type, t: Date.now(), ...data })}\n\n`;
  history.push(msg);
  for (const c of clients) c.write(msg);
}

let started = false;
const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    history.forEach((m) => res.write(m));
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url === '/go' && req.method === 'POST') {
    res.end('ok');
    start();
    return;
  }
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(ROOT, 'web', 'dashboard.html')));
    return;
  }
  res.writeHead(404).end();
});

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n));
const isOurs = (url) => url.startsWith(DASH) || url.includes(`127.0.0.1:${config.dashboardPort}`) || url.includes(`localhost:${config.dashboardPort}`);

async function start() {
  if (started) return;
  started = true;
  try {
    await run();
  } catch (e) {
    console.error(e);
    emit('error', { message: String(e.message || e) });
  }
}

async function run() {
  const t0 = Date.now();
  let tabs = (await chrome.listTabs()).filter((t) => !isOurs(t.url));
  if (LIMIT) tabs = tabs.slice(0, LIMIT);
  if (!tabs.length) {
    emit('error', { message: 'No tabs open. Run: node src/seed.mjs' });
    console.log('No tabs open in the Tab Bankruptcy browser. Fill it first: node src/seed.mjs');
    if (!STAY) setTimeout(() => process.exit(0), 500);
    return;
  }
  const items = tabs.map((t, i) => ({ i, id: t.id, ws: t.webSocketDebuggerUrl, url: t.url, title: t.title, words: 0, text: '' }));
  emit('go', { total: items.length, model: getActiveModel() });

  // 1) Read every tab's rendered text in parallel.
  const readLimit = limiter(16);
  await Promise.all(items.map((it) => readLimit(async () => {
    const r = await chrome.readTab({ webSocketDebuggerUrl: it.ws, title: it.title });
    it.title = (r.title || it.title || it.url).slice(0, 140);
    it.text = r.text || '';
    it.words = r.words || 0;
    emit('read', { i: it.i, words: it.words });
  })));

  const readSeconds = (Date.now() - t0) / 1000;
  console.error(`[timing] read ${items.length} tabs in ${readSeconds.toFixed(1)}s (${items.filter((it) => !it.text).length} empty)`);

  // Save the exact inputs so the GPU benchmark can replay the same work.
  mkdirSync(join(ROOT, 'out'), { recursive: true });
  writeFileSync(join(ROOT, 'out', 'excerpts-latest.json'),
    JSON.stringify(items.map(({ i, title, url, text }) => ({ i, title, url, text: text.slice(0, 1400) }))));

  // 2) The judge reads everything at once, in parallel with the clerks below
  //    (so the whole run pays the server's queue wait only once).
  const llmStart = Date.now();
  const digestLines = items.map((it) => `${it.i}|${it.title.slice(0, 90)}|${it.url.slice(0, 90)}|${it.text.slice(0, 220)}`).join('\n');
  const digestPromise = chat([{ role: 'system', content: SYS_DIGEST }, { role: 'user', content: digestLines }],
    { json: true, maxTokens: 4000, temperature: 0.9 })
    .then((r) => parseJson(r.text))
    .catch((e) => {
      console.error('[digest]', e.message);
      return { headline: 'Bankruptcy granted.', roast: '', quips: {}, keep: [], regret: null };
    });

  // 3) Clerks: summarize + roast every tab, all batches at once; close each tab as its verdict lands.
  const llmLimit = limiter(config.concurrency);
  await Promise.all(chunk(items, config.batchSize).map((batch) => llmLimit(async () => {
    const user = batch.map((it) => `#${it.i}\nTITLE: ${it.title}\nURL: ${it.url}\nTEXT: ${it.text.slice(0, 1400) || '(empty page)'}`).join('\n\n');
    let parsed = [];
    let tps = 0;
    try {
      const r = await chat([{ role: 'system', content: SYS_TABS }, { role: 'user', content: user }],
        { json: true, maxTokens: 900 + 220 * batch.length, temperature: 0.8 });
      tps = r.tps;
      parsed = parseJson(r.text).tabs || [];
    } catch (e) {
      console.error('[batch]', e.message);
    }
    for (const it of batch) {
      const s = parsed.find((p) => Number(p.i) === it.i) || {};
      const cat = CATEGORIES.find((c) => c[0] === s.category) || CATEGORIES[CATEGORIES.length - 1];
      Object.assign(it, {
        category: cat[0], emoji: cat[1],
        tldr: s.tldr || 'Unreadable. Much like your tab strategy.',
        verdict: ['keep', 'skim', 'let go'].includes(s.verdict) ? s.verdict : 'let go',
        roast: s.roast || '',
      });
      emit('tab', { ...publicTab(it), tps: Math.round(tps) });
      if (!NO_CLOSE) {
        await chrome.closeTab(it.id);
        emit('closed', { i: it.i });
      }
    }
    emit('speed', { ...speedSummary(), aggregateTps: Math.round(stats.outputTokens / ((Date.now() - llmStart) / 1000)) });
  })));
  const llmSeconds = (Date.now() - llmStart) / 1000;
  const w = [...stats.wallMs].sort((a, b) => a - b);
  console.error(`[timing] summaries in ${llmSeconds.toFixed(1)}s · ${stats.calls} calls · retries ${stats.retries} · call wall p50 ${w[w.length >> 1]}ms max ${w[w.length - 1]}ms`);

  // 4) The final judgment (already running since step 2).
  const digest = await digestPromise;

  const totalWords = items.reduce((a, it) => a + it.words, 0);
  const speed = speedSummary();
  const result = {
    at: new Date().toISOString(),
    model: getActiveModel(),
    stats: {
      tabs: items.length,
      words: totalWords,
      readingHours: +(totalWords / 238 / 60).toFixed(1),
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
      ...speed,
      aggregateTps: Math.round(speed.outputTokens / llmSeconds),
    },
    digest,
    tabs: items.map(publicTab),
  };
  emit('done', result);

  // 4) Save everything: nothing is truly lost.
  mkdirSync(join(ROOT, 'out'), { recursive: true });
  const stamp = result.at.replace(/[:.]/g, '-');
  const runPath = join(ROOT, 'out', `run-${stamp}.json`);
  const digestPath = join(ROOT, 'out', `digest-${stamp}.html`);
  writeFileSync(runPath, JSON.stringify(result, null, 2));
  const html = readFileSync(join(ROOT, 'web', 'dashboard.html'), 'utf8')
    .replace('</head>', `<script>window.__RUN__=${JSON.stringify(result).replace(/</g, '\\u003c')}</script></head>`);
  writeFileSync(digestPath, html);

  printSummary(result, digestPath, runPath);
  if (!STAY) setTimeout(() => process.exit(0), 3000);
}

function publicTab(it) {
  const { i, url, title, words, category, emoji, tldr, verdict, roast } = it;
  return { i, url, title, words, category, emoji, tldr, verdict, roast };
}

function printSummary(r, digestPath, runPath) {
  const s = r.stats;
  const byI = Object.fromEntries(r.tabs.map((t) => [t.i, t]));
  const keep = (r.digest.keep || []).map((i) => byI[i]).filter(Boolean);
  console.log(`\n# 🦞 Tab Bankruptcy: ${r.digest.headline || 'granted'}\n`);
  console.log(`${s.tabs} tabs closed · ${s.words.toLocaleString()} words read (${s.readingHours}h of reading) · ${s.seconds}s total`);
  console.log(`Model: ${r.model} · ${s.meanTps} tok/s mean per call (server) · ${s.aggregateTps} tok/s aggregate across parallel calls\n`);
  if (r.digest.diagnosis) console.log(`Diagnosis: ${r.digest.diagnosis}\n`);
  if (r.digest.roast) console.log(`${r.digest.roast}\n`);
  if (keep.length) {
    console.log('Actually worth reading:');
    keep.forEach((t) => console.log(`- ${t.title}: ${t.url}`));
  }
  if (r.digest.regret && byI[r.digest.regret.i]) {
    const t = byI[r.digest.regret.i];
    console.log(`\nThe one you'll regret closing: ${t.title} (${t.url}). ${r.digest.regret.why}`);
  }
  console.log(`\nDigest: ${digestPath}\nAll URLs saved: ${runPath}`);
}

// ---------- boot ----------
await chrome.launch();
server.listen(config.dashboardPort, '127.0.0.1', async () => {
  const tabs = (await chrome.listTabs()).filter((t) => !isOurs(t.url));
  console.error(`[tab-bankruptcy] ${tabs.length} tabs open. Dashboard: ${DASH}`);
  // Open the dashboard inside the same Chrome so it is the last tab standing.
  const existing = (await chrome.listTabs()).find((t) => isOurs(t.url));
  if (existing) {
    // Reload so it reconnects to this server, then bring it to the front.
    await chrome.closeTab(existing.id);
  }
  const dash = await chrome.openTab(DASH + (AUTO ? '?auto=1' : ''));
  if (dash?.id) await chrome.activateTab(dash.id);
  emit('ready', { total: LIMIT ? Math.min(LIMIT, tabs.length) : tabs.length, model: config.models[0] });
  if (AUTO) setTimeout(start, Number(process.env.AUTO_DELAY_MS || 1500));
});
