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
import DisplayFilters from "../src/components/DisplayFilters.jsx";
import LiveMonitorHeader from "../src/components/LiveMonitorHeader.jsx";
import LiveRequestSummary from "../src/components/LiveRequestSummary.jsx";
import StreamTimeline from "../src/components/StreamTimeline.jsx";
import { VirtualStreamList } from "../src/components/VirtualStreamList.jsx";
import CaptureProgressPanel from "../src/components/capture/CaptureProgressPanel.jsx";
import CoverageSummary from "../src/components/summary/CoverageSummary.jsx";
import { CaptureSessionProvider } from "../src/contexts/CaptureSessionContext.jsx";
import { INITIAL_FILTERS, LiveStreamProvider } from "../src/contexts/LiveStreamContext.jsx";
import { ProfilesProvider } from "../src/contexts/ProfilesContext.jsx";
import { EMPTY_DISPLAY_FILTERS, allEventTypeOptions } from "../src/lib/eventRegistry.js";
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

/*
 * A short QA session for the live monitor shot: one tester walking the purchase funnel
 * on the same invented retail app the demo audit uses. Written out rather than streamed
 * because the monitor reads its entries from a context an SSE fills — and a fixture is
 * the only way to be certain no real event can ever reach a screenshot.
 */
const SESSION_START = Date.parse("2026-07-28T14:32:10.000Z");
const TESTER = "camille.d";
const CHANNEL = "9f2c1a7e-4d38-4b90-b7a1-2e6f5c0d8a34";

const SESSION = [
  [0, "SCREEN_VIEWED", { viewed_screen: "home" }],
  [2_400, "CUSTOM", { name: "search_performed", properties: { term: "running shoes", results: 42 } }],
  [5_100, "SCREEN_VIEWED", { viewed_screen: "category_list" }],
  [7_800, "SCREEN_VIEWED", { viewed_screen: "product_detail" }],
  [9_200, "CUSTOM", { name: "product_viewed", properties: { sku: "SKU-8842", category: "sneakers", price: 89.9, currency: "EUR" } }],
  [13_600, "CUSTOM", { name: "add_to_cart", properties: { sku: "SKU-8842", quantity: 1, price: 89.9, currency: "EUR" } }],
  [15_000, "TAG_CHANGE", { add: { device: ["cart_abandoner"] } }],
  [18_300, "SCREEN_VIEWED", { viewed_screen: "cart" }],
  [21_700, "CUSTOM", { name: "promo_applied", properties: { code: "SUMMER20", discount: 20 } }],
  [24_100, "SCREEN_VIEWED", { viewed_screen: "checkout" }],
  [26_500, "CUSTOM", { name: "checkout_started", properties: { cart_value: 149.8, items: 2, currency: "EUR" } }],
  [31_900, "CUSTOM", { name: "purchase", properties: { order_id: "ORD-77120", value: 149.8, currency: "EUR", items: 2, payment: "card" } }],
  [33_200, "ATTRIBUTE_OPERATION", { set: [{ key: "last_order_value", value: 149.8, type: "number" }] }],
  [34_600, "TAG_CHANGE", { add: { device: ["vip"] } }],
  [38_400, "SUBSCRIPTION_LIST", { enrolled: ["back_in_stock"], scope: "APP" }],
];

const LIVE_ENTRIES = SESSION.map(([offsetMs, type, body], index) => {
  const occurred = new Date(SESSION_START + offsetMs);
  return {
    id: index + 1,
    kind: "event",
    receivedAt: occurred.getTime() + 900,
    event: {
      id: `demo-live-${index}`,
      offset: String(index + 1),
      type,
      occurred: occurred.toISOString(),
      processed: new Date(occurred.getTime() + 900).toISOString(),
      device: {
        device_type: "IOS",
        channel: CHANNEL,
        named_user_id: TESTER,
        attributes: { app_version: "3.2.1" },
      },
      body,
    },
  };
});

const LIVE_REQUEST = {
  ...INITIAL_FILTERS,
  profile: PROFILE,
  named_user: TESTER,
  timezone: "Europe/Paris",
};

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

/*
 * The monitor, assembled from the same components LiveMonitorPage arranges, because the
 * page itself reads everything from a live context. Keep the container classes in step
 * with that page or the shot stops looking like the screen it documents.
 */
function LiveMonitor() {
  return (
    <div className="-mx-4 flex h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)] flex-col overflow-hidden md:-mx-6">
      <LiveMonitorHeader
        status={{ text: "Streaming", tone: "" }}
        isLive
        visibleCount={LIVE_ENTRIES.length}
        eventCount={LIVE_ENTRIES.length}
        onClear={() => {}}
        onStop={() => {}}
      />
      <LiveRequestSummary compact filters={LIVE_REQUEST} requestLabel={null} />
      <DisplayFilters
        compact
        filters={EMPTY_DISPLAY_FILTERS}
        eventTypeOptions={allEventTypeOptions()}
        onChange={() => {}}
        onClear={() => {}}
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-hidden px-2 pb-2">
        <StreamTimeline
          layout="sidebar"
          entries={LIVE_ENTRIES}
          timezone="Europe/Paris"
          onSeek={() => {}}
        />
        <VirtualStreamList entries={LIVE_ENTRIES} timezone="Europe/Paris" isLive />
      </div>
    </div>
  );
}

const SCREENS = {
  projects: () => <SettingsPage />,
  capture: () => <CapturePage />,
  live: () => <LiveSetupPage />,
  monitor: () => <LiveMonitor />,
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
