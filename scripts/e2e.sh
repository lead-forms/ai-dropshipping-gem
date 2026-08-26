#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
for n in 1 2 3 4; do ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=$(case $n in 1) echo 6c5ce7;;2) echo 00b894;;3) echo e17055;;*) echo 0984e3;;esac):s=720x1280:d=3" -vf "drawtext=text='SOURCE $n':fontcolor=white:fontsize=62:x=(w-text_w)/2:y=(h-text_h)/2" -an -c:v libx264 -pix_fmt yuv420p "$work/source$n.mp4"; done
printf '{"clips":[{"path":"%s/source1.mp4"},{"path":"%s/source2.mp4"},{"path":"%s/source3.mp4"},{"path":"%s/source4.mp4"}]}' "$work" "$work" "$work" "$work" > "$work/manifest.json"
bash "$root/scripts/render.sh" "$work/manifest.json" "$work/result.mp4"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$work/result.mp4" | awk '{if($1<7||$1>15)exit 1}'
test "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$work/result.mp4")" = "1080,1920"
cp "$work/result.mp4" "$root/e2e-result.mp4"
echo "E2E_OK $root/e2e-result.mp4"
