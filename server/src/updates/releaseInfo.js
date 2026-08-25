/**
 * What the published copy of the tool says about itself, for a folder that has no git.
 *
 * A ZIP install has no remote, no refs and no ancestry — the only comparable fact left
 * is the version number in the published `package.json`. So that is the single thing
 * this module fetches, and `updateState.js` decides what it means.
 *
 * Three constraints shape every call below:
 *
 *   - **The repository is pinned here.** Owner, repo and branch are constants, not
 *     configuration and not derived from a git remote. An updater that can be pointed
 *     somewhere else by editing a file is an updater that installs whatever that file
 *     says, and the whole point of this path is that it runs unattended.
 *   - **Only two hostnames are ever contacted**, and a redirect away from them is
 *     refused rather than followed. GitHub serves archives from `codeload`, so that one
 *     is expected; anything else means we are being sent somewhere we did not ask for.
 *   - **Everything is bounded and allowed to fail.** No network, a proxy, a rate limit:
 *     each one returns null. Being one version behind is not a problem worth a stack
 *     trace in front of someone who came to run an audit.
 *
 * `raw.githubusercontent.com` rather than `api.github.com` on purpose: the version
 * check runs on a timer, and the unauthenticated API allows 60 requests an hour per
 * address — which a single office behind one NAT can exhaust. Raw file reads are not
 * metered that way, and the file we want is two hundred bytes.
 *
 * All of which currently describes a route that is switched off, because anonymous is
 * the one thing a private repository does not allow. See `PUBLISHED_ARCHIVE_AVAILABLE`.
 */

const OWNER = "urbanairship";
const REPO = "rtds_data_collection";
const BRANCH = "main";

/**
 * Whether this route has anything it can reach at all.
 *
 * Every call below is anonymous, and a private repository answers an anonymous read
 * with 404. Authenticating instead is not the fix: the token would have to sit on the
 * machine of everyone who runs the tool, which is a worse problem than being a version
 * behind. So while the repository is private there is nothing to fetch, and saying so
 * here — once, explicitly — beats polling a URL every six hours to be told 404.
 *
 * A git checkout is unaffected: `updateService.js` fast-forwards through git, with the
 * credentials the person already has. Only a folder with no git depends on this route,
 * and it now stays on the version it was installed with.
 *
 * Flip this to true if the repository becomes public. Nothing else needs to change.
 */
export const PUBLISHED_ARCHIVE_AVAILABLE = false;

const RAW_HOST = "raw.githubusercontent.com";
const ARCHIVE_HOST = "codeload.github.com";

/** The hosts this module is ever allowed to end up talking to. */
export const ALLOWED_HOSTS = Object.freeze([RAW_HOST, ARCHIVE_HOST]);

export const MANIFEST_URL = `https://${RAW_HOST}/${OWNER}/${REPO}/${BRANCH}/package.json`;
export const ARCHIVE_URL = `https://${ARCHIVE_HOST}/${OWNER}/${REPO}/tar.gz/refs/heads/${BRANCH}`;

/**
 * True when a URL is one we are willing to fetch: https, and a hostname on the list.
 * Exact match, never a suffix test — `evil-codeload.github.com.attacker.tld` ends with
 * a trusted-looking string, which is exactly the mistake this shape avoids.
 */
export function isAllowedUrl(candidate) {
  let url;
  try {
    url = new URL(String(candidate));
  } catch {
    return false;
  }
  return url.protocol === "https:" && ALLOWED_HOSTS.includes(url.hostname);
}

/**
 * Fetch with a timeout, refusing to follow a redirect off the allowed hosts.
 *
 * `redirect: "manual"` and an explicit hop loop rather than letting fetch chase
 * `Location` headers on its own: the point is to check where each hop is going, which
 * automatic following gives no opportunity to do.
 */
async function fetchGuarded(url, { timeoutMs = 10_000, maxHops = 4, accept } = {}) {
  let current = String(url);

  for (let hop = 0; hop < maxHops; hop += 1) {
    if (!isAllowedUrl(current)) {
      return { ok: false, error: "refused a URL outside the pinned GitHub hosts", response: null };
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: abort.signal,
        headers: {
          "User-Agent": `${REPO}-updater`,
          ...(accept ? { Accept: accept } : {}),
        },
      });
    } catch (error) {
      return {
        ok: false,
        error: abort.signal.aborted ? "the request timed out" : String(error?.message ?? error),
        response: null,
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) {
        return { ok: false, error: `redirect with no destination (HTTP ${response.status})`, response: null };
      }
      current = new URL(next, current).toString();
      continue;
    }

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, response: null };
    }
    return { ok: true, error: null, response };
  }

  return { ok: false, error: "too many redirects", response: null };
}

/**
 * The version published upstream, or null when we could not find out.
 *
 * Returns the raw string without judging it: deciding whether it is newer, older or
 * unreadable is `updateState.js`'s job, and keeping that judgement in one tested place
 * is what stops a downgrade guard from existing in two subtly different versions.
 */
export async function fetchPublishedVersion({ timeoutMs = 10_000 } = {}) {
  if (!PUBLISHED_ARCHIVE_AVAILABLE) {
    // Not an error: nothing was attempted, so there is nothing to report. A message
    // here would reach `checkError` and, from there, a banner about a route that is
    // deliberately closed.
    return { version: null, error: null };
  }

  const { ok, error, response } = await fetchGuarded(MANIFEST_URL, {
    timeoutMs,
    accept: "application/json",
  });
  if (!ok) {
    return { version: null, error };
  }

  try {
    // A manifest is small; a hostile or broken response that is not should not be
    // read into memory in full, so cap what we are willing to parse.
    const text = (await response.text()).slice(0, 64 * 1024);
    const version = String(JSON.parse(text)?.version ?? "").trim();
    return { version: version || null, error: version ? null : "no version in the published manifest" };
  } catch (parseError) {
    return { version: null, error: `unreadable manifest: ${String(parseError?.message ?? parseError)}` };
  }
}

/** Open the source archive for the pinned branch. Returns the live response body. */
export async function openPublishedArchive({ timeoutMs = 60_000 } = {}) {
  if (!PUBLISHED_ARCHIVE_AVAILABLE) {
    return { ok: false, response: null, error: "the published archive is not reachable anonymously" };
  }

  const { ok, error, response } = await fetchGuarded(ARCHIVE_URL, {
    timeoutMs,
    accept: "application/gzip",
  });
  return ok ? { ok: true, response, error: null } : { ok: false, response: null, error };
}
