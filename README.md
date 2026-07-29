# Airship RTDS Data Collection Audit

A lightweight local app with a single purpose: capture a **tracking-only** Airship RTDS stream and
generate the tagging plan as **.xlsx** and **.json**.

It is the slim companion to the full `airship-rtds-qa` app. Same proven analysis engine and tagging
plan exporter, three screens instead of a dozen, and no messaging/email/OPEN capture. Both apps can
run at the same time — this one uses API port `3011` and UI port `5183`.

Everything stays on your machine: RTDS tokens are encrypted at rest, and no raw event file is ever
written to disk (events are analyzed as they stream in).

## Requirements

- Node.js 20+ (see `.nvmrc`). If it is missing, the launcher offers to install a private copy in
  `.node/` inside the app folder — no admin rights, nothing installed system-wide.
- An RTDS bearer token for each project you want to audit

## Install and run

Not a developer? Read **[docs/INSTALL.md](docs/INSTALL.md)**, clone with GitHub Desktop, and
double-click the launcher — `Start RTDS Data Collection Audit.command` on macOS, the `.bat` on
Windows. It installs what is missing (Node.js included, as a private copy in `.node/`), builds the
interface, serves app + API on http://127.0.0.1:3011 and opens the browser.

Two things make it usable without ever thinking about a terminal again:

- **`Install background start`** registers the tool with your session, so http://127.0.0.1:3011 just
  answers — at login, and again within ten minutes if it ever stops. `Remove background start` undoes
  it.
- **Install app** (Chrome/Edge, top right of the interface) turns it into a real local app: own
  window, icon in Applications, Spotlight entry. When the server is down that icon lands on a page
  offering to start it, courtesy of a deliberately minimal service worker — so the icon is a working
  entry point, not just a bookmark. `Open RTDS Audit.html` at the repo root does the same job for
  people who did not install it.

For development:

```bash
npm run setup:local   # install both workspaces, create the local config files
npm run dev           # API on :3011, UI on http://127.0.0.1:5183 (Vite, hot reload)
```

Then open http://127.0.0.1:5183, go to **Projects** and add an RTDS token.

`npm start` runs the launcher described above; `npm run serve` builds and serves everything on the
single port without opening a browser.

Logs land in `/tmp/rtds-dca-server.log` and `/tmp/rtds-dca-frontend.log` in dev, and
`/tmp/rtds-dca.log` when started from the launcher.

## Staying up to date

The tool keeps itself current, on the assumption that nobody is going to run `git pull` in a folder
they never open.

- **At every start**, the launcher fast-forwards the folder onto the latest version, then reinstalls
  dependencies and rebuilds the interface if the update touched either. It only ever fast-forwards,
  it never touches a folder with local changes, and it gives up quietly when git, the network or the
  credentials are not there — the worst case is keeping the version you already had.
- **While it runs**, a banner appears when a newer version exists on GitHub. *Update and restart*
  fetches it and hands over to a fresh server, then the page reloads onto it by itself.
- **When new code is already on disk** but this window is still running the old one, the banner asks
  for a restart instead, which is the same handover without the download.
- The running version sits in the top right of the interface — hover it for the commit — and is
  stamped into every report and `.json` export, so a tagging plan found six months later names the
  version that produced it.

A capture cannot survive a restart, so both buttons ask first when one is running.

To opt out of the startup update for good, leave an empty `config/.no-auto-update` file in the folder
(a development clone should have one). The banner still lets you update on demand.

Releasing a change: `npm run version:set 1.2.0` writes the number to the three `package.json` files
and both lockfiles, which have to move together — see `AGENTS.md`.

## The three screens

**Capture** — pick a project and the report timezone, then choose how the capture should end:

- **Real-time auto-stop** (default) — stops on its own once no new tracking key has appeared for a
  while. One fixed set of guardrails, and deliberately a strict one: 1M events and 1h of processed
  time before completeness is even considered, then 100k events and 30min without a new key. It
  assumes the project streams in real time: when the client feeds Airship through the API in batches,
  the capture can end between two batches and the tagging plan will miss whatever they carried.
