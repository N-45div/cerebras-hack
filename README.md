# 🦞 Tab Bankruptcy

**Tell OpenClaw you have too many tabs. Kimi K3.1 Pro on Cerebras reads every one, files it, judges it, roasts you, and closes it.** Every URL is saved, so nothing is truly lost.

Built in 24 hours for the Cerebras × Kimi K3.1 Pro × OpenClaw hackathon.

| Run shown in the demo film | |
|---|---|
| Triggered from | standard OpenClaw 2026.11.3, one chat message |
| Tabs read, judged and closed | **135** (439,529 words, about 30 hours of reading) |
| Wall time | **12.5 s** |
| Kimi calls | 35 in parallel, **1,573 tok/s aggregate**, 350 tok/s mean per call (server-side) |
| Same model, Kimi vs Kimi | Cerebras **346 tok/s** vs Moonshot's own highspeed GPU tier 83 tok/s: **4.2× faster** |

Kimi's verdict on that browser: *"Your browser is a startup with no shipping date."*

## How it works

```
"I have way too many tabs open.        OpenClaw agent (Kimi K3.1 Pro on Cerebras)
 Declare tab bankruptcy."  ───────────▶ picks the tab-bankruptcy skill
                                         └─ runs: node src/bankrupt.mjs --auto
                                              │
   dedicated Chrome profile ◀── DevTools ─────┤ 1. read the text of every open tab (~1 s for 135)
   (never your main browser)    Protocol      │ 2. batch the tabs to Kimi on Cerebras, all calls in flight at once
                                              │    → category, TL;DR, keep / skim / let go, roast
   live dashboard (SSE) ◀─────────────────────┤ 3. close each tab as its verdict lands
                                              │ 4. digest: overall roast, what's worth reading, the one you'll regret
                                              └─ saves every URL + verdict to out/run-*.json and an HTML digest
```

- **Zero dependencies.** Node 24 and Chrome; Kimi is called over the OpenAI-compatible Cerebras API with `fetch`.
- **Speed is measured, not estimated.** Every call's `completion_tokens / time_info.completion_time` comes from the Cerebras server; the dashboard shows the mean per call and the aggregate across parallel calls.
- **Honest under load.** During the hackathon the endpoint was congested (30-60 s queues, 429s). The client retries the same model and never silently switches models, so every number is Kimi's.

## Quick start

