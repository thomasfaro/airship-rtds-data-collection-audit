# Instructions for coding agents

This repo is **Airship RTDS Data Collection Audit**: a local browser app that captures a
tracking-only RTDS stream and generates the tagging plan (`.xlsx` / `.json`). React (Vite) UI +
Node.js (Express) API. No desktop build, no deployment target — it runs on the developer's machine.

It is the slim companion of `airship-rtds-qa`. Keep it slim: the value of this app is that it does
one thing. Before adding a feature, ask whether it serves "capture tracking events → get the tagging
plan".

## Language

All user-facing strings, comments and docs are **English only**.

## Getting started

```bash
npm run setup:local   # install both workspaces + local config files
npm run dev           # API :3011, UI http://127.0.0.1:5183
npm test              # server + frontend (node --test)
```

Ports differ from `airship-rtds-qa` (3001 / 5173) so both can run side by side. Logs:
`/tmp/rtds-dca-server.log`, `/tmp/rtds-dca-frontend.log`.

## Shipping it to non-developers

`scripts/start.sh` (macOS/Linux) and `scripts/start.ps1` (Windows) are the double-click path: install
what is missing, build the UI, then serve UI + API from the single API port — `server/src/index.js`
serves `frontend/dist` when that build exists. `scripts/ensure-node.sh` and `Ensure-Node.ps1` install a
private Node in `.node/` when the machine has none, checksum-verified, without admin rights.

- The launchers at the repo root must keep git mode `100755`, or a double-click on macOS does nothing.
- Assume whoever runs them has no terminal skills: every failure path says what to do next and keeps
  the window open long enough to read it.
- See `docs/INSTALL.md` — keep it in sync when the startup flow changes.

## Architecture

```
server/src/
  index.js            slim entry: /api/bootstrap, /api/health, then the routers
  routes/             profiles, capture, values, history
  controllers/        captureController (SSE), valuesController, historyController
  capture/            captureOptions.js — stop mode, presets, start position, window
  audit/              the analysis engine, ported from airship-rtds-qa
  rtds/, security/, utils/, storage/, middleware/
frontend/src/
  pages/              CapturePage, HistoryPage, SettingsPage
  components/capture/ CaptureForm, StopModeCard, CaptureProgressPanel
  components/summary/ CoverageSummary, CoverageCategoryCard, WarningsList, TaggingPlanDownloads
  contexts/           ProfilesContext, CaptureSessionContext
  lib/                coverageSummary.js, captureParams.js, audit/ (ported helpers)
  services/           apiClient + one module per API area
```

### Things to know before editing

- **`server/src/audit/` is a port.** It is shared history with `airship-rtds-qa` and heavily
  interdependent (`analyzeEvents.js` alone imports ~30 siblings). Fix bugs there, but avoid
  refactors: they make it impossible to diff against the origin app.
- **Captures are analysis-only.** `captureController.js` forces `trackingOnly` and never writes raw
  NDJSON. `report.meta.storage.sourceFileName` is a *stem*, not a file that exists — the persisted
  report and the value sidecars are keyed on it. Don't add code that tries to read it.
- **Only five RTDS types are ever requested** (custom events, attributes, tags, screens,
  subscription lists). The messaging/email/OPEN branches in the engine are simply never reached.
- **The exporter is shared with the full app.** `frontend/src/lib/audit/taggingPlanExport.js` takes
  its value fetchers by injection; wire them to `/api/values/*`, don't fork the module.
- **Auto-stop lives server-side** in `audit/coveragePlateau.js`. The UI only renders the progress the
  SSE reports (`coverage.autoStop`).

## Conventions

- ES modules everywhere, `node --test` for tests, no test framework.
- Pure logic goes in a `lib/` (frontend) or dedicated module (server) with a `*.test.js` next to it;
  React components stay presentational so they need no DOM test setup.
- Tailwind with the `airship-*` palette and the component classes in `frontend/src/index.css`
  (`card`, `btn-primary`, `badge-blue`, …). Prefer those over ad-hoc utility soup.
- Comments explain intent or a constraint, never what the next line does.

## Before you finish

```bash
npm test
npm run build --prefix frontend
```
