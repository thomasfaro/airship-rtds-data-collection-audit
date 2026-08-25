/**
 * Registers sw.js, whose only job is to answer navigations with offline.html when
 * the local server is down — so the installed icon stays a working entry point.
 *
 * Skipped in dev: Vite serves the UI on another port, and a fallback worker there
 * would only get in the way of hot reloading.
 */
export function registerFallbackWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    // Service workers need a secure context: 127.0.0.1 qualifies, a LAN address
    // over plain http does not. Failing there is fine and not worth a warning.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
