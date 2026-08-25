/*
 * Renders the real screens with the demo audit, for the documentation screenshots.
 *
 * Copied into frontend/.shots/ and bundled there by shoot.sh, because esbuild resolves
 * react from the importing file upwards. Fetch is stubbed rather than pointed at a
 * running server: the shots stay reproducible, and no client profile or saved audit can
 * leak into them. Everything else — components, styles, and the report itself — is what
 * ships.
 */
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import AppNav from "../src/components/AppNav.jsx";
import CaptureProgressPanel from "../src/components/capture/CaptureProgressPanel.jsx";
import CoverageSummary from "../src/components/summary/CoverageSummary.jsx";
import { CaptureSessionProvider } from "../src/contexts/CaptureSessionContext.jsx";
import { LiveStreamProvider } from "../src/contexts/LiveStreamContext.jsx";
import { ProfilesProvider } from "../src/contexts/ProfilesContext.jsx";
import CapturePage from "../src/pages/CapturePage.jsx";
import LiveSetupPage from "../src/pages/LiveSetupPage.jsx";
import SettingsPage from "../src/pages/SettingsPage.jsx";
import progress from "./progress.json";
import report from "./report.json";

const PROFILE = "Demo Retail EU";

const ANSWERS = {
  "/api/bootstrap": { ok: true, localApiKey: "screenshot", localOnly: true },
  "/api/health": {
    ok: true,
    service: "rtds-data-collection-audit",
    version: { version: "1.1.0", commit: "0000000", commitDate: null },
  },
  "/api/profiles": {
    ok: true,
    profiles: [
      { name: PROFILE, region: "eu", app_key_masked: "demo…key", has_token: true, decrypt_failed: false },
    ],
    names: [PROFILE],
    configPathLabel: "config/rtds-profiles.json",
    decryptFailures: 0,
  },
  "/api/capture/options": { ok: true, windowHours: [1, 6, 12, 24, 48, 72] },
  // Nothing to say about updates in a documentation screenshot.
  "/api/updates": { ok: true, state: "current", running: {}, disk: {}, behind: 0 },
};

globalThis.fetch = async (input) => {
  const body = ANSWERS[String(input).split("?")[0]];
  return new Response(JSON.stringify(body ?? {}), {
    status: body ? 200 : 404,
    headers: { "Content-Type": "application/json" },
  });
};

// The capture form pre-fills the project it was last used with.
localStorage.setItem("rtds-dca-last-profile", PROFILE);

function Shell({ children }) {
  return (
    <HashRouter>
      <ProfilesProvider>
        <CaptureSessionProvider>
          <LiveStreamProvider>
            <div className="app-shell">
              <AppNav />
              <main className="page-container max-w-5xl">{children}</main>
            </div>
          </LiveStreamProvider>
        </CaptureSessionProvider>
      </ProfilesProvider>
    </HashRouter>
  );
}

const SCREENS = {
  projects: () => <SettingsPage />,
  capture: () => <CapturePage />,
  live: () => <LiveSetupPage />,
  running: () => (
    <CaptureProgressPanel
      profile={PROFILE}
      stopMode="realtime"
      status={progress.status ?? "Capturing tracking events…"}
      progress={progress}
      stopping={false}
      onStop={() => {}}
    />
  ),
  summary: () => <CoverageSummary report={report} onNewCapture={() => {}} />,
};

const screen = window.location.hash.replace("#", "") || "capture";
createRoot(document.getElementById("root")).render(
  <Shell>{(SCREENS[screen] ?? SCREENS.capture)()}</Shell>,
);
