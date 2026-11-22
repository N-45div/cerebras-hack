// Minimal .env loader + shared config (zero dependencies).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const config = {
  apiKey: process.env.CEREBRAS_API_KEY,
  baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
  // Primary model first; fallbacks are used only if the primary is unavailable.
  models: [
    process.env.CEREBRAS_MODEL || 'moonshotai-kimi-k3.1-pro-test',
    ...(process.env.CEREBRAS_FALLBACK_MODELS || 'gpt-oss-120b')
      .split(',').map((s) => s.trim()).filter(Boolean),
  ],
  chromePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  cdpPort: Number(process.env.CDP_PORT || 9333),
  dashboardPort: Number(process.env.DASHBOARD_PORT || 4747),
  // All batches go out at once: under load the server queue wait dominates, so one wave is fastest.
  concurrency: Number(process.env.LLM_CONCURRENCY || 64),
  batchSize: Number(process.env.TABS_PER_CALL || 8), // 8 per call + copied title/url: ~445 vs ~350 tok/s per call (src/tps-lab3.mjs)
};

if (!config.apiKey) {
  console.error('Missing CEREBRAS_API_KEY (put it in .env)');
  process.exit(1);
}
