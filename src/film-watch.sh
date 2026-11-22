#!/usr/bin/env bash
# Waits for a quiet Cerebras queue, then records the real main-film take:
# seed 135 tabs, let them load, then record-film.mjs (OpenClaw chat -> dashboard -> reply).
cd "$(dirname "$0")/.."
for i in $(seq 1 120); do
  line=$(node src/probe.mjs 2>/dev/null | grep -o "wait ~[0-9.]*s" | grep -o "[0-9.]*")
  echo "$(date +%H:%M:%S) probe wait: ${line:-failed}"
  if [ -n "$line" ] && awk "BEGIN{exit !($line < ${QUIET:-8})}"; then
    echo "$(date +%H:%M:%S) quiet: seeding tabs"
    node src/seed.mjs | tail -1
    sleep 25
    echo "$(date +%H:%M:%S) recording"
    node src/record-film.mjs --out renders/film-take-$(date +%H%M).mp4
    exit 0
  fi
  sleep 120
done
