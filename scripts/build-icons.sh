#!/usr/bin/env bash
# Maintainer tool, not something a user ever runs: rasterises the icon sources into
# the PNGs the web app manifest needs and the .icns the macOS launcher bundle uses.
#
# The outputs are committed, so this only has to run when an icon source changes.
# Needs macOS: sips reads SVG and iconutil packs the .icns.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script needs macOS (sips + iconutil)." >&2
  exit 1
fi

PUBLIC="frontend/public"
SRC_MARK="$PUBLIC/favicon.svg"
SRC_MASKABLE="assets/icons/icon-maskable.svg"
SRC_APP="assets/icons/app-icon.svg"

render() {
  local src="$1" size="$2" out="$3"
  sips -s format png --resampleHeightWidth "$size" "$size" "$src" --out "$out" >/dev/null
}

echo "Web app icons…"
render "$SRC_MARK" 192 "$PUBLIC/icon-192.png"
render "$SRC_MARK" 512 "$PUBLIC/icon-512.png"
# Safari's "Add to Dock" reads the apple-touch-icon before the manifest.
render "$SRC_MARK" 180 "$PUBLIC/apple-touch-icon.png"
render "$SRC_MASKABLE" 512 "$PUBLIC/icon-maskable-512.png"

echo "macOS app icon…"
ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  render "$SRC_APP" "$size" "$ICONSET/icon_${size}x${size}.png"
  render "$SRC_APP" "$((size * 2))" "$ICONSET/icon_${size}x${size}@2x.png"
done
mkdir -p assets
iconutil -c icns "$ICONSET" -o assets/AppIcon.icns
rm -rf "$(dirname "$ICONSET")"

echo ""
echo "Done:"
ls -1 "$PUBLIC"/icon-*.png "$PUBLIC/apple-touch-icon.png" assets/AppIcon.icns
