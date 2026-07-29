#!/usr/bin/env bash
# Starts the app with no terminal window and returns once it answers.
#
# This is what the rtds-audit:// link runs, so a browser page — the app's own offline
# page, or "Open RTDS Audit.html" — can bring the tool back up on its own.
#
#   --open   open the browser too, once it is up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3011}"
APP_URL="http://127.0.0.1:${PORT}"
HEALTH_URL="${APP_URL}/api/health"
LOG_DIR="${TMPDIR:-/tmp}"
LOG_FILE="${LOG_DIR%/}/rtds-dca.log"
OPEN_BROWSER=0

if [[ "${1:-}" == "--open" ]]; then
  OPEN_BROWSER=1
fi

app_is_up() {
  curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "$APP_URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$APP_URL" >/dev/null 2>&1 || true
  fi
}

if app_is_up; then
  [[ "$OPEN_BROWSER" -eq 1 ]] && open_browser
  exit 0
fi

# Deliberately not routed through launchd, even when the login agent is installed: that
# agent starts the app by opening an rtds-audit:// link, which lands right back here.
# nohup is what keeps the server alive after the caller — an applet, a browser — quits.
nohup bash "$ROOT/scripts/serve.sh" >>"$LOG_FILE" 2>&1 &

# A normal start takes a couple of seconds; a first run has to install and build.
for _ in $(seq 1 480); do
  if app_is_up; then
    [[ "$OPEN_BROWSER" -eq 1 ]] && open_browser
    exit 0
  fi
  sleep 0.25
done

echo "The app did not come up on port ${PORT}. Log: $LOG_FILE" >&2
exit 1
