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
`scripts/prepare-app.sh` holds the update, install and build steps both the launcher and the background
service run, so those two cannot drift.

- The launchers at the repo root must keep git mode `100755`, or a double-click on macOS does nothing.
- Assume whoever runs them has no terminal skills: every failure path says what to do next and keeps
  the window open long enough to read it.
- See `docs/INSTALL.md` — keep it in sync when the startup flow changes.

### Starting it from a browser

A page cannot start a local process, so three pieces cover the "it is not running" case, and each
exists for a reason:

- **`frontend/public/sw.js`** answers failed navigations with `offline.html`, which carries a *Start
  the tool* button. It caches that one page and nothing else — no app shell, no API — because a cached
  bundle would survive a rebuild and serve stale JS forever. Bump `CACHE` when `offline.html` changes.
- **`rtds-audit://`** is what that button opens. `scripts/install-url-handler.sh` compiles
  `url-handler.applescript` into `~/Applications/Start RTDS Audit.app` (Windows: a `HKCU` key written
  by `Register-UrlHandler.ps1`), which runs `scripts/start-detached.sh`. `start.sh` refreshes it on
  every launch, so it is present even without the autostart.
- **`scripts/install-autostart.sh`** registers a login agent. `serve.sh` is the foreground server for
  a supervisor; `start-detached.sh` is the no-window start that `nohup`s it.
- **`components/ServerRecovery.jsx`** covers the case the fallback page cannot: a page that loaded
  fine and outlived its server, so every request fails while the app is still on screen. It probes
  `/api/health` and only then offers the same link. The offer *must* stay a plain `<a>` — a browser
  only launches an external application on a real click, so awaiting a probe first and then setting
  `location` gets swallowed without a word. `lib/serverControl.js` therefore only probes and waits.
- **The wordmark in `AppNav.jsx` is the reload button.** An installed window has no address bar, so
  without it there is no way to retry. It confirms first when a capture is running, since a reload
  ends the stream.

Four macOS behaviours were found the hard way here. Changing any of them silently breaks the feature,
with no error anywhere:

- **A launchd agent cannot read the app folder.** With `/bin/bash …/serve.sh` as its program, every
  file under `Documents`, `Desktop` or `Downloads` comes back `Operation not permitted`, and no
  prompt is ever offered — an ad-hoc signed bundle as the program fares no better. That is why the
  agent instead opens the `rtds-audit://` link: work done by an app bundle launched through Launch
  Services *is* allowed. The agent's own script therefore lives in `~/Library/Application Support/`
  and only curls the health endpoint before opening the link.
- **`osacompile` signs what it builds**, so editing `Info.plist` or the icon afterwards breaks the
  seal and macOS then refuses to launch the bundle — silently, `open` still exits 0. Re-sign with
  `codesign --force --sign -` as the last step. `codesign` ships with macOS; no developer tools
  needed.
- **Launch Services caches a record per path.** Replace the bundle in place and links are accepted but
  launch nothing. `lsregister -u` the old path before rebuilding.
- **`LSUIElement` costs you the URL event.** Hiding the launcher from the Dock looks tidy and stops
  `on open location` from ever firing.

The whole chain is verifiable from a terminal: `open "rtds-audit://start"` should answer on port 3011
within a couple of seconds.

### Keeping installs up to date

Installs live in folders nobody opens, so the app updates itself. `prepare-app.sh` fast-forwards
before it installs and builds, `server/src/updates/` handles it while running, and
`components/UpdateBanner.jsx` is the only place versions are ever mentioned unprompted.

- **`scripts/set-version.sh` is the only way to bump the version.** Five files carry it: three
  `package.json` and both lockfiles, which hold a copy of their package's version. Bump only the
  manifests and the next `npm install` rewrites the lockfiles — the folder is then permanently dirty,
  and a dirty folder is one the updater refuses to touch. That single oversight would strand every
  install on the version it had.
