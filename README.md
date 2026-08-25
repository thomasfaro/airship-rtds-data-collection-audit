# Airship RTDS Data Collection Audit

**Find out what an app actually tracks.** Point this tool at an Airship project, let it listen to the
real-time data stream, and it hands you the tagging plan: every custom event, attribute, tag, screen
and subscription list the app sends, with counts, platforms and app versions — as a spreadsheet you
can send to a client.

No terminal, no server, no account to create. It runs on your own machine, and the data it reads
never leaves it.

[![Install the tool](https://img.shields.io/badge/Install%20the%20tool-2%20minutes-1668E3?style=for-the-badge)](docs/INSTALL.md)
[![How to use it](https://img.shields.io/badge/How%20to%20use%20it-4%20steps-24292F?style=for-the-badge)](docs/TUTORIAL.md)

![The coverage summary at the end of a capture, with the two tagging plan downloads](docs/images/04-summary.png)

## What you get

- **A tagging plan as `.xlsx`** — one sheet per category, with the values seen for each item. This is
  the deliverable: what is tracked, how often, on which platforms and app versions.
- **The same plan as `.json`** — for anything downstream. The `airship-engagement-review` skill reads
  this file to ground a client engagement review in the client's real taxonomy.
- **The findings that come for free** — an event tracked on iOS but never seen on Android, an
  attribute written by both the SDK and a CRM, a screen name that only exists on an old build.
- **A live stream monitor** — watch events as they arrive, filtered by named user or channel ID.
  Separate from the audit; does not produce a plan. Optionally keeps the raw NDJSON on disk.

## Install it

Two double-clicks, on **macOS** or **Windows**. Download the folder with the repository page's green
**Code** button → **Download ZIP**, unzip it, then double-click the launcher inside. It installs
everything it needs, Node.js included, opens your browser on the tool, and keeps itself up to date
from then on. No account and no git required.

**[Full install guide →](docs/INSTALL.md)** — including how to make it always available, so the tool
becomes an icon in your Applications folder rather than something you launch.

## Use it

![A capture in progress, with the four gauges tracking coverage](docs/images/03-running.png)

1. **Projects** — add the client's RTDS token once.
2. **Data collection audit** — pick the project and how the capture should end: on its own once
   nothing new turns up, or when you click Stop.
3. Watch the coverage settle. The four gauges say when the plan is complete enough; the browser tab
   keeps score, so you can leave it running.
4. Download the plan. Every audit is saved and reopenable from **History**.

**Live stream** (optional) watches events as they arrive. Tick **Store raw data file** if you want
the NDJSON on disk — only then does it appear in History, with a Download button.

**[The four steps, in detail →](docs/TUTORIAL.md)**

## It keeps itself up to date

Nothing to do. It picks up the latest version each time it starts, and while you are using it a
banner offers the update with a single button. The version it is running sits in the top-right corner
and is recorded inside every plan you export, so a file found six months later names the version that
produced it.

## Everything stays on your machine

- Tokens are **encrypted at rest** with a key specific to your machine, in a file that is never
  committed or shared.
- The app answers on **loopback only** (`127.0.0.1`) and requires a local key that only the interface
  on your machine can read. Nothing is exposed to your network.
- Captures are **analysis-only**: events are read as they stream in and never written to disk. Only
  the finished report is saved. Live stream can keep a raw NDJSON if you tick **Store raw data file**.
- The one outbound call is to the Airship RTDS endpoint, with your token.

## For developers

This is the slim companion to the full `airship-rtds-qa` app: same analysis engine and tagging plan
exporter, three screens instead of a dozen, tracking-only capture. Both can run at once — this one
uses port `3011` (and `5183` for the Vite dev server).

<details>
<summary>Running it from source, tests, layout</summary>

### Getting started

```bash
npm run setup:local   # install both workspaces, create the local config files
npm run dev           # API on :3011, UI on http://127.0.0.1:5183 (hot reload)
npm test              # server + frontend, both plain `node --test`
```

`npm start` runs the double-click launcher; `npm run serve` builds and serves everything on the single
port without opening a browser. Logs: `/tmp/rtds-dca-server.log` and `/tmp/rtds-dca-frontend.log` in
dev, `/tmp/rtds-dca.log` from the launcher.

A development clone should keep an empty `config/.no-auto-update` file, so starting it does not
fast-forward the folder underneath you. Bump a version with `npm run version:set 1.2.0` — it writes
the three `package.json` files and both lockfiles, which have to move together.

### Configuration

RTDS projects live in `config/rtds-profiles.json` (gitignored, `0600`, tokens encrypted). Add them
from the Projects screen, or copy `config/rtds-profiles.example.json`.

Optional, in `server/.env` (see `server/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3011` | API port |
| `HOST` | `127.0.0.1` | Bind address (loopback only) |
| `CORS_ORIGIN` | `http://localhost:5183` | Allowed UI origin |
| `RTDS_PROFILES_PATH` | `config/rtds-profiles.json` | Profiles file location |
| `RTDS_DCA_STORAGE_DIR` | `.stored-files/` | Where saved analyses live |

### Layout

```
frontend/   React 18 + Vite + Tailwind — audit, live stream, history, projects
  public/       manifest, icons, sw.js + offline.html (the "start it again" page)
server/     Express API: profiles, capture (SSE), live stream, values, history, updates
  src/audit/    the analysis engine (ported from airship-rtds-qa)
  src/capture/  capture option resolution (stop mode, thresholds, start position)
  src/updates/  version check, fast-forward or archive update, handover to a fresh server
assets/     icon sources + AppIcon.icns, rebuilt by scripts/build-icons.sh
config/     local RTDS profiles (gitignored)
docs/       INSTALL.md, TUTORIAL.md, images/ + screenshots/ (how they are produced)
scripts/    dev-local.sh (dev stack), start.sh + start.ps1 (launchers),
            prepare-app.sh (update + install + build, shared), serve.sh (background service),
            start-detached.sh (no-window start, what the rtds-audit:// link runs),
            restart-app.sh (waits for the port, then starts the replacement),
            install-url-handler.sh (builds the launcher bundle), install-autostart.sh,
            ensure-node.sh + Ensure-Node.ps1 (private Node install when missing),
            set-version.sh (the one way to bump the version)
            — each with a .ps1 counterpart for Windows
```

Architecture, conventions and the macOS constraints behind the launcher are in
**[AGENTS.md](AGENTS.md)**. The documentation screenshots are regenerated by
`bash docs/screenshots/shoot.sh`.

</details>
