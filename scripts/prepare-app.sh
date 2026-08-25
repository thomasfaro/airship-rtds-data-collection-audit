#!/usr/bin/env bash
# Everything that has to be true before the server can start: local config in place,
# the latest code pulled, dependencies installed, interface built.
#
# Sourced by scripts/start.sh (interactive launcher) and scripts/serve.sh (background
# service) so the two can never drift apart. Defines prepare_app(), never exits.

# Quiet by design: npm's deprecation notices and vite's chunk advice read like
# something is broken to whoever double-clicked a launcher. Errors still come through.
_DCA_NPM_QUIET=(--no-audit --no-fund --loglevel=error)

# Rebuild only when the build is missing or older than the sources it came from.
_dca_needs_build() {
  [[ -f frontend/dist/index.html ]] || return 0
  local sources=(frontend/src frontend/public frontend/index.html frontend/package.json frontend/vite.config.js)
  local existing=()
  local candidate
  for candidate in "${sources[@]}"; do
    if [[ -e "$candidate" ]]; then
      existing+=("$candidate")
    fi
  done
  local newer
  newer="$(find "${existing[@]}" -newer frontend/dist/index.html -print -quit 2>/dev/null || true)"
  [[ -n "$newer" ]]
}

# Reinstall when the lockfile has moved since the last install. npm rewrites
# node_modules/.package-lock.json on every install, which makes it the marker to
# compare against — the folder's own timestamp does not change when a dependency is
# added. Without this an update that touches package.json leaves everyone with a
# missing module and a stack trace nobody can read.
_dca_needs_install() {
  local prefix="$1"
  [[ -d "$prefix/node_modules" ]] || return 0
  local marker="$prefix/node_modules/.package-lock.json"
  [[ -f "$marker" ]] || return 0
  [[ "$prefix/package-lock.json" -nt "$marker" ]]
}

_dca_install() {
  local prefix="$1" label="$2"
  if [[ -d "$prefix/node_modules" ]]; then
    echo "Updating ${label} components…"
  else
    echo "Installing ${label} components (first run only, this takes a minute)…"
  fi
  npm install --prefix "$prefix" "${_DCA_NPM_QUIET[@]}"
}

# Pull the latest code, but only when that is unambiguously safe. Every other case is
# left alone, and silently: this runs in front of someone who double-clicked a
# launcher, so the only acceptable failure mode is "you keep the version you had".
#
# The guards, each earning its place:
#   - no .git (a ZIP install) — nothing to pull from
#   - local changes — someone is working in this folder, never touch it
#   - detached HEAD — no branch to fast-forward
#   - --ff-only — never merge, never rebase, never rewrite
#   - no terminal prompt and a low-speed abort — a launcher that stops to ask for a
#     password, or waits on a dead network, is worse than an outdated one
#   - config/.no-auto-update — the explicit way out, for a development clone
_dca_auto_update() {
  [[ -d .git ]] || return 0
  command -v git >/dev/null 2>&1 || return 0
  # `X && return` would make this whole function fail under `set -e` when the test is
  # false, taking the launcher down with it. Hence the explicit if.
  if [[ -f config/.no-auto-update || "${RTDS_DCA_NO_AUTO_UPDATE:-0}" == "1" ]]; then
    return 0
  fi
  [[ -z "$(git status --porcelain 2>/dev/null)" ]] || return 0

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ -n "$branch" && "$branch" != "HEAD" ]] || return 0

  local before after
  before="$(git rev-parse HEAD 2>/dev/null || true)"

  if ! GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes" \
    git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 \
    pull --ff-only --quiet origin "$branch" >/dev/null 2>&1; then
    return 0
  fi

  after="$(git rev-parse HEAD 2>/dev/null || true)"
  if [[ -n "$after" && "$after" != "$before" ]]; then
    echo "Updated to the latest version."
  fi
}

# The same job for a folder that came from a ZIP: no remote, no refs, nothing to
# fast-forward, so it compares published version numbers and replaces its own files.
#
# The decision and the copying live in scripts/apply-update.mjs and the tested modules
# under server/src/updates/ — deliberately not here. A version comparison and a list of
# paths an update must never touch are the guards that keep this safe, and reimplementing
# them in bash would mean maintaining them twice.
#
# Node built-ins only, so this works on the very first run, before any npm install.
_dca_archive_update() {
  [[ -d .git ]] && return 0
  command -v node >/dev/null 2>&1 || return 0
  if [[ -f config/.no-auto-update || "${RTDS_DCA_NO_AUTO_UPDATE:-0}" == "1" ]]; then
    return 0
  fi
  node scripts/apply-update.mjs 2>/dev/null || true
}

prepare_app() {
  local root="$1"
  cd "$root" || return 1

  mkdir -p config

  if [[ ! -f server/.env ]] && [[ -f server/.env.example ]]; then
    cp server/.env.example server/.env
  fi

  # First, so the install and build below see whatever the update brought in. Exactly
  # one of these two does anything: the folder either has a .git to fast-forward or it
  # does not, in which case the archive route is all there is.
  _dca_auto_update
  _dca_archive_update

  if _dca_needs_install server; then
    _dca_install server "server"
  fi
  if _dca_needs_install frontend; then
    _dca_install frontend "interface"
  fi

  if _dca_needs_build; then
    echo "Preparing the interface…"
    npm run build --prefix frontend --silent -- --logLevel error
  fi
}
