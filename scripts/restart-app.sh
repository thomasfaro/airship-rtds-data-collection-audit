#!/usr/bin/env bash
# Replaces the running server with a fresh one.
#
# Spawned detached by POST /api/updates/restart, which answers the browser and then
# exits. The waiting is the entire point: whoever starts the replacement has to be
# outside the process being replaced, and has to hold off until the port is free.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3011}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
LOG_DIR="${TMPDIR:-/tmp}"
LOG_FILE="${LOG_DIR%/}/rtds-dca.log"

exec >>"$LOG_FILE" 2>&1
echo "[restart] $(date '+%Y-%m-%d %H:%M:%S') waiting for the current server to stop"

app_is_up() {
  curl -sf --max-time 1 "$HEALTH_URL" >/dev/null 2>&1
}

# The old server exits within a fraction of a second. Ten seconds of patience covers a
# machine under load; past that, something else holds the port and starting a second
# copy would only fail on EADDRINUSE.
for _ in $(seq 1 40); do
  if ! app_is_up; then
    break
  fi
  sleep 0.25
done

if app_is_up; then
  echo "[restart] port ${PORT} is still in use, leaving it alone"
  exit 1
fi

echo "[restart] starting the new server"
exec bash "$ROOT/scripts/start-detached.sh"
