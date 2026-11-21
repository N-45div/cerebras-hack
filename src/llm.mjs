// Cerebras chat client: model fallback, retries, and server-side speed stats.
import { config } from './config.mjs';

let activeModel = null;
export const stats = { calls: 0, outputTokens: 0, decodeSeconds: 0, perCallTps: [] };

export const getActiveModel = () => activeModel || config.models[0];

export function speedSummary() {
  const r = stats.perCallTps;
  const mean = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  const sorted = [...r].sort((a, b) => a - b);
  const p90 = sorted.length ? sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)] : 0;
  return { calls: stats.calls, outputTokens: stats.outputTokens, meanTps: Math.round(mean), p90Tps: Math.round(p90) };
}

async function callOnce(model, body) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Note: Kimi K3.1 Pro on Cerebras always reasons; 'low' is the minimum. Reasoning
// tokens share max_tokens with the answer, so budgets must cover both.
export async function chat(messages, { maxTokens = 800, json = false, temperature = 0.7,
  reasoningEffort = process.env.REASONING_EFFORT || 'low' } = {}) {
  const body = { messages, max_tokens: maxTokens, temperature };
  if (json) body.response_format = { type: 'json_object' };
  if (reasoningEffort && reasoningEffort !== 'off') body.reasoning_effort = reasoningEffort;

  const candidates = activeModel ? [activeModel] : config.models;
  let lastErr;
  for (const model of candidates) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { status, data } = await callOnce(model, body);
      if (status === 400 && /reasoning effort/i.test(data.message || '') && body.reasoning_effort) {
        delete body.reasoning_effort; // model (e.g. a fallback) doesn't support it
        attempt--;
        continue;
      }
      if (status === 200 && data.choices) {
        if (!activeModel) {
          activeModel = model;
          console.error(`[llm] using model: ${model}`);
        }
        const out = data.usage?.completion_tokens || 0;
        const secs = data.time_info?.completion_time || 0;
        const tps = secs > 0 ? out / secs : 0;
        stats.calls++;
        stats.outputTokens += out;
        stats.decodeSeconds += secs;
        if (tps) stats.perCallTps.push(tps);
        return { text: data.choices[0].message?.content || '', tokens: out, tps, model };
      }
      lastErr = `${status} ${data.code || ''} ${data.message || JSON.stringify(data).slice(0, 200)}`;
      if (data.code === 'model_not_found' || status === 404 || status === 403) break; // next model
      if (status === 429 || status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 300));
        continue;
      }
      break;
    }
  }
  throw new Error(`LLM call failed: ${lastErr}`);
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Model did not return JSON: ' + text.slice(0, 200));
  }
}

// Tiny concurrency limiter.
export function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
