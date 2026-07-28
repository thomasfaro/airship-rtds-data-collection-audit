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

Not a developer? Read **[docs/INSTALL.md](docs/INSTALL.md)** and double-click the launcher —
`Start RTDS Data Collection Audit.command` on macOS, the `.bat` on Windows. It installs what is
missing (Node.js included, as a private copy in `.node/`), builds the interface, serves app + API on
http://127.0.0.1:3011 and opens the browser. On macOS, a folder that came from a browser download
needs one trip through **System Settings → Privacy & Security → Open Anyway** the first time; cloning
with GitHub Desktop avoids it.

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

## The three screens

**Capture** — pick a project and the report timezone, then choose how the capture should end:

- **Real-time auto-stop** (default) — stops on its own once no new tracking key has appeared for a
  while. Two sensitivity presets: *Thorough* (1M events / 1h of processed time / 250k events and
  30min without a new key) and *Fast* (100k / 30min / 25k / 10min) for low-traffic projects. It
  assumes the project streams in real time: when the client feeds Airship through the API in batches,
  the capture can end between two batches and the tagging plan will miss whatever they carried.
- **Manual stop** — runs until you click Stop. The right choice for batch-fed projects, kept running
  across at least one full batch cycle.

Under **Advanced options**: the start position (earliest available event, or new events only) and a
backlog limit that caps how far back RTDS replays.

**Live progress** — events captured, elapsed time, processed-time span covered, and a live count of
the distinct keys found per category. In real-time mode it also shows how close each of the four
auto-stop conditions is, so the wait is legible.

**Coverage summary** — one card per category (custom events, attributes, tags, screens, subscription
lists). Each row shows the item, its event count, a **data source** badge (SDK / API / Unknown),
**platform pills** with per-platform counts, and the app-version scope it was seen on. Below the
cards, the grouped warnings list, and above them the two downloads:

- **Download .xlsx** — the tagging plan workbook, one sheet per category plus value histograms.
- **Download .json** — the same model as structured JSON, for downstream analysis.

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
server/     Express API: profiles, capture (SSE), values, history
  src/audit/    the analysis engine (ported from airship-rtds-qa)
  src/capture/  capture option resolution (stop mode, presets, start position)
config/     local RTDS profiles (gitignored)
docs/       INSTALL.md — the no-terminal install path
scripts/    dev-local.sh (dev stack), start.sh + start.ps1 (launchers),
            ensure-node.sh + Ensure-Node.ps1 (private Node install when missing)
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
