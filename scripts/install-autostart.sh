#!/usr/bin/env bash
# Makes the app start with the session and stay up, so the browser is the only thing
# anyone has to open. Undo it with "Remove background start.command".
#
# It goes through the "Start RTDS Audit" bundle rather than running the server script
# directly, and that indirection is not decoration: macOS only grants file access to
# something it can name. A launchd job whose program is /bin/bash gets "Operation not
# permitted" on everything under Documents, Desktop or Downloads, with no prompt to
# approve — while the same work, launched through an app bundle, is allowed.
#
# Called by "Install background start.command".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LABEL="com.airship.rtds-dca"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SUPPORT_DIR="$HOME/Library/Application Support/RTDS Data Collection Audit"
LOGIN_SCRIPT="${SUPPORT_DIR}/login-start.sh"
LAUNCH_URL="rtds-audit://start"
PORT="${PORT:-3011}"
APP_URL="http://127.0.0.1:${PORT}"
HEALTH_URL="${APP_URL}/api/health"
LOG_DIR="${TMPDIR:-/tmp}"
LOG_FILE="${LOG_DIR%/}/rtds-dca.log"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
err() { printf '\033[31m%s\033[0m\n' "$*" >&2; }

hold_window() {
  if [[ -t 0 ]]; then
    echo ""
    read -r -p "Press Return to close this window. " _ || true
  fi
}

fail() {
  err ""
  err "$1"
  hold_window
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This installer is for macOS. On Windows, run \"Install background start.bat\"."
fi

bold "Airship RTDS Data Collection Audit — start with my session"
echo "Folder: $ROOT"
echo ""

# shellcheck source=scripts/ensure-node.sh
. "$ROOT/scripts/ensure-node.sh"
if ! ensure_node_available "$ROOT"; then
  fail "Nothing was installed."
fi

# Doing this now means the first automatic start is instant, and any install or build
# problem shows up in this window instead of in a log file nobody reads.
# shellcheck source=scripts/prepare-app.sh
. "$ROOT/scripts/prepare-app.sh"
prepare_app "$ROOT"

# The login agent starts the app by opening this link, so the handler comes first.
bash "$ROOT/scripts/install-url-handler.sh" --quiet ||
  fail "Could not register the link the automatic start relies on."

mkdir -p "$HOME/Library/LaunchAgents" "$SUPPORT_DIR"

# What launchd actually runs. It lives here, outside the app folder, because launchd
# could not even read it from Documents — and it deliberately touches nothing in there:
# asking the port a question and opening a link are allowed anywhere.
#
# The health check is what keeps this quiet. Opening the link launches an app, which
# means an icon bouncing in the Dock; doing that every ten minutes for a tool that is
# already running would be its own kind of broken.
cat >"$LOGIN_SCRIPT" <<LOGIN
#!/bin/bash
# Written by "Install background start" for ${ROOT}. Removed by "Remove background start".
if curl -sf --max-time 2 "${HEALTH_URL}" >/dev/null 2>&1; then
  exit 0
fi
exec /usr/bin/open "${LAUNCH_URL}"
LOGIN
chmod +x "$LOGIN_SCRIPT"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>${LOGIN_SCRIPT}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<!-- Nothing here stays running, so KeepAlive would only loop. This re-checks
	     instead: a tool that died comes back within ten minutes, unattended. -->
	<key>StartInterval</key>
	<integer>600</integer>
	<key>StandardOutPath</key>
	<string>/dev/null</string>
	<key>StandardErrorPath</key>
	<string>/dev/null</string>
</dict>
</plist>
PLIST

if ! plutil -lint "$PLIST" >/dev/null; then
  rm -f "$PLIST"
  fail "Could not write a valid service definition."
fi

echo "Registering the automatic start…"
launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
if ! launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1; then
  # Pre-Big Sur syntax.
  launchctl load -w "$PLIST" >/dev/null 2>&1 || fail "launchd refused the automatic start."
fi

# Bootstrapping fires RunAtLoad, which starts the app right now.
ready=0
for _ in $(seq 1 480); do
  if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done

if [[ "$ready" -ne 1 ]]; then
  err "The automatic start is registered but the app did not answer on port ${PORT}."
  echo ""
  echo "Last lines of the log ($LOG_FILE):"
  tail -n 20 "$LOG_FILE" 2>/dev/null || true
  echo ""
  echo "Remove it again with \"Remove background start.command\"."
  hold_window
  exit 1
fi

echo ""
bold "Done — the tool is running and will start with your session."
echo ""
echo "  Open it any time at: ${APP_URL}"
echo "  Bookmark that address, or use the Install app button in the interface to get"
echo "  an icon in your Applications folder."
echo ""
if [[ ! -f config/rtds-profiles.json ]]; then
  warn "First run: open the Projects screen and add an RTDS token to get started."
  echo ""
fi
echo "To undo this, double-click \"Remove background start.command\"."
echo "Log: $LOG_FILE"
hold_window