- **`runningVersion()` is pinned during boot** (`index.js` calls it before anything else) while
  `diskVersion()` re-reads the folder. The difference between them *is* the "restart to apply"
  banner; caching both, or neither, silently removes the feature.
- **The update guards are not decoration.** No git folder, local changes, a detached HEAD, no
  credentials, no network: each one means "keep the version you have" and say nothing. Fast-forward
  only, never a merge. The one acceptable failure of an auto-updater is doing nothing.
- **A restart cannot happen in-process.** `scheduleRestart()` spawns `restart-app.sh` detached, which
  waits for the port to go quiet before starting the replacement. Anything simpler either races its
  own listener or leaves nothing running. On the frontend side `waitForRestart()` waits for the
  server to *disappear* first — polling straight away catches the old one on its way out and reloads
  onto a process that is already exiting.
- **Git calls are bounded and prompt-free** (`updates/gitInfo.js`): `GIT_TERMINAL_PROMPT=0`, a
  low-speed abort and a timeout on every call, and the two that touch the network are async so a
  twenty-second fetch cannot stall the capture streams the server is holding open.
- **Silence is the default.** `lib/updateNotice.js` returns `null` for everything except the two
  states with a button. Keep new states out of the banner unless the user can act on them.

## Architecture

```
server/src/
  index.js            slim entry: /api/bootstrap, /api/health, then the routers
  version.js          the running version vs the one on disk
  routes/             profiles, capture, values, history, updates
  controllers/        captureController (SSE), valuesController, historyController
  capture/            captureOptions.js — stop mode, thresholds, start position, window
  updates/            gitInfo (bounded git calls), updateState (pure decision),
                      updateService (remote check, fast-forward, handover)
  audit/              the analysis engine, ported from airship-rtds-qa
  rtds/, security/, utils/, storage/, middleware/
frontend/src/
  pages/              CapturePage, HistoryPage, SettingsPage
  components/         AppNav, DocumentStatus (tab title + favicon), InstallAppButton,
                      UpdateBanner, ServerRecovery, ProfileForm, ConfirmDialog
  components/capture/ CaptureForm, StopModeCard, CaptureProgressPanel
  components/summary/ CoverageSummary, CoverageCategoryCard, WarningsList, TaggingPlanDownloads
  contexts/           ProfilesContext, CaptureSessionContext
  lib/                coverageSummary.js, captureParams.js, tabStatus.js, installPrompt.js,
                      serviceWorker.js, serverControl.js, updateNotice.js, audit/ (ported helpers)
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
  SSE reports (`coverage.plateau`). That progress is measured in *both* stop modes — manual runs are
  gauged against `REALTIME_THRESHOLDS` — because the four checks answer "have I captured enough?",
  which a manual capture needs just as much. Only `realTime` acts on the verdict, so
  `plateauStopper.observe()` must keep running in manual mode: it maintains the last-new-key markers
  the gauges read.
- **The browser tab is a status surface.** A real-time capture runs for hours in a tab nobody looks
  at, so `components/DocumentStatus.jsx` mirrors the session into the title and swaps the favicon
  (`frontend/public/favicon*.svg`, one per state). The whole mapping is the pure `lib/tabStatus.js` —
  add states there, keep the component down to two effects.
- **One set of auto-stop guardrails, on purpose.** A looser "fast" preset was offered and removed:
  it stopped captures early enough to miss rare keys. `REALTIME_THRESHOLDS` is the only set, and the
  `rt_*` query overrides exist for tuning a single run, not for the UI to expose again. Tune the
  values there, in `capture/captureOptions.js` — the plateau margin already sits at 100k instead of
  the engine's 250k — never in `audit/coveragePlateau.js`, which must stay diffable against the
  origin app. The two prose copies of these numbers (README, `CaptureForm.jsx`) follow.

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

Bumping the version is part of shipping a user-visible change: `npm run version:set <x.y.z>`, and
commit the five files it touches together.
