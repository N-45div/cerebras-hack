# Post drafts (Kimi K3.1 Pro Hackathon)

All numbers below were measured in the runs shown in the videos.

---

## 1. X: main post (attach `renders/tab-bankruptcy-film.mp4` as native video)

I had 135 tabs open. I was never going to read them.

So I built Tab Bankruptcy: tell OpenClaw "declare tab bankruptcy" and Kimi K3.1 Pro on Cerebras reads every tab, files it, roasts you, and closes it.

135 tabs. 519,907 words. 36 hours of reading. Done in 39 seconds.

Every URL is saved. Nothing is truly lost. Except your dignity.

@Cerebras @Kimi_Moonshot #KimiOnCerebras

**Reply 1 (the link goes in the reply, not the main post):**
Code + OpenClaw skill: https://github.com/N-45div/cerebras-hack

**Reply 2 (attach `renders/race-clip.mp4`):**
Same 8 tabs, same prompt, two machines.
My laptop's RTX 5050 (Qwen3-8B): 48 tok/s.
Kimi K3.1 Pro on Cerebras: 415 tok/s. 8.6x faster decode, on a model far bigger than anything my laptop can hold.

**Reply 3 (the verdict, quote it):**
Kimi's diagnosis of my browser: "Chronic tabular hypertrophy with acute Wikipedia-induced curiosity cascades."

---

## 2. Reddit r/cerebras (flair: Kimi K3.1 Pro Hackathon)

**Title:** I declared tab bankruptcy: Kimi K3.1 Pro on Cerebras read, judged and closed my 135 tabs in 39 seconds

**Body:**
Built for the Kimi K3.1 Pro hackathon. Tab Bankruptcy is an OpenClaw skill: you tell your agent you have too many tabs, and it

1. reads the text of every open tab (Chrome DevTools Protocol, ~1 s for 135 tabs),
2. sends them to Kimi K3.1 Pro on Cerebras in parallel batches: each tab gets a category, a one-line TL;DR, a keep/skim/let-go verdict and a roast,
3. closes each tab as its verdict lands, while a live dashboard counts down,
4. writes a digest: the overall roast, what's actually worth reading, and the one tab you'll regret closing. Every URL is saved to a file.

The run in the video: 135 real tabs, 519,907 words (36.4 hours of reading), done in 38.9 s. Kimi decoded at 336 tok/s mean per call during peak hackathon load (the 14 s queue wait at the start is shown at 7x and labelled).

Same prompt, my laptop GPU vs Cerebras: RTX 5050 + Qwen3-8B 48 tok/s, Kimi K3.1 Pro on Cerebras 415 tok/s (8.6x), decode time measured server-side on both.

Its diagnosis of me: "Chronic tabular hypertrophy with acute Wikipedia-induced curiosity cascades."

Code: https://github.com/N-45div/cerebras-hack

---

## 3. Discord #share-your-demo (Speed Bounty), attach the Santa video

Speed Bounty entry: ___ TPS

Santa's Speedy Shopper on the patched OpenClaw build (8b18b55 + speed patch), Kimi K3.1 Pro on Cerebras, reasoning low. 5 real gifts from 5 real stores, links in the video and below:
1.
2.
3.
4.
5.
