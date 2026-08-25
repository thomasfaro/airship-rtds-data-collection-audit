#!/usr/bin/env bash
#
# Regenerates the screenshots used by docs/TUTORIAL.md and the README.
#
#   bash docs/screenshots/shoot.sh
#
# Three stages: make-demo.mjs runs a synthetic capture through the real engine,
# harness.jsx renders the real screens with that report, and headless Chrome shoots
# each screen at 2x. Requires Google Chrome and a built frontend (npm run build
# --prefix frontend) for the stylesheet.
#
# Window heights are trimmed to each screen's content, so they need adjusting when a
# screen grows or shrinks — check the output PNGs afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/docs/screenshots"
OUT="$ROOT/docs/images"
WORK="$ROOT/frontend/.shots"
DEMO="${TMPDIR:-/tmp}/rtds-dca-demo"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

[[ -x "$CHROME" ]] || { echo "Google Chrome not found at $CHROME"; exit 1; }

CSS="$(cd "$ROOT/frontend/dist" 2>/dev/null && ls assets/index-*.css 2>/dev/null | head -1)" || true
[[ -n "${CSS:-}" ]] || { echo "no built stylesheet — run: npm run build --prefix frontend"; exit 1; }

mkdir -p "$OUT" "$WORK" "$DEMO"
trap 'rm -rf "$WORK"' EXIT

echo "1/3 generating the demo audit"
(cd "$ROOT/server" && node "$SRC/make-demo.mjs" "$DEMO")

echo "2/3 bundling the harness (stylesheet: $CSS)"
cp "$SRC/harness.jsx" "$DEMO/report.json" "$DEMO/progress.json" "$WORK/"

cat > "$WORK/index.html" <<HTML
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RTDS Data Collection Audit</title>
    <link rel="stylesheet" href="../dist/${CSS}" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./bundle.js"></script>
  </body>
</html>
HTML

(cd "$ROOT/frontend" && ./node_modules/.bin/esbuild .shots/harness.jsx \
  --bundle --format=iife --jsx=automatic --target=chrome120 \
  --define:import.meta.env='{"VITE_API_BASE_URL":"","PROD":true,"DEV":false,"MODE":"production"}' \
  --outfile=.shots/bundle.js --log-level=warning)

# Headless Chrome writes the PNG and then holds on to the process, so wait for the file
# to settle and kill it rather than waiting for an exit that never comes.
shoot() {
  local screen="$1" width="$2" height="$3" name="$4"
  local profile="${TMPDIR:-/tmp}/chrome-shot-$screen"
  rm -rf "$profile"
  rm -f "$OUT/$name"
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
    --force-device-scale-factor=2 \
    --user-data-dir="$profile" \
    --window-size="${width},${height}" \
    --virtual-time-budget=4000 \
    --screenshot="$OUT/$name" \
    "file://$WORK/index.html#$screen" >/dev/null 2>&1 &
  local pid=$!
  for _ in $(seq 1 40); do
    sleep 0.5
    [[ -s "$OUT/$name" ]] && break
  done
  sleep 1
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -rf "$profile"
  echo "    $name"
}

echo "3/3 shooting"
shoot projects 1280 640 "01-projects.png"
shoot capture 1280 815 "02-capture.png"
shoot running 1280 660 "03-running.png"
shoot summary 1280 840 "04-summary.png"
shoot live    1280 760 "05-live.png"
shoot monitor 1280 780 "06-live-monitor.png"

echo "done — $OUT"
