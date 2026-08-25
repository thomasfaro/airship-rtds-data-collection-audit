import { useSyncExternalStore } from "react";
import {
  getInstallPrompt,
  runInstallPrompt,
  subscribeInstallPrompt,
} from "../lib/installPrompt.js";

/**
 * Offers to install the app locally, which puts an icon in Applications (or the
 * Dock) pointing at this server — and, thanks to sw.js, an icon that can start the
 * server again when it is down. Renders nothing unless the browser says the app
 * qualifies, so it disappears once installed.
 */
export default function InstallAppButton() {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);

  if (!prompt) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        void runInstallPrompt();
      }}
      title="Adds an icon to your applications so you can reopen the tool without the launcher"
      className="inline-flex items-center gap-1.5 rounded-pill border border-airship-border-strong bg-airship-surface px-3 py-1.5 text-xs font-semibold text-airship-navy transition hover:border-airship-blue hover:bg-airship-blue-light/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-airship-blue"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor">
        <path d="M8 1.5a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V2.25A.75.75 0 0 1 8 1.5Z" />
        <path d="M2.75 10a.75.75 0 0 1 .75.75v1.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-1.5A.75.75 0 0 1 2.75 10Z" />
      </svg>
      Install app
    </button>
  );
}
