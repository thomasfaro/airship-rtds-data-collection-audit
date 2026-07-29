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

**Use [GitHub Desktop](https://desktop.github.com)**: install it, sign in with the GitHub account that
has access to this repository, then **File → Clone repository** and pick a folder you will keep, such
as `Documents`. Your projects and saved audits live inside it.

Two reasons this is the recommended route and not just one option among others. Updating later is a
single **Pull** button instead of a re-download, which is also the step where people lose their saved
projects. And nothing arrives flagged: macOS quarantines everything a browser downloads, and a
quarantined folder costs you a security detour on first launch.

<details>
<summary>Downloading the ZIP instead</summary>

From the repository page: green **Code** button → **Download ZIP**, then unzip it and put the folder
somewhere you will keep it. You need to be signed in to GitHub in your browser.

On macOS this costs one security prompt the first time you start the app — step 3 explains how to
clear it in two clicks.

</details>

## 3. Start the app

**macOS** — double-click **`Start RTDS Data Collection Audit.command`**.

**Windows** — double-click **`Start RTDS Data Collection Audit.bat`**.

> If Windows SmartScreen warns you, click **More info** → **Run anyway**. Once only.

A terminal window opens and reports what it is doing. The **first** start takes a minute or two: it
installs the components, prepares the interface, and asks about Node.js if you do not already have it
(see step 1 — press Return to accept). Later starts take a few seconds and ask nothing.

Your browser then opens on **http://127.0.0.1:3011**.

Keep the terminal window open while you use the app — it *is* the app. Closing it, or pressing
`Ctrl+C` in it, stops the app. Step 5 removes that constraint entirely.

<details>
<summary>If macOS refuses to open the launcher (ZIP downloads only)</summary>

The dialog reads *"Apple could not verify that … is free of malware"* — or, on older versions,
*"… cannot be opened because it is from an unidentified developer"*. Every script downloaded by a
browser gets this treatment; it says nothing about what this file contains.

**Do not click "Move to Trash".** Click **Done**, then:

1. Open **System Settings → Privacy & Security**.
2. Scroll to the **Security** section at the bottom. A line names the blocked file and offers
   **Open Anyway** — click it and confirm with Touch ID or your password.
3. Double-click the launcher again, then click **Open**.

That line only shows up shortly after a blocked attempt: if you do not see it, double-click the
launcher once more and go straight back to Privacy & Security.

You do this once, for one file. Every later start is a plain double-click, and the scripts the
launcher calls are never questioned. On older macOS versions the shorter route still works:
**right-click** the file → **Open** → **Open**.

</details>

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

## 5. Make it always ready (recommended)

Double-click **`Install background start.command`** on macOS, or **`Install background start.bat`** on
Windows.

From then on the tool runs by itself: it starts when you log in, and if it ever stops it comes back
within ten minutes. No terminal window, nothing to launch — **http://127.0.0.1:3011** simply answers.

It leaves two visible traces, both removable: a login entry, listed in **System Settings → General →
Login Items** on macOS or under **Task Scheduler** on Windows, and a **Start RTDS Audit** icon in your
Applications folder. To undo everything, double-click **`Remove background start`**.

macOS may ask whether "Start RTDS Audit" can access files in your **Documents** folder. Say yes: that
is the folder the tool was installed into, and it cannot read its own files without it.

> Working on the app's code? The background copy holds port 3011, so `npm run dev` will report the
> port as busy. Run `Remove background start` while you develop.

## 6. Put it in your Applications

In the interface, top right, an **Install app** button appears in Chrome and Edge. Click it and the
tool becomes a real app on your machine: its own window with no address bar, an icon in your
Applications folder, and a Spotlight entry. In Safari, **File → Add to Dock** does the same.

That icon is more than a bookmark: when the tool is not running, it opens a page with a **Start the
tool** button rather than a browser error. One click and it comes back.

Firefox offers no equivalent — bookmark http://127.0.0.1:3011 instead.

## Opening it later, whichever way suits you

| | |
|---|---|
| **The address** | http://127.0.0.1:3011 — bookmark it |
| **The icon** | The installed app (step 6), or **Start RTDS Audit** in your Applications folder |
| **The page** | `Open RTDS Audit.html`, in the app folder: double-click it and it opens the tool, starting it first if needed |
| **The launcher** | `Start RTDS Data Collection Audit` — the original route, with its terminal window |

All of them are fine, and none starts a second copy: whatever is already running gets reused.

**Once it is open**, the **Airship** wordmark in the top-left corner reloads the interface — the
installed app has no address bar, so this is its reload button. It asks first if a capture is
running, because reloading ends it. And if the tool stops while you are using it, the error you get
carries a **Start the tool again** button: click it and the page comes back on its own.

## Updating to a newer version

**There is nothing to do.** The tool updates itself, in two ways that cover each other:

- Every time it starts, it picks up the latest version and rebuilds what needs rebuilding. That is
  why the occasional start takes a few seconds longer than usual.
- While you are using it, a blue banner appears at the top when a newer version exists. Click
  **Update and restart** and it fetches it, restarts, and brings the page back on its own — about ten
  seconds. If a capture is running it asks first, since restarting ends the capture.

Sometimes the banner asks only for a **restart**: the new version is already in the folder and the
window in front of you is still running the previous one.

The version you are running is in the top-right corner of the interface, and it is recorded inside
every tagging plan you export.

Your `config/` folder and your saved audits are never touched by an update.

<details>
<summary>The cases where it cannot update itself</summary>

- **You installed from a ZIP.** There is no link back to the repository, so download the new ZIP into
  a new folder and copy your `config/` folder across to keep your projects. Your tokens keep working
  as long as it is the same machine. Cloning with GitHub Desktop avoids this for good.
- **You edited files in the app folder.** Anything unsaved to GitHub would be at risk, so the tool
  leaves the folder alone and says so in the banner. In GitHub Desktop, either commit or discard your
  changes, then use **Pull**.
- **No network, or GitHub is unreachable.** It carries on with the version you have and tries again
  next time.

</details>

## If something goes wrong

| Symptom | What to do |
|---|---|
| The browser says it cannot connect | The tool is not running. Double-click `Open RTDS Audit.html` in the app folder, or the launcher |
| A page says "the tool is not running" | Click **Start the tool** on it and wait a few seconds — the page reloads on its own |
| The tool stopped while you were using it | The error shown carries **Start the tool again**. Or click the **Airship** wordmark to reload |
| A banner offers an update but says the folder has local changes | Something in the app folder was edited. In GitHub Desktop, commit or discard the changes, then press **Pull** |
| The banner never goes away after updating | The restart did not complete. Double-click the launcher, or `Open RTDS Audit.html` |
| **Start the tool** seems to do nothing | The link it uses is registered the first time the launcher runs. Start the tool once with the launcher, then it works |
| No **Install app** button | Only Chrome and Edge offer it. Safari: **File → Add to Dock**. Firefox: bookmark the address |
| The automatic start stopped working | It records where the app folder is. If you moved or renamed the folder, run `Install background start` again |
| macOS says it "could not verify" the launcher | **System Settings → Privacy & Security → Open Anyway** (step 3). Never "Move to Trash" |
| No **Open Anyway** appears, or macOS keeps blocking it | Open **Terminal**, type `xattr -dr com.apple.quarantine ` (with the trailing space), drag the app folder into the window, press Return. Then double-click the launcher again |
| Double-click does nothing at all, no dialog | The file lost its executable flag. In **Terminal**, type `bash `, drag `scripts/start.sh` from the folder into the window, press Return |
| It asks to install Node.js | Press **Return** to accept — a private copy lands in the app folder (step 1) |
| The Node.js download fails | A proxy or firewall is blocking nodejs.org. Install the LTS from [nodejs.org](https://nodejs.org) yourself, then start the launcher again |
| "Checksum mismatch" | The download was corrupted and nothing was installed. Start the launcher again |
| The window closes right away | Read the log: `/tmp/rtds-dca.log` on macOS, `%TEMP%\rtds-dca.log` on Windows |
| "did not come up on port 3011" | Another app holds that port. Close the other copy of this app, or ask for help |

## Files to keep to yourself

Never share, commit, or send these — they are local to you and contain credentials or client data:

- `config/rtds-profiles.json` — your RTDS tokens
- `config/.local-api-key` — the key the interface uses to talk to the local API
- `server/.env` — local settings
- `.stored-files/` — the saved audit reports

The exported `.xlsx` / `.json` tagging plans describe a client's tracking taxonomy: treat them with
the same care as any other client deliverable.
