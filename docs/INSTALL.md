# Install and run

For everyone, no terminal required. The app runs entirely on your own machine: the audited data and
your RTDS tokens never leave it.

Works on **macOS** and **Windows**.

## 1. Node.js — nothing to do in advance

The app runs on Node.js. The launcher checks for it, and **if it is missing or too old it offers to
install its own private copy** inside the app folder (about 50 MB, downloaded from nodejs.org and
checksum-verified). Answer by pressing **Return**.

That copy asks for no administrator password, changes nothing else on your machine, and disappears if
you delete the app folder. Nothing to prepare, so go straight to step 2.

If you prefer to install Node.js yourself — or your company blocks downloads from nodejs.org — get the
**LTS** version from [nodejs.org](https://nodejs.org) first and the launcher will simply use it.

## 2. Get the app folder

**Download the ZIP** from the repository page: green **Code** button → **Download ZIP**, then
unzip it. Put the folder somewhere you will keep it, such as `Documents` — your projects and saved
audits live inside it.

On macOS this route costs you one security prompt the first time you start the app: anything a browser
downloads is flagged, and step 3 explains how to clear it in two clicks.

**To skip that prompt entirely**, get the folder with [GitHub Desktop](https://desktop.github.com)
(**File → Clone repository**) or with `git clone` if you know it. Files that arrive that way are not
flagged, and both make updating later a one-click affair.

## 3. Start the app

**macOS** — double-click **`Start RTDS Data Collection Audit.command`**.

> **If macOS refuses to open it**, the dialog reads *"Apple could not verify that … is free of malware"*
> — or, on older versions, *"… cannot be opened because it is from an unidentified developer"*. Every
> script downloaded by a browser gets this treatment; it says nothing about what this file contains.
>
> **Do not click "Move to Trash".** Click **Done**, then:
>
> 1. Open **System Settings → Privacy & Security**.
> 2. Scroll to the **Security** section at the bottom. A line names the blocked file and offers
>    **Open Anyway** — click it and confirm with Touch ID or your password.
> 3. Double-click the launcher again, then click **Open**.
>
> That line only shows up shortly after a blocked attempt: if you do not see it, double-click the
> launcher once more and go straight back to Privacy & Security.
>
> You do this once, for one file. Every later start is a plain double-click, and the scripts the
> launcher calls are never questioned. On older macOS versions the shorter route still works:
> **right-click** the file → **Open** → **Open**.

**Windows** — double-click **`Start RTDS Data Collection Audit.bat`**.

> If Windows SmartScreen warns you, click **More info** → **Run anyway**. Once only.

A terminal window opens and reports what it is doing. The **first** start takes a minute or two: it
installs the components, prepares the interface, and asks about Node.js if you do not already have it
(see step 1 — press Return to accept). Later starts take a few seconds and ask nothing.

Your browser then opens on **http://127.0.0.1:3011**.

Keep the terminal window open while you use the app — it *is* the app. Closing it, or pressing
`Ctrl+C` in it, stops the app.

## 4. Add an RTDS project

Go to the **Projects** screen and add a project:

| Field | What to enter |
|---|---|
| Project name | Any label you will recognise, e.g. the client name |
| Region | `EU` or `US`, matching the Airship project |
| Bearer token | The RTDS token (pasting the `Bearer ` prefix is fine) |

Tokens are encrypted at rest with a key specific to your machine.

Then go to **Capture**, pick the project, and start. The capture ends on its own once no new tracking
key has appeared for a while — that is **Real-time auto-stop**, the default.

One caveat worth knowing: it assumes the project sends its data to Airship in real time. If the client
uploads through the API in batches instead, the capture can end between two batches, so the period it
covers has gaps and the tagging plan misses whatever those batches carried. For those projects pick
**Manual stop** and let it run across at least one full batch cycle.

When the capture ends, the coverage summary offers the tagging plan as **.xlsx** and **.json**.
Everything is saved locally and reopenable from **History**.

## Starting it again later

Double-click the same launcher. If the app is already running, the launcher simply reopens the browser
tab instead of starting a second copy.

## Updating to a newer version

Download the ZIP again (or `git pull`) into a new folder, then copy your `config/` folder across from
the old one to keep your projects. Your tokens keep working as long as it is the same machine.

## If something goes wrong

| Symptom | What to do |
|---|---|
| macOS says it "could not verify" the launcher | **System Settings → Privacy & Security → Open Anyway** (step 3). Never "Move to Trash" |
| No **Open Anyway** appears, or macOS keeps blocking it | Open **Terminal**, type `xattr -dr com.apple.quarantine ` (with the trailing space), drag the app folder into the window, press Return. Then double-click the launcher again |
| Double-click does nothing at all, no dialog | The file lost its executable flag. In **Terminal**, type `bash `, drag `scripts/start.sh` from the folder into the window, press Return |
| It asks to install Node.js | Press **Return** to accept — a private copy lands in the app folder (step 1) |
| The Node.js download fails | A proxy or firewall is blocking nodejs.org. Install the LTS from [nodejs.org](https://nodejs.org) yourself, then start the launcher again |
| "Checksum mismatch" | The download was corrupted and nothing was installed. Start the launcher again |
| The window closes right away | Read the log: `/tmp/rtds-dca.log` on macOS, `%TEMP%\rtds-dca.log` on Windows |
| Browser says it cannot connect | Give it a few seconds and refresh; the terminal window prints `Ready` when it is up |
| "did not come up on port 3011" | Another app holds that port. Close the other copy of this app, or ask for help |

## Files to keep to yourself

Never share, commit, or send these — they are local to you and contain credentials or client data:

- `config/rtds-profiles.json` — your RTDS tokens
- `config/.local-api-key` — the key the interface uses to talk to the local API
- `server/.env` — local settings
- `.stored-files/` — the saved audit reports

The exported `.xlsx` / `.json` tagging plans describe a client's tracking taxonomy: treat them with
the same care as any other client deliverable.
