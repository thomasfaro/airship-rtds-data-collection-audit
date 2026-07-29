#!/usr/bin/env bash
# Sets the version everywhere it is written down.
#
#   scripts/set-version.sh 1.2.0
#
# Five places, not one: the root package.json (the number the app reports), the two
# workspace package.json files, and the two lockfiles, which each carry a copy of
# their package's version. Forgetting the lockfiles is not cosmetic — the next
# npm install rewrites them, leaving the folder permanently dirty, and a dirty folder
# is one the auto-update refuses to touch. That would quietly strand every install.
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: scripts/set-version.sh <major.minor.patch>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for manifest in package.json server/package.json frontend/package.json; do
  node --input-type=commonjs -e '
    const fs = require("node:fs");
    const [file, version] = process.argv.slice(1);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.version = version;
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  ' "$manifest" "$VERSION"
done

# Rewrites the version inside each lockfile without touching node_modules.
npm install --package-lock-only --prefix server --silent --no-audit --no-fund
npm install --package-lock-only --prefix frontend --silent --no-audit --no-fund

echo "Version set to ${VERSION}. Commit all five files together."
