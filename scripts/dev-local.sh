#!/usr/bin/env bash
# Start API (3011) + Vite (5183) in background for fast local iteration.
# Ports differ from airship-rtds-qa (3001 / 5173) so both apps can run side by side.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT=3011
APP_PORT=5183
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"
APP_URL="http://127.0.0.1:${APP_PORT}"

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Stopping process(es) on port ${port}…"
    kill $pids 2>/dev/null || true
    sleep 0.5
  fi
}

if curl -sf "$HEALTH_URL" >/dev/null 2>&1 && curl -sf "$APP_URL" >/dev/null 2>&1; then
  echo "Dev stack already running: $APP_URL (API $HEALTH_URL)"
  exit 0
fi

# Stale node --watch / Vite listeners can block ports after a crash.
curl -sf "$HEALTH_URL" >/dev/null 2>&1 || free_port "$API_PORT"
curl -sf "$APP_URL" >/dev/null 2>&1 || free_port "$APP_PORT"

mkdir -p config
[[ -d server/node_modules ]] || npm install --prefix server
[[ -d frontend/node_modules ]] || npm install --prefix frontend

if ! curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Starting API on ${API_PORT}…"
  npm run dev --prefix server >/tmp/rtds-dca-server.log 2>&1 &
  for _ in $(seq 1 40); do
    curl -sf "$HEALTH_URL" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

if ! curl -sf "$APP_URL" >/dev/null 2>&1; then
  echo "Starting Vite on ${APP_PORT}…"
  npm run dev --prefix frontend >/tmp/rtds-dca-frontend.log 2>&1 &
  sleep 2
fi

echo "Local dev ready: $APP_URL"
echo "Logs: /tmp/rtds-dca-server.log /tmp/rtds-dca-frontend.log"
