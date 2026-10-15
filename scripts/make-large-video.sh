#!/usr/bin/env bash
# A 90 second portrait video of about 200 MB, for the opt-in upload test (acceptance criteria 6 and 7).
# Noise keeps the bitrate up so the file is the size a phone would make. Not committed: made on demand.
set -euo pipefail
out="${1:-.cache/media/large-video.webm}"
mkdir -p "$(dirname "$out")"
[ -s "$out" ] && { ls -la "$out"; exit 0; }
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1080x1920:rate=30,noise=alls=12:allf=t" \
  -f lavfi -i "sine=frequency=220:sample_rate=48000,volume=2" \
  -t 89.9 -c:v libvpx -b:v 18M -minrate 18M -maxrate 18M -bufsize 18M -deadline realtime -cpu-used 8 \
  -c:a libopus -b:a 64k "$out"
ls -la "$out"
