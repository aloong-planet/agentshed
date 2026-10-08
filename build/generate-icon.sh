#!/bin/bash
# Rebuild the macOS bundle icon from the canonical transparent production PNG.
set -euo pipefail
cd "$(dirname "$0")"
ICON_TMP=$(mktemp -d)
trap 'rm -rf "$ICON_TMP"' EXIT
mkdir "$ICON_TMP/icon.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" icon.png --out "$ICON_TMP/icon.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" icon.png --out "$ICON_TMP/icon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICON_TMP/icon.iconset" -o icon.icns
