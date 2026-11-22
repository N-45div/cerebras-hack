# Santa's Speedy Shopper: how the Speed Bounty runs work

The Speed Bounty measures tokens per second with the [official OpenClaw speed patch](https://github.com/wkasekende/openclaw-speed-patch): the mean, over every model response in the session, of each response's server-side decode speed (Cerebras's `completion_tokens / time_info.completion_time`). Everything below uses that patch on an unmodified OpenClaw `8b18b55`, with Kimi K3.1 Pro on Cerebras.

## Rules we hold ourselves to

- No changes to OpenClaw or to the speed patch. Only OpenClaw's own configuration and the prompt.
- No proxy or middleware between OpenClaw and Cerebras. Requests and responses pass untouched.
- No padding the session with tiny calls to raise the average.
- No preset products, product URLs or cached results. Every product comes from a live fetch during the recorded run.
- Every run is recorded live from a fresh chat; any sped-up part of a video is labelled on screen.
- Every reported run is checked afterwards: `verify-picks.mjs` / `verify-run.mjs` read the run's OpenClaw transcript and confirm that each picked product's name, price and link appear in the data that run fetched.

## What we learned about speed

Measured with `tools/bench/tps-lab*.mjs` (server-side decode, Kimi K3.1 Pro on Cerebras):

| What Kimi writes | tok/s |
|---|---|
| Free-form reasoning or prose | ~380-470 |
| A list with one creative line per item | ~370-465 |
| A list copied from structured data | 725-1,207 |

Cerebras uses speculative decoding, so predictable text (copying titles, prices and URLs that are already in the context) decodes much faster than new prose. And because the patch averages per response, every short tool-call turn (mostly reasoning) pulls the mean down.

## The approaches, in order

| Approach | Who chooses the stores and searches | Model responses | Best readout |
|---|---|---|---|
| 1. Shopify store search through the `web_fetch` tool, then answer | Kimi | 2-3 | 477 mean (423 recorded live) |
| 2. **Open-web search and scrape through context.dev (MCP tools), then answer** | **Kimi** | 3 | **601 mean · 1,241 p90**, live, all 5 picks verified. **Our entry.** |
| 3. Link understanding: one model call | the prompt | 1 | not used (below) |

Our entry is approach 2 because it is the agent doing the shopping: Kimi decides what to search for, which pages to open and which gifts to pick.

### Approach 3, tried and not used: one model call with OpenClaw link understanding

We built this and decided not to enter it. It reaches its speed by having the **prompt** name the five stores and search terms, so OpenClaw fetches them before Kimi runs and Kimi only copies the results back. That is legal under the rules, but the agent no longer chooses anything, which is not the demo we want to make. (In our one test the fetched results also did not reach the model, so it never produced a run.) It is documented here so the trade-off is visible:

OpenClaw has a built-in feature, [link understanding](https://github.com/openclaw/openclaw) (`tools.links`): before the agent runs, it fetches the URLs in the user's message itself (through its SSRF-guarded fetcher) and pipes each page into a configured CLI processor; the processor's output is added to the conversation.

- The prompt (`prompts/santa-links.txt`) names five stores' own live product **searches** (Shopify `search/suggest.json` URLs with a query such as `keyboard` or `coffee`). It names no products.
- `link-products.mjs` is the processor. It turns each store's live JSON into one plain line per product: title, store, US price, stock, link. It invents nothing; an empty search prints nothing.
- Kimi then answers in a single response: it copies the live product lines into a checked list and picks one in-stock gift under $100 per store. No tool calls means no slow intermediate turns, and the answer is mostly copying, the shape Cerebras decodes fastest.

OpenClaw configuration used (patched build's state directory):

```json5
{
  tools: {
    profile: "minimal",           // Kimi gets no tools in this mode: one response, no tool turns
    alsoAllow: [],
    links: {
      enabled: true,
      maxLinks: 5,
      timeoutSeconds: 20,
      models: [{ type: "cli", command: "node", args: ["<repo>/tools/santa/link-products.mjs"] }],
    },
  },
  agents: { defaults: {
    model: { primary: "cerebras/moonshotai-kimi-k3.1-pro-trial" },
    thinkingDefault: "low",       // Kimi always reasons; low is the minimum
    models: { "cerebras/moonshotai-kimi-k3.1-pro-trial": { params: { temperature: 0 } } },
  } },
  skills: { workshop: { autonomous: { mode: "off" } } },  // no background self-learning runs
}
```

## Reproduce

1. Build OpenClaw `8b18b55` with the official speed patch (see its README) and point it at Kimi K3.1 Pro on Cerebras.
2. Apply the configuration above.
3. Open the web chat, start a new conversation, paste `prompts/santa-links.txt`.
4. `tools/santa/santa-watch.mjs --prompt tools/santa/prompts/santa-links.txt` automates this: it waits for a quiet Cerebras queue, records the run live from the page and reads the readout.
5. `OPENCLAW_STATE_DIR=<state dir> node tools/santa/verify-run.mjs <session-id-prefix>` checks every pick against the run's fetched data.

During the hackathon the shared endpoint was heavily congested (queues of 30-140 s and frequent 429s). OpenClaw retries a call up to 10 times and then gives up, so many attempts never completed; the watcher simply tries again at the next quiet moment.
