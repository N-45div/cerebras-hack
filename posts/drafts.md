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

(No GPU comparison: organizers said comparisons must be Kimi K3 Pro vs Kimi K3 Pro only.
`renders/race-clip.mp4` compares Qwen3-8B, so it is NOT for posting.)

**Reply 2 (the verdict, quote it):**
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

Why the speed matters: 135 tabs is ~70K tokens of reading plus a judged, roasted verdict for every one. At typical GPU-serving speeds that's a coffee break; on Cerebras the tabs close while you watch.

Its diagnosis of me: "Chronic tabular hypertrophy with acute Wikipedia-induced curiosity cascades."

Code: https://github.com/N-45div/cerebras-hack

---

## 3. Discord #share-your-demo (Speed Bounty), deadline Sun Nov 22, 6:00 PM

Attach `renders/santa-bounty-423-final.mp4` (41 s, recorded live; the waiting is sped up 3x and labelled).

Speed Bounty entry: 423 TPS

**Project Name:** Santa's Speedy Shopper (fast path)
**Team Members:** X: @YOUR_X_HANDLE · Reddit: u/YOUR_REDDIT_HANDLE
**Project Description:** OpenClaw with Kimi K3.1 Pro on Cerebras shops like a speedrunner: in a single turn it queries five real stores' own live Shopify product search in parallel, then picks one available gift under $100 from each and copies back the exact title, price and product link. Nothing is hard-coded: the stores, queries and products are Kimi's own choices from live results. Copying structured results instead of writing prose keeps Cerebras's decode fast.
**Demo Video:** attached (41 s, live run)
**GitHub Repository:** https://github.com/N-45div/cerebras-hack

**TPS:** 423 tok/s mean · 569 p90, the server-side readout from the official speed patch (OpenClaw 8b18b55 + patch, Kimi K3.1 Pro on Cerebras, reasoning low), on screen in the video.

**The 5 gifts** (software engineer who has everything, each under $100):
1. Analog Daily Focus Kit (Walnut) · Ugmonk · $69.00 · https://ugmonk.com/products/analog-starter-kit
2. Key Organizer Pro Leather · Orbitkey · $48.67 · https://orbitkey.com/products/key-organiser-pro
3. Metrolog Ruler · Craighill · $98.00 · https://craighill.co/products/metrolog-ruler
4. Keychron Q1 QMK Custom Mechanical Keyboard (Version 2) · Keychron · $59.99 · https://keychron.com/products/keychron-q1
5. AeroPress Coffee Maker - Go Plus · AeroPress · $89.95 · https://aeropress.com/products/aeropress-go-plus

(If the watcher records a faster live run before the deadline, swap in its video, TPS and gifts.)
