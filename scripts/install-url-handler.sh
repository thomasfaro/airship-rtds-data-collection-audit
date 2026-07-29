#!/usr/bin/env bash
# Builds "Start RTDS Audit.app" in ~/Applications and registers it as the handler for
# rtds-audit:// links. That link is what lets a browser page start the tool, and the
# bundle doubles as a Dock-able launcher with a real icon.
#
# Built locally by osacompile rather than shipped, which has a happy side effect: a
# bundle made on this machine carries no download quarantine, so Gatekeeper has
# nothing to complain about.
#
#   --quiet   only speak up when something is actually created or fails
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_NAME="Start RTDS Audit.app"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/$APP_NAME"
SOURCE="$ROOT/scripts/url-handler.applescript"
ICON="$ROOT/assets/AppIcon.icns"
BUNDLE_ID="com.airship.rtds-dca.launcher"
SCHEME="rtds-audit"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
QUIET=0

if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

say() {
  [[ "$QUIET" -eq 1 ]] || printf '%s\n' "$*"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  say "The rtds-audit:// handler is a macOS thing; nothing to do here."
  exit 0
fi
if ! command -v osacompile >/dev/null 2>&1; then
  echo "osacompile is missing, so the rtds-audit:// link cannot be registered." >&2
  exit 1
fi

# The folder path is baked into the bundle, so a moved app folder needs a rebuild.
# So does an edited template.
recorded_root=""
if [[ -f "$APP_PATH/Contents/Resources/app-root" ]]; then
  recorded_root="$(cat "$APP_PATH/Contents/Resources/app-root")"
fi
if [[ -d "$APP_PATH" ]] &&
  [[ "$recorded_root" == "$ROOT" ]] &&
  [[ -f "$APP_PATH/Contents/Resources/Scripts/main.scpt" ]] &&
  [[ ! "$SOURCE" -nt "$APP_PATH/Contents/Resources/Scripts/main.scpt" ]]; then
  say "Already registered: $APP_PATH"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sed "s|__ROOT__|${ROOT}|g" "$SOURCE" >"$tmp/handler.applescript"

mkdir -p "$APP_DIR"
# Launch Services keeps a record per path and does not notice that the bundle behind it
# was replaced: it then accepts rtds-audit:// links and launches nothing at all. So
# withdraw the old record before touching the folder.
if [[ -d "$APP_PATH" && -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -u "$APP_PATH" || true
fi
rm -rf "$APP_PATH"
if ! osacompile -o "$APP_PATH" "$tmp/handler.applescript" >"$tmp/osacompile.log" 2>&1; then
  cat "$tmp/osacompile.log" >&2
  echo "Could not build the launcher bundle." >&2
  exit 1
fi

plist="$APP_PATH/Contents/Info.plist"
# PlistBuddy complains loudly when Set finds nothing, which is the normal path for
# keys osacompile did not write.
buddy() { /usr/libexec/PlistBuddy -c "$1" "$plist" >/dev/null 2>&1; }

buddy "Set :CFBundleIdentifier ${BUNDLE_ID}" || buddy "Add :CFBundleIdentifier string ${BUNDLE_ID}"
buddy "Set :CFBundleName Start RTDS Audit" || buddy "Add :CFBundleName string Start RTDS Audit"
# Tempting to hide this from the Dock with LSUIElement, but a background-only applet
# never receives the URL event, which is the whole point of the bundle. It shows in the
# Dock for the second or two it takes to fire the launcher, and that reads as feedback.
buddy "Add :CFBundleURLTypes array"
buddy "Add :CFBundleURLTypes:0 dict"
buddy "Add :CFBundleURLTypes:0:CFBundleURLName string RTDS Data Collection Audit"
buddy "Add :CFBundleURLTypes:0:CFBundleURLSchemes array"
buddy "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${SCHEME}"

# osacompile points CFBundleIconFile at applet.icns, so replacing the file is enough.
if [[ -f "$ICON" ]]; then
  cp "$ICON" "$APP_PATH/Contents/Resources/applet.icns"
fi

printf '%s\n' "$ROOT" >"$APP_PATH/Contents/Resources/app-root"

# osacompile signs what it builds, and every edit above breaks that seal — macOS then
# refuses to launch the bundle at all, silently. So re-seal it, last, once nothing else
# will change. codesign ships with macOS itself, no developer tools needed.
if ! codesign --force --sign - "$APP_PATH" >/dev/null 2>&1 || ! codesign --verify "$APP_PATH" >/dev/null 2>&1; then
  rm -rf "$APP_PATH"
  echo "Could not sign the launcher bundle, so macOS would refuse to run it." >&2
  exit 1
fi

# Register now instead of waiting for Launch Services to notice on its own.
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP_PATH" || true
fi

printf '%s\n' "Registered \"Start RTDS Audit\" in your Applications folder."
say ""
say "It handles ${SCHEME}:// links, which is how the app's own page can restart it,"
say "and you can keep it in the Dock to start the tool without a terminal window."
