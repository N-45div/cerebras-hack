# Post drafts (Kimi K3.1 Pro Hackathon)

All numbers below were measured in the runs shown in the videos.

---

## 1. X: main post (attach `renders/tab-bankruptcy-film-final.mp4` as native video)

I had 135 tabs open. I was never going to read them.

So I told OpenClaw "declare tab bankruptcy" and Kimi K3.1 Pro on Cerebras read every tab, filed it, roasted me, and closed it.

135 tabs. 439,529 words. 30 hours of reading. Done in 12.5 seconds.

Same Kimi on Moonshot's own GPUs: 4.2× slower.

@Cerebras @Kimi_Moonshot #KimiOnCerebras

**Reply (the link goes in the reply, not the main post):**
Code + OpenClaw skill: https://github.com/N-45div/cerebras-hack

Kimi's diagnosis of my browser: "Chronic tabular accumulation with acute Wikipedia metastasis."

(All numbers from the run in the film: 135 real tabs, 12.5 s, 350 tok/s mean per call, 1,573 tok/s aggregate.
Kimi vs Kimi: 346 vs 83 tok/s median streamed, Cerebras vs Moonshot kimi-k3.1-pro-highspeed, src/kimi-race.mjs.)

---

## 2. Reddit r/Cerebras (flair: Kimi K3.1 Pro Hackathon; upload `renders/tab-bankruptcy-film-voiced.mp4` as the video)

**Title:** I declared tab bankruptcy: OpenClaw + Kimi K3.1 Pro on Cerebras read, roasted and closed my 135 tabs in 12.5 seconds

**Body:**
Built for the Kimi K3.1 Pro hackathon. Tab Bankruptcy is an OpenClaw skill. You tell your agent "I have way too many tabs open, declare tab bankruptcy", and it:

1. reads the text of every open tab (Chrome DevTools Protocol, about a second for 135 tabs),
2. sends them to Kimi K3.1 Pro on Cerebras in parallel: each tab gets a category, a one-line TL;DR, a keep / skim / let-go verdict and a roast,
3. closes each tab as its verdict lands, while a live dashboard counts down,
4. writes a digest: the overall roast, what's actually worth reading, and the one tab you'll regret closing. Every URL is saved to a file.

The run in the video was started from standard OpenClaw: 135 real tabs, 439,529 words (about 30 hours of reading), done in 12.5 seconds, 1,573 tok/s across the parallel calls.

Kimi vs Kimi: same model, same 8 tabs, same prompt, streamed. Kimi on Cerebras: 346 tok/s. Kimi on Moonshot's own highspeed GPU tier: 83 tok/s. 4.2x faster (median of 3 runs, first-to-last-token timing).

Its diagnosis of my browser: "Chronic tabular accumulation with acute Wikipedia metastasis."

Code and the OpenClaw skill: https://github.com/N-45div/cerebras-hack

---

## 3. Discord #share-your-demo (Speed Bounty), deadline Sun Nov 22, 6:00 PM

Attach `renders/santa-bounty-601.mp4` (47 s, recorded live; the middle is sped up 15x and labelled).

Speed Bounty entry: 601 TPS

**Project Name:** Santa's Speedy Shopper
**Team Members:** X: @YOUR_X_HANDLE · Reddit: u/YOUR_REDDIT_HANDLE
**Project Description:** OpenClaw with Kimi K3.1 Pro on Cerebras shops the open web for Santa: Kimi runs five web searches at once through context.dev, scrapes five real product pages in parallel to read each exact name and price, and answers with a checked list copied straight from those pages. Nothing is hard-coded: every gift, price and link comes from live search and scrape results during the run. Copying verified data instead of writing prose is what keeps Cerebras's decode fast.
**Demo Video:** attached (47 s, live run)
**GitHub Repository:** https://github.com/N-45div/cerebras-hack

**TPS:** 601 tok/s mean · 1,241 p90, the server-side readout from the official speed patch (OpenClaw 8b18b55 + patch, Kimi K3.1 Pro on Cerebras, reasoning low), on screen in the video.

**The 5 gifts** (software engineer who has everything, each under $100):
1. Keycap Set for Mechanical Keyboard · Amazon · $16.99 · https://www.amazon.com/Keycap-Set-for-Mechanical-Keyboard/dp/B07ZBVTWHP
2. The Container Store Artisan Rattan Cane Desktop Organizer · The Container Store · $15.99 · https://www.containerstore.com/s/office/desktop-collections/artisan-rattan-cane-desktop-collection/the-container-store-artisan-rattan-cane-desktop-organizer/123d?productId=11023414
3. Hario Range Server · Joe Coffee Company · $25.00 · https://joecoffeecompany.com/products/hario-range-server
4. Software Engineer Gifts Coffee Mug · Etsy · $13.00+ · https://www.etsy.com/listing/773119801/software-engineer-gifts-engineer-mugs
5. Anker Nano Power Bank (5K, MagGo, Slim) · Anker · $42.99 · https://www.anker.com/products/a1665-5k-ultra-slim-qi2-power-bank

(Backup entry if needed: renders/santa-bounty-423-final.mp4, 423 TPS, Shopify fast path.)
