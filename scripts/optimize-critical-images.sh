#!/usr/bin/env bash
# Rebuild web-sized JPEGs in asset/optimized/ from large source PNGs/JPGs.
# Run after replacing hero, card, play, or footer artwork.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/asset/optimized"
mkdir -p "$OUT"

compress() {
  local width="$1" src="$2" dst="$3"
  sips -s format jpeg -s formatOptions 82 --resampleWidth "$width" "$src" --out "$dst" >/dev/null
  echo "$(du -h "$dst" | awk '{print $1}')  $dst"
}

compress 1440 "$ROOT/asset/grassland.png" "$OUT/grassland.jpg"
compress 1440 "$ROOT/asset/water.png" "$OUT/water.jpg"
compress 1200 "$ROOT/asset/project-3-night-meadow-background.jpg" "$OUT/project-3-night-meadow-background.jpg"
compress 1200 "$ROOT/asset/project-4-green-background.jpg" "$OUT/project-4-green-background.jpg"
compress 1440 "$ROOT/asset/grass-footer.png" "$OUT/grass-footer.jpg"
compress 1440 "$ROOT/asset/grass-footer-dark.png" "$OUT/grass-footer-dark.jpg"
compress 900  "$ROOT/asset/dappled-tree.png" "$OUT/dappled-tree.jpg"
compress 1200 "$ROOT/asset/sunset.png" "$OUT/sunset.jpg"
compress 800  "$ROOT/asset/play_gradienttexture.png" "$OUT/play_gradienttexture.jpg"
compress 800  "$ROOT/asset/play_Zakir.png" "$OUT/play_Zakir.jpg"
compress 800  "$ROOT/asset/play_Turnip.png" "$OUT/play_Turnip.jpg"
compress 800  "$ROOT/asset/play_36DaysofType.png" "$OUT/play_36DaysofType.jpg"
compress 800  "$ROOT/asset/play_SpintheWheel.png" "$OUT/play_SpintheWheel.jpg"
compress 800  "$ROOT/asset/play_sero.png" "$OUT/play_sero.jpg"
compress 1200 "$ROOT/asset/flower valey.png" "$OUT/flower-valey.jpg"

echo "Done — optimized assets in asset/optimized/"
