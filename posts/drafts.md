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

## 3. Discord #share-your-demo (Speed Bounty), attach the Santa video

(attach `renders/santa-session-477.mp4`: the finished session with the 477 readout.
Fallback: `renders/santa-bounty-391.mp4`, the run recorded live; its gifts are listed under "391 run" below.)

Speed Bounty entry: 477 TPS

TPS: 477 tok/s mean · 760 p90, the server-side readout from the official speed patch, on screen in the video.
Cerebras was overloaded, so OpenClaw paused the run on 429s and resumed it automatically once capacity came back; Kimi then finished the list in 7 seconds.

The 5 gifts (software engineer who has everything, each under $100):
1. Metrolog Ruler · Craighill · $98.00 · https://www.craighill.co/products/metrolog-ruler
2. Hybrid Laptop Sleeve v2 · Orbitkey · $59.92 · https://www.orbitkey.com/products/hybrid-laptop-sleeve-v2
3. Keychron M6 Wireless Mouse · Keychron · from $38.24 · https://www.keychron.com/products/keychron-m6-wireless-mouse
4. Valet Tray (Maple, Medium) · Ugmonk · $79.00 · https://ugmonk.com/products/valet-tray-maple-medium
5. Cubelet · TOM BIHN · $25.00 · https://www.tombihn.com/products/cubelet

---- 391 run (recorded live, fallback) ----

Speed Bounty entry: 391 TPS

Project: Santa's Speedy Shopper, fast path. OpenClaw (8b18b55 + official speed patch) with Kimi K3.1 Pro on Cerebras, reasoning low. Instead of scraping search pages, Kimi queries five real stores' own live Shopify product search in parallel in one turn, picks one available gift under $100 from each, and replies with the list. Nothing is hard-coded: stores, queries and products are Kimi's choices from live results.

TPS: 391 tok/s mean · 476 p90, the server-side readout from the speed patch (shown in the video). The middle of the video is fast-forwarded 12x and labelled: it's Cerebras queue retries during the overload.

The 5 gifts (software engineer who has everything, each under $100):
1. Keychron Desk Mat · Keychron · $19.99 · https://www.keychron.com/products/keychron-desk-mat
2. Nest v2 · Orbitkey · $93.67 · https://www.orbitkey.com/products/nest-v2
3. Slim Pouch 2 · Aer · $49.00 · https://www.aersf.com/products/slim-pouch-2
4. Valet Tray (Maple, Medium) · Ugmonk · $79.00 · https://ugmonk.com/products/valet-tray-maple-medium
5. AeroPress Coffee Maker, Original · AeroPress · $39.95 · https://aeropress.com/products/aeropress-coffee-maker

GitHub: https://github.com/N-45div/cerebras-hack
