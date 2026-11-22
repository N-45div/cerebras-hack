#!/usr/bin/env node
// Reads the text of every open tab (no model calls) and saves out/excerpts-latest.json,
// the input that bench/race scripts replay. Local app tabs are skipped.
//   node tools/bench/read-tabs.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../src/config.mjs';
import * as chrome from '../../src/chrome.mjs';

const isLocal = (url) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url);
const tabs = (await chrome.listTabs()).filter((t) => !isLocal(t.url));
const items = [];
await Promise.all(tabs.map(async (t, i) => {
  const r = await chrome.readTab(t).catch(() => ({}));
  items.push({ i, title: (r.title || t.title || t.url).slice(0, 140), url: t.url, text: (r.text || '').slice(0, 1400) });
}));
items.sort((a, b) => a.i - b.i);
writeFileSync(join(ROOT, 'out', 'excerpts-latest.json'), JSON.stringify(items));
console.log(`saved ${items.length} tabs (${items.filter((x) => x.text).length} with text)`);
