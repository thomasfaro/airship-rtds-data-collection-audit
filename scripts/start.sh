#!/usr/bin/env bash
# One-click launcher (macOS / Linux): install what is missing, build the interface,
# serve app + API on a single port, open the browser.
# Called by "Start RTDS Data Collection Audit.command".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3011}"
APP_URL="http://127.0.0.1:${PORT}"
HEALTH_URL="${APP_URL}/api/health"
LOG_DIR="${TMPDIR:-/tmp}"
LOG_FILE="${LOG_DIR%/}/rtds-dca.log"
READY=0

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
err() { printf '\033[31m%s\033[0m\n' "$*" >&2; }

# A double-clicked launcher must never vanish before the message is read.
hold_window() {
  if [[ -t 0 ]]; then
    echo ""
    read -r -p "Press Return to close this window. " _ || true
  fi
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "$APP_URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$APP_URL" >/dev/null 2>&1 || true
  else
    echo "Open $APP_URL in your browser."
  fi
}

on_exit() {
  local code=$?
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ "$code" -eq 0 || "$code" -eq 130 ]]; then
    return
  fi
  err ""
  if [[ "$READY" -eq 1 ]]; then
    err "The app stopped unexpectedly (exit code $code)."
  else
    err "Startup failed (exit code $code)."
  fi
  if [[ -f "$LOG_FILE" ]]; then
    echo "Log file: $LOG_FILE"
  fi
  hold_window
}
trap on_exit EXIT
trap 'exit 130' INT TERM

bold "Airship RTDS Data Collection Audit"
echo "Folder: $ROOT"
echo ""

# Finds Node, or offers to install a private copy in .node/ when there is none.
# shellcheck source=scripts/ensure-node.sh
. "$ROOT/scripts/ensure-node.sh"
if ! ensure_node_available "$ROOT"; then
  hold_window
  exit 1
fi

if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  READY=1
  bold "Already running — reopening $APP_URL"
  open_browser
  exit 0
fi

mkdir -p config

if [[ ! -f server/.env ]] && [[ -f server/.env.example ]]; then
  cp server/.env.example server/.env
fi

# Quiet by design: npm's deprecation notices and vite's chunk advice read like
# something is broken to whoever double-clicked this. Errors still come through.
NPM_QUIET=(--no-audit --no-fund --loglevel=error)

if [[ ! -d server/node_modules ]]; then
  echo "Installing server components (first run only, this takes a minute)…"
  npm install --prefix server "${NPM_QUIET[@]}"
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing interface components (first run only, this takes a minute)…"
  npm install --prefix frontend "${NPM_QUIET[@]}"
fi

# Rebuild only when the build is missing or older than the sources it came from.
needs_build() {
  [[ -f frontend/dist/index.html ]] || return 0
  local sources=(frontend/src frontend/index.html frontend/package.json frontend/vite.config.js)
  local existing=()
  local candidate
  for candidate in "${sources[@]}"; do
    [[ -e "$candidate" ]] && existing+=("$candidate")
  done
  local newer
  newer="$(find "${existing[@]}" -newer frontend/dist/index.html -print -quit 2>/dev/null || true)"
  [[ -n "$newer" ]]
}

if needs_build; then
  echo "Preparing the interface…"
  npm run build --prefix frontend --silent -- --logLevel error
fi

echo "Starting on port ${PORT}…"
: >"$LOG_FILE"
PORT="$PORT" npm start --prefix server >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    READY=1
    break
  fi
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.25
done

if [[ "$READY" -ne 1 ]]; then
  err "The app did not come up on port ${PORT}."
  echo ""
  echo "Last lines of the log ($LOG_FILE):"
  tail -n 20 "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

open_browser

bold ""
bold "Ready: $APP_URL"
if [[ ! -f config/rtds-profiles.json ]]; then
  warn "First run: open the Projects screen and add an RTDS token to get started."
fi
echo ""
echo "Keep this window open while you use the app."
echo "Press Ctrl+C, or close this window, to stop it."
echo ""
echo "Log file: $LOG_FILE"
echo ""

wait "$SERVER_PID"
