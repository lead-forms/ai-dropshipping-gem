#!/usr/bin/env bash
set -euo pipefail
manifest="${1:?manifest json required}"; output="${2:?output mp4 required}"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mapfile -t clips < <(node -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1])); for(const c of m.clips) console.log(c.path)" "$manifest")
if ((${#clips[@]} < 2)); then echo 'at least two clips required' >&2; exit 2; fi
list="$work/list.txt"; : > "$list"
for f in "${clips[@]}"; do ffmpeg -hide_banner -loglevel error -y -i "$f" -an -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" -t 2.4 -c:v libx264 -preset veryfast -pix_fmt yuv420p "$work/$(basename "$f").mp4"; printf "file '%s'\n" "$work/$(basename "$f").mp4" >> "$list"; done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -f lavfi -i "sine=frequency=180:sample_rate=44100" -filter_complex "[1:a]volume=0.035,afade=t=in:st=0:d=0.5[a]" -map 0:v -map '[a]' -shortest -c:v copy -c:a aac -movflags +faststart "$output"
