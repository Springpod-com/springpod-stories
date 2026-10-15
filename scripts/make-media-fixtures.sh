#!/usr/bin/env bash
# Generates the small media files used by the worker and end-to-end tests (tests/fixtures/media).
# WebM and Ogg because the Chromium that Playwright drives doesn't play H.264 or AAC.
set -euo pipefail
out="${1:-tests/fixtures/media}"
mkdir -p "$out"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
vp8=(-c:v libvpx -b:v 100k -deadline realtime -cpu-used 8 -c:a libopus -b:a 48k)

# Portrait 720 x 1280, 12 seconds, clear picture and steady sound: passes every check.
ff -f lavfi -i "testsrc2=size=720x1280:rate=24" -f lavfi -i "sine=frequency=220:sample_rate=48000,volume=2" -t 12 "${vp8[@]}" "$out/good-video.webm"
# Too dark: warns on lighting.
ff -f lavfi -i "testsrc2=size=720x1280:rate=24,eq=brightness=-0.6" -f lavfi -i "sine=frequency=220:sample_rate=48000,volume=2" -t 12 "${vp8[@]}" "$out/dark-video.webm"
# Five seconds: fails on length.
ff -f lavfi -i "testsrc2=size=720x1280:rate=24" -f lavfi -i "sine=frequency=220:sample_rate=48000,volume=2" -t 5 "${vp8[@]}" "$out/short-video.webm"
# A silent soundtrack: fails on sound.
ff -f lavfi -i "testsrc2=size=720x1280:rate=24" -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=48000" -t 12 "${vp8[@]}" "$out/silent-video.webm"
# A 25 second voice note with clear sound: passes.
ff -f lavfi -i "sine=frequency=180:sample_rate=48000,volume=2" -t 25 -c:a libopus -b:a 32k "$out/good-voice.ogg"
# Barely audible: fails on volume.
ff -f lavfi -i "sine=frequency=180:sample_rate=48000,volume=0.25" -t 25 -c:a libopus -b:a 32k "$out/quiet-voice.ogg"
# Not media at all.
printf 'This is not a video.\n' > "$out/not-media.txt"
ls -la "$out"