Requirements: Node 24+, Google Chrome, a Cerebras API key with Kimi K3.1 Pro access, and [OpenClaw](https://github.com/openclaw/openclaw) for the agent flow.

```bash
cp .env.example .env          # then put your CEREBRAS_API_KEY in .env
npm run seed                  # opens ~135 real tabs from data/tabs.txt in a dedicated Chrome profile
npm start                     # opens the dashboard; press DECLARE TAB BANKRUPTCY
```

### Through OpenClaw (how the demo was recorded)

```bash
npm run install-skill         # installs skills/tab-bankruptcy with this checkout's path
openclaw skills list          # tab-bankruptcy should show as ready
```

Point OpenClaw at Kimi K3.1 Pro on Cerebras (provider `cerebras`, model `moonshotai-kimi-k3.1-pro-trial`, base URL `https://api.cerebras.ai/v1`), then tell it: *"I have way too many tabs open. Declare tab bankruptcy."*

Options the skill knows: `--no-close` (dry run), `--limit N` (only N tabs). `npm run probe` tells you whether the Cerebras queue is quiet enough to record.

## Repository layout

| Path | What it is |
|---|---|
| `src/bankrupt.mjs` | The engine: reads tabs, batches them to Kimi, closes tabs, serves the live dashboard, writes the digest |
| `src/llm.mjs` | Cerebras chat client: retries on overload without switching models, records server-side speed |
| `src/chrome.mjs` | Chrome DevTools Protocol helpers for the dedicated profile |
| `src/seed.mjs`, `data/tabs.txt` | Fill the browser with real tabs for a demo |
| `src/probe.mjs` | Three tiny calls: queue wait and decode speed right now |
| `web/dashboard.html` | Live dashboard: favicon wall, tabs closing, speed tiles, digest |
| `skills/tab-bankruptcy/SKILL.md` | The OpenClaw skill (template; `npm run install-skill` fills in the path) |
| `tools/bench/` | Kimi-vs-Kimi race and the decode-speed experiments |
| `tools/santa/` | Speed Bounty entry: Santa's Speedy Shopper |
| `tools/video/` | Page-only screen recorders, film tooling and the ElevenLabs voiceover |
| `posts/drafts.md` | X, Reddit and Discord post texts |

## Kimi vs Kimi

`tools/bench/kimi-race.mjs` sends the same Tab Bankruptcy prompt (8 real tabs) to Kimi K3.1 Pro on Cerebras and on Moonshot's own platform (`kimi-k3.1-pro-highspeed` and `kimi-k3.1-pro`), all streamed at temperature 1. Speed uses the hackathon's formula, *(output tokens − 1) / (last token time − first token time)*, measured the same way for every lane; median of 3 runs. Every chunk's arrival time is saved, and `web/kimi-race.html` replays the real streams side by side.

| Kimi K3.1 Pro served by | Median tok/s | Runs |
|---|---|---|
| **Cerebras** | **346** | 384 / 339 / 346 |
| Moonshot, highspeed tier | 83 | 83 / 94 / 78 |
| Moonshot, standard tier | 35 | 34 / 35 / 35 |

Time to first token was worse on Cerebras during the hackathon (about 6 s of queueing versus about 3 s), and the race page says so. Responses that arrive in one burst instead of a stream are discarded rather than counted.

### What makes Kimi decode faster on Cerebras

`tools/bench/tps-lab*.mjs` measured server-side decode speed for different output shapes. Cerebras's speculative decoding rewards predictable text:

| Output | tok/s |
|---|---|
| Kimi's free-form reasoning, creative prose | ~380-470 |
| A list with one creative line per item | ~370-465 |
| A list copied from structured data | 725-1,207 |

The verdicts in Tab Bankruptcy are creative writing, so the engine's per-call speed sits around 350-450; what makes the run feel instant is sending all 35 calls at once.

## Speed Bounty: Santa's Speedy Shopper

Five real Christmas gifts for a software engineer, each under $100, from five real stores, found by OpenClaw with Kimi K3.1 Pro on Cerebras and measured with the [official speed patch](https://github.com/wkasekende/openclaw-speed-patch) (OpenClaw `8b18b55` + patch).

**751 tok/s mean · 978 p90 (server)**, from a live recorded run (Tool Search off; Kimi chose every gift idea, search, store and pick):

1. Kimi runs 5 web searches at once through [context.dev](https://context.dev) (OpenClaw MCP, only the `web-search` and `web-scrape` tools exposed).
2. It scrapes real product pages in parallel to read each exact name and price.
3. It answers with a checked list copied straight from those pages, which is the fastest shape for Cerebras to decode.

Our transcripts showed Kimi's reasoning decodes about 3x slower than the rest of its output, so the prompt (`tools/santa/prompts/santa-go.txt`) asks Kimi to work on instinct and think only "Go" before each step. That and every other speed-motivated line is disclosed in [METHODOLOGY.md](tools/santa/METHODOLOGY.md). The previous entry read 640 tok/s mean with the same tools.

Nothing is hard-coded, and the prompt names no stores or search terms. `tools/santa/verify-picks.mjs` reads the run's OpenClaw transcript and checks that every picked product's name, price and link appear in the tool results that run received; all 5 verified, and all 5 links were live afterwards.

```bash
node tools/santa/santa-watch.mjs --prompt tools/santa/prompts/santa-go.txt   # waits for a quiet queue, records a live run
OPENCLAW_STATE_DIR=<patched-openclaw-state> node tools/santa/verify-picks.mjs <session-id-prefix>
```

An earlier variant (`tools/santa/prompts/santa.txt`) searched stores' own live Shopify catalogues instead of the open web; its best completed run read 477 tok/s mean.

## Making the demo videos

- `tools/video/record-film.mjs` records the real run end to end from the DevTools screencast (page only, 1920×1080, no desktop or notifications): the OpenClaw chat, the dashboard it opens, then the agent's reply.
- `tools/video/record-page.mjs` records a local page (used for the Kimi-vs-Kimi race replay).
- The film was cut with [cerebras-video-demos](https://github.com/wkasekende/cerebras-video-demos) (intro, the real clip, claim, lockup). Any waiting that was sped up is labelled on screen.
- `tools/video/voiceover.mjs` voices `tools/video/narration.json` with ElevenLabs and places each line at its moment in the video.
- `tools/video/recover-mp4.mjs` rebuilds a recording whose encoder was stopped before finishing the file.

## Notes

- API keys live only in `.env` (gitignored). `.env.example` lists every variable.
- The engine drives a **dedicated Chrome profile** on its own debugging port, never your everyday browser, and skips local app tabs (such as the OpenClaw chat that triggered it).
- Every run writes `out/run-<time>.json` (every URL, verdict and stat) and `out/digest-<time>.html`.
