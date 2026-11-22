---
name: tab-bankruptcy
description: "Declare tab bankruptcy: read every open browser tab, summarize and roast it with Kimi K3.1 Pro on Cerebras, close them all, and return a digest of what was worth reading. Use when the user says they have too many tabs, wants to declare tab bankruptcy, or wants their tabs cleaned up."
metadata: { "openclaw": { "emoji": "🦞" } }
---

# Tab Bankruptcy

The user has too many browser tabs. This skill reads every tab in the Tab Bankruptcy
browser (a dedicated Chrome profile, never the user's main browser), files each one,
closes it, and produces a digest. Every URL is saved, so nothing is truly lost.

## How to run

1. Run this command in a shell (it takes ~10-40 seconds; do not interrupt it):

   ```
   node {repo}/src/bankrupt.mjs --auto
   ```

   A live dashboard opens in the Tab Bankruptcy browser while tabs close.

2. The command prints a markdown summary to stdout: headline, stats, the roast,
   tabs actually worth reading, the one they'll regret closing, and the paths of the
   saved digest and URL archive.

3. Reply to the user with:
   - the headline in bold,
   - one line of stats (tabs closed, words read, hours of reading, seconds taken),
   - the roast, verbatim,
   - the "actually worth reading" links as a short list,
   - the "one you'll regret closing" line,
   - a final line: "Every URL is saved: <run json path>".

Keep it punchy. Do not add commentary beyond what the summary contains.

## Options

- If the user wants a dry run without closing tabs: add `--no-close`.
- If the user wants only some tabs handled: add `--limit N`.
- If the user has no tabs open yet, they can fill the browser with
  `node {repo}/src/seed.mjs`.
