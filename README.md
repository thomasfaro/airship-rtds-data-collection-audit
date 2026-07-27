# Airship RTDS Data Collection Audit

A lightweight local app with a single purpose: capture a **tracking-only** Airship RTDS stream and
generate the tagging plan as **.xlsx** and **.json**.

It is the slim companion to the full `airship-rtds-qa` app. Same proven analysis engine and tagging
plan exporter, three screens instead of a dozen, and no messaging/email/OPEN capture. Both apps can
run at the same time — this one uses API port `3011` and UI port `5183`.

Everything stays on your machine: RTDS tokens are encrypted at rest, and no raw event file is ever
written to disk (events are analyzed as they stream in).

## Requirements

- Node.js 20+ (see `.nvmrc`)
- An RTDS bearer token for each project you want to audit

## Install and run

```bash
npm run setup:local   # install both workspaces, create the local config files
npm run dev           # API on :3011, UI on http://127.0.0.1:5183
```

Then open http://127.0.0.1:5183, go to **Projects** and add an RTDS token.

Logs land in `/tmp/rtds-dca-server.log` and `/tmp/rtds-dca-frontend.log`.

## The three screens

**Capture** — pick a project and the report timezone, then choose how the capture should end:

- **Manual stop** (default) — runs until you click Stop. Works for every project.
- **Real-time auto-stop** — stops on its own once no new tracking key has appeared for a while.
  Never use it on projects that push data in daily API batches: the capture can end before a batch
  arrives, and the tagging plan will be incomplete. Two sensitivity presets: *Thorough* (1M events /
  1h of processed time / 250k events and 30min without a new key) and *Fast* (100k / 30min / 25k /
  10min) for low-traffic projects.

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
scripts/    dev-local.sh
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