- **Manual stop** — runs until you click Stop. The right choice for batch-fed projects, kept running
  across at least one full batch cycle.

Under **Advanced options**: the start position (earliest available event, or new events only) and a
backlog limit that caps how far back RTDS replays.

**Live progress** — events captured, elapsed time, processed-time span covered, and a live count of
the distinct keys found per category. Four gauges show how close coverage is to settling — in
real-time mode that is exactly what ends the capture, and in manual mode it is what tells you a
longer capture would add nothing, so Stop becomes a decision rather than a guess. The browser tab
reports the same thing without
being opened: the title counts the events (`● 1.2M events · RTDS Data Collection Audit`) and then
announces the end (`✅ Audit complete`), while the favicon carries a blue dot during the capture, a
green one once the plan is ready and a pink one if the capture failed.

**Coverage summary** — one card per category (custom events, attributes, tags, screens, subscription
lists). Each row shows the item, its event count, a **data source** badge (SDK / API / Unknown),
**platform pills** with per-platform counts, and the app-version scope it was seen on. Below the
cards, the grouped warnings list, and above them the two downloads:

- **Download .xlsx** — the tagging plan workbook, one sheet per category plus value histograms.
- **Download .json** — the same model as structured JSON, for downstream analysis. It is also the
  file the `airship-engagement-review` skill ingests to add its data-foundation section to a client
  engagement review.

Every capture is saved locally and reopenable from **History**, where the exports can be
regenerated.

## Configuration

RTDS projects are stored in `config/rtds-profiles.json` (gitignored, `0600`, tokens encrypted).
Add them from the Projects screen, or copy `config/rtds-profiles.example.json` and fill it in.

Optional environment variables (`server/.env`, copied from `server/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3011` | API port |
| `HOST` | `127.0.0.1` | API bind address (loopback only) |
| `CORS_ORIGIN` | `http://localhost:5183` | Allowed UI origin |
| `RTDS_PROFILES_PATH` | `config/rtds-profiles.json` | Profiles file location |
| `RTDS_DCA_STORAGE_DIR` | `.stored-files/` | Where saved analyses live |

## Project layout

```
frontend/   React 18 + Vite + Tailwind — 3 routes, capture/summary components
  public/       manifest, icons, sw.js + offline.html (the "start it again" page)
server/     Express API: profiles, capture (SSE), values, history, updates
  src/audit/    the analysis engine (ported from airship-rtds-qa)
  src/capture/  capture option resolution (stop mode, thresholds, start position)
  src/updates/  version check, fast-forward update, handover to a fresh server
assets/     icon sources + AppIcon.icns, rebuilt by scripts/build-icons.sh
config/     local RTDS profiles (gitignored)
docs/       INSTALL.md — the no-terminal install path
scripts/    dev-local.sh (dev stack), start.sh + start.ps1 (launchers),
            prepare-app.sh (update + install + build, shared), serve.sh (background service),
            start-detached.sh (no-window start, what the rtds-audit:// link runs),
            restart-app.sh (waits for the port, then starts the replacement),
            install-url-handler.sh (builds the launcher bundle), install-autostart.sh,
            ensure-node.sh + Ensure-Node.ps1 (private Node install when missing),
            set-version.sh (the one way to bump the version)
            — each with a .ps1 counterpart for Windows
```

## Tests

```bash
npm test                      # server + frontend
npm run test --prefix server
npm run test --prefix frontend
```

Both suites are plain `node --test`, no test runner to install.

## Security notes

- The API binds to loopback and requires a local API key (`config/.local-api-key`) that the UI
  fetches from `GET /api/bootstrap`. Nothing is exposed to the network.
- Tokens are encrypted at rest with a machine-local key; if you copy the profiles file to another
  machine the tokens will not decrypt and must be re-entered.
- Captures are analysis-only: only the finished report and its value sidecars are written, never the
  raw RTDS events.
