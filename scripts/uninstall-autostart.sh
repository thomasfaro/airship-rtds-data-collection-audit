#!/usr/bin/env bash
# Undoes "Install background start": the app stops and no longer starts with the
# session. Nothing else is touched — projects, saved audits and the app folder stay.
#
# Called by "Remove background start.command".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LABEL="com.airship.rtds-dca"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SUPPORT_DIR="$HOME/Library/Application Support/RTDS Data Collection Audit"
LOGIN_SCRIPT="${SUPPORT_DIR}/login-start.sh"
PORT="${PORT:-3011}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }

hold_window() {
  if [[ -t 0 ]]; then
    echo ""
    read -r -p "Press Return to close this window. " _ || true
  fi
}

# The server is not a child of launchd — it is started through the launcher app — so it
# has to be stopped by hand. Only ever stop a process that is unmistakably this copy:
# the one listening on the port and working out of this folder.
stop_server() {
  local pid working_dir
  pid="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  [[ -n "$pid" ]] || return 1
  working_dir="$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  [[ "$working_dir" == "$ROOT/server" ]] || return 1
  kill "$pid" 2>/dev/null || return 1
}

bold "Airship RTDS Data Collection Audit — stop starting with my session"
echo ""

removed=0
if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 ||
    launchctl unload -w "$PLIST" >/dev/null 2>&1 || true
  removed=1
fi
if [[ -f "$PLIST" ]]; then
  rm -f "$PLIST"
  removed=1
fi
if [[ -f "$LOGIN_SCRIPT" ]]; then
  rm -f "$LOGIN_SCRIPT"
  # Only if nothing else ended up in there.
  rmdir "$SUPPORT_DIR" 2>/dev/null || true
  removed=1
fi

if [[ "$removed" -eq 1 ]]; then
  echo "It will no longer start with your session."
else
  echo "It was not set to start with your session."
fi

if stop_server; then
  echo "The running copy has been stopped."
fi

echo ""
echo "To use the tool again, double-click \"Start RTDS Data Collection Audit.command\""
echo "in $ROOT — or the \"Start RTDS Audit\" icon in your Applications folder, which"
echo "stays available. Delete that icon by hand if you want it gone too."
hold_window
