/*
 * Bringing the local server back from inside the app.
 *
 * The interface outlives the server more often than you would think: a tab left
 * open overnight, a PWA window reopened after the machine slept, a stopped service.
 * Everything then fails at once — and the page is still there to say so, so it may
 * as well offer the way back.
 *
 * A page cannot start a server by itself. It hands the job to the rtds-audit://
 * handler, and that needs a real link the user clicks: browsers refuse to launch an
 * external application without a genuine gesture, so a probe-then-navigate would be
 * swallowed silently. Hence this module only probes and waits; the click stays in
 * the markup.
 */

/** Registered by scripts/install-url-handler.sh (macOS) / Register-UrlHandler.ps1. */
export const APP_LAUNCH_URL = "rtds-audit://start";

const HEALTH_URL = "/api/health";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether the local server answers. Never throws: a failure *is* the answer. */
export async function pingServer({ fetchImpl, timeoutMs = 2_000 } = {}) {
  const request = fetchImpl ?? globalThis.fetch;
  if (typeof request !== "function") return false;

  // A closed port refuses instantly, but a machine coming out of sleep can leave
  // the connection hanging, and this runs in front of a user who is waiting.
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await request(HEALTH_URL, {
      cache: "no-store",
      signal: controller?.signal,
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Waits for the server to answer, for as long as a start can plausibly take: a
 * first run installs dependencies and builds the interface before it listens.
 * Resolves false on timeout instead of throwing, since the caller's job is then to
 * explain how to start it by hand.
 */
export async function waitForServer({
  ping = pingServer,
  wait = sleep,
  timeoutMs = 180_000,
  intervalMs = 500,
} = {}) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await ping()) return true;
    if (attempt < attempts - 1) await wait(intervalMs);
  }
  return false;
}

/**
 * Waits out a restart: the server has to disappear before it can count as back.
 *
 * Asking "is it up" straight after requesting a restart would catch the old server on
 * its way out and declare victory a moment before the port goes quiet. If it never
 * seems to go away we carry on to the up-check anyway — it may simply have come back
 * faster than a poll could see.
 */
export async function waitForRestart({
  ping = pingServer,
  wait = sleep,
  downTimeoutMs = 15_000,
  upTimeoutMs = 180_000,
  intervalMs = 500,
} = {}) {
  const downAttempts = Math.max(1, Math.ceil(downTimeoutMs / intervalMs));
  for (let attempt = 0; attempt < downAttempts; attempt += 1) {
    if (!(await ping())) break;
    await wait(intervalMs);
  }
  return waitForServer({ ping, wait, timeoutMs: upTimeoutMs, intervalMs });
}
