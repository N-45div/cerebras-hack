// Chrome control over the DevTools Protocol (CDP). Uses a dedicated profile so we
// only ever touch tabs in the "bankruptcy" browser, never the user's main Chrome.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { config, ROOT } from './config.mjs';

const base = () => `http://127.0.0.1:${config.cdpPort}`;

export async function isUp() {
  try {
    const r = await fetch(`${base()}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function launch() {
  if (await isUp()) return;
  const profile = join(ROOT, 'chrome-profile');
  spawn(config.chromePath, [
    `--remote-debugging-port=${config.cdpPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=TabDiscarding,IntensiveWakeUpThrottling',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--start-maximized',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50; i++) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome did not start with remote debugging');
}

export async function listTabs() {
  const r = await fetch(`${base()}/json/list`);
  const all = await r.json();
  return all.filter((t) => t.type === 'page' && /^https?:/.test(t.url));
}

export async function openTab(url) {
  const r = await fetch(`${base()}/json/new?${encodeURI(url)}`, { method: 'PUT' });
  return r.json();
}

export async function activateTab(id) {
  await fetch(`${base()}/json/activate/${id}`).catch(() => {});
}

export async function closeTab(id) {
  await fetch(`${base()}/json/close/${id}`).catch(() => {});
}

// Read the rendered text of a tab (what the user actually sees).
export function readTab(tab, { maxChars = 6000, timeoutMs = 2500 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; try { ws.close(); } catch {} resolve(val); } };
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    const timer = setTimeout(() => finish({ title: tab.title, text: '' }), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `JSON.stringify({title: document.title, text: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').trim()})`,
        returnByValue: true,
      },
    }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      try {
        const v = JSON.parse(msg.result.result.value);
        const words = v.text ? v.text.split(' ').length : 0;
        finish({ title: v.title || tab.title, text: v.text.slice(0, maxChars), words });
      } catch {
        finish({ title: tab.title, text: '', words: 0 });
      }
    };
    ws.onerror = () => { clearTimeout(timer); finish({ title: tab.title, text: '', words: 0 }); };
  });
}
