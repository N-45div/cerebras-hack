#!/usr/bin/env node
// Recovers an MP4 that ffmpeg never finalized (no moov atom): reads the length-prefixed
// H.264 NAL units from its mdat, prefixes the SPS/PPS of a reference file encoded with the
// same settings, and writes an Annex-B stream that ffmpeg can remux.
//   node src/recover-mp4.mjs broken.mp4 reference.mp4 out.h264
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [broken, reference, out] = process.argv.slice(2);
const buf = readFileSync(broken);

// Find the mdat box (after ftyp/free).
let off = 0, mdatStart = -1, mdatEnd = buf.length;
while (off + 8 <= buf.length) {
  let size = buf.readUInt32BE(off);
  const type = buf.toString('latin1', off + 4, off + 8);
  let header = 8;
  if (size === 1) { size = Number(buf.readBigUInt64BE(off + 8)); header = 16; }
  if (type === 'mdat') { mdatStart = off + header; mdatEnd = size === 0 ? buf.length : Math.min(buf.length, off + size); break; }
  if (size === 0) break;
  off += size;
}
if (mdatStart < 0) throw new Error('no mdat box');

// SPS/PPS (Annex-B) from the reference's first frame.
const ref = execFileSync('ffmpeg', ['-v', 'error', '-i', reference, '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-frames:v', '1', '-f', 'h264', '-'], { maxBuffer: 64 << 20 });
const start = Buffer.from([0, 0, 0, 1]);
const header = [];
for (let i = 0; i < ref.length - 4; i++) {
  if (ref[i] === 0 && ref[i + 1] === 0 && ref[i + 2] === 0 && ref[i + 3] === 1) {
    const t = ref[i + 4] & 0x1f;
    let j = i + 4; while (j < ref.length - 4 && !(ref[j] === 0 && ref[j + 1] === 0 && ref[j + 2] === 0 && ref[j + 3] === 1)) j++;
    if (t === 7 || t === 8) header.push(start, ref.subarray(i + 4, j === ref.length - 4 ? ref.length : j));
  }
}

const parts = [...header];
let p = mdatStart, nals = 0;
while (p + 4 <= mdatEnd) {
  const len = buf.readUInt32BE(p);
  if (len <= 0 || p + 4 + len > mdatEnd) break; // truncated tail
  const t = buf[p + 4] & 0x1f;
  if (t !== 7 && t !== 8) { parts.push(start, buf.subarray(p + 4, p + 4 + len)); nals++; }
  p += 4 + len;
}
writeFileSync(out, Buffer.concat(parts));
console.log(`recovered ${nals} NAL units (${((p - mdatStart) / 1e6).toFixed(1)} MB of ${((mdatEnd - mdatStart) / 1e6).toFixed(1)} MB)`);
