#!/usr/bin/env node
// Adds an ElevenLabs voiceover to the demo videos: each narration line is synthesized,
// fitted to its time window (sped up at most 15% if it runs long), placed at its start
// time, and mixed into an AAC track muxed onto the video (video stream copied untouched).
//   node src/voiceover.mjs [film|santa ...]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const cfg = JSON.parse(readFileSync(join(ROOT, 'voice', 'narration.json'), 'utf8'));
const KEY = (readFileSync(join(ROOT, '.env'), 'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('ELEVENLABS_API_KEY missing from .env'); process.exit(1); }
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cfg.videos);
const dir = join(ROOT, 'voice', 'lines');
mkdirSync(dir, { recursive: true });
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

async function tts(text, file) {
  if (existsSync(file)) return; // cached: re-runs don't spend credits again
  for (const model of [cfg.model, 'eleven_v3', 'eleven_multilingual_v2']) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
    });
    if (res.ok) { writeFileSync(file, Buffer.from(await res.arrayBuffer())); console.log(`  tts ok (${model}): ${text.slice(0, 50)}…`); return; }
    const err = await res.text();
    console.log(`  ${model} refused (${res.status}): ${err.slice(0, 160)}`);
  }
  throw new Error('no model could synthesize: ' + text);
}

for (const name of which) {
  const v = cfg.videos[name];
  console.log(`\n${name}: ${v.lines.length} lines`);
  const videoLen = dur(join(ROOT, v.in));
  const parts = [];
  for (const [k, line] of v.lines.entries()) {
    const raw = join(dir, `${name}-${k + 1}.mp3`);
    await tts(line.text, raw);
    const d = dur(raw);
    const window = line.until - line.at;
    const tempo = d > window ? Math.min(1.15, d / window) : 1;
    const fitted = d / tempo;
    console.log(`  line ${k + 1}: ${d.toFixed(2)}s into a ${window.toFixed(1)}s window${tempo > 1 ? ` (x${tempo.toFixed(2)})` : ''}${fitted > window + 0.05 ? `  ** still ${(fitted - window).toFixed(2)}s long: shorten the text **` : ''}`);
    parts.push({ file: raw, at: line.at, tempo });
  }
  // Mix: each line delayed to its start, optional tempo, then summed and padded to the video length.
  const inputs = parts.flatMap((p) => ['-i', p.file]);
  const chains = parts.map((p, i) => `[${i + 1}:a]${p.tempo > 1 ? `atempo=${p.tempo.toFixed(3)},` : ''}adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`).join(';');
  const mix = `${chains};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,apad,atrim=0:${videoLen.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ROOT, v.in), ...inputs, '-filter_complex', mix,
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', join(ROOT, v.out)]);
  console.log(`  saved ${v.out} (${dur(join(ROOT, v.out)).toFixed(1)}s)`);
}
