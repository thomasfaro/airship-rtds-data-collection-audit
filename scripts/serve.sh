#!/usr/bin/env bash
# The app as a background service: no window, no questions, no browser.
#
# Stays in the foreground on purpose. launchd owns this process and restarts it when
# it dies, so daemonising here would only hide it from the thing supervising it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3011}"

# Unattended by definition: there is nobody here to answer a question about Node.
export RTDS_DCA_AUTO_INSTALL_NODE="${RTDS_DCA_AUTO_INSTALL_NODE:-1}"

# shellcheck source=scripts/ensure-node.sh
. "$ROOT/scripts/ensure-node.sh"
if ! ensure_node_available "$ROOT"; then
  echo "[serve] No usable Node.js, and installing a private copy failed." >&2
  exit 1
fi

# shellcheck source=scripts/prepare-app.sh
. "$ROOT/scripts/prepare-app.sh"
prepare_app "$ROOT"

# The server reads its config and resolves its data directories from the working
# directory, exactly as `npm start --prefix server` gives it.
cd "$ROOT/server"
export PORT
echo "[serve] $(date '+%Y-%m-%d %H:%M:%S') starting on port ${PORT}"
exec node src/index.js
