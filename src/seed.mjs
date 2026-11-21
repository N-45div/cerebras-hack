#!/usr/bin/env node
// Opens the "tab hoarder" browser: a dedicated Chrome profile filled with tabs.
//   node src/seed.mjs                 # opens every URL in data/tabs.txt
//   node src/seed.mjs --file my.txt   # your own list (e.g. exported from your real browser)
//   node src/seed.mjs --limit 60
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import * as chrome from './chrome.mjs';
import { limiter } from './llm.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = opt('--file', join(ROOT, 'data', 'tabs.txt'));
const limit = Number(opt('--limit', 0));

let urls = readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
// Shuffle so categories are interleaved like a real messy browser.
urls = urls.map((u) => [Math.random(), u]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
if (limit) urls = urls.slice(0, limit);

await chrome.launch();
const have = new Set((await chrome.listTabs()).map((t) => t.url));
const todo = urls.filter((u) => !have.has(u));
const lim = limiter(6);
let n = 0;
await Promise.all(todo.map((u) => lim(async () => {
  await chrome.openTab(u);
  n++;
  if (n % 10 === 0) console.log(`opened ${n}/${todo.length}`);
  await new Promise((r) => setTimeout(r, 150));
})));
console.log(`Done. ${(await chrome.listTabs()).length} tabs open. Give pages ~20s to load, then run: node src/bankrupt.mjs`);
