/*
 * Chromium fires `beforeinstallprompt` once the app qualifies for installation, and
 * it fires early — often before React has mounted. So the event is captured at
 * module scope and components subscribe to it, rather than each listening for an
 * event that already happened.
 *
 * The gate is deliberately the browser's: no event means no install offer, which is
 * exactly what should happen in Safari and Firefox, or when the app is installed
 * already.
 */
let deferred = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

/** Call once, as early as possible. */
export function watchInstallPrompt(target = globalThis) {
  if (!target?.addEventListener) {
    return;
  }
  target.addEventListener("beforeinstallprompt", (event) => {
    // Keeps Chrome's own mini-infobar away: the offer lives in the interface instead.
    event.preventDefault?.();
    deferred = event;
    emit();
  });
  target.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function getInstallPrompt() {
  return deferred;
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Shows the browser's install dialog. The captured event is single-use whatever the
 * answer, so the offer disappears either way; Chromium fires a fresh one if the app
 * still qualifies.
 */
export async function runInstallPrompt() {
  const event = deferred;
  if (!event) {
    return "unavailable";
  }
  deferred = null;
  emit();
  event.prompt();
  const choice = await event.userChoice;
  return choice?.outcome ?? "unknown";
}

/** Test seam: drops the captured event and every subscriber. */
export function resetInstallPrompt() {
  deferred = null;
  listeners.clear();
}
