/**
 * Produces the demo audit the documentation screenshots are taken from.
 *
 * The screenshots have to show a plausible tagging plan without showing a single byte
 * of client data, so the RTDS response is stubbed with an invented retail app and
 * everything downstream — the capture controller, the analysis engine, the report —
 * is the code that actually ships.
 *
 * Writes report.json (the finished report) and progress.json (a mid-capture SSE
 * payload, for the live panel shot) into the output directory.
 *
 * Usage: node docs/screenshots/make-demo.mjs [outputDir]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2] ?? path.join(os.tmpdir(), "rtds-dca-demo");
const DATA = path.join(OUT, "data");

fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(path.join(DATA, "config"), { recursive: true });

const PROFILE = "Demo Retail EU";
const token = `Bearer ${Buffer.from("app:demo-app-key:demo-secret").toString("base64")}`;
fs.writeFileSync(
  path.join(DATA, "config", "rtds-profiles.json"),
  JSON.stringify({
    profiles: { [PROFILE]: { token, region: "eu", app_key: "demo-app-key" } },
  }),
);

// Keep the demo out of the real profiles, storage and analyses.
process.env.RTDS_DCA_DATA_DIR = DATA;
process.env.RTDS_DCA_STORAGE_DIR = path.join(DATA, "analyses");
process.env.RTDS_PROFILES_PATH = path.join(DATA, "config", "rtds-profiles.json");
process.env.RTDS_DCA_REPO_ROOT = ROOT;
process.env.RTDS_DCA_SERVER_ROOT = path.join(ROOT, "server");

// ---------------------------------------------------------------- the fake app

const CUSTOM_EVENTS = [
  { name: "product_viewed", weight: 24, props: { sku: "SKU-8842", category: "sneakers", price: 89.9, currency: "EUR" } },
  { name: "add_to_cart", weight: 14, props: { sku: "SKU-8842", quantity: 1, price: 89.9, currency: "EUR" } },
  { name: "search_performed", weight: 11, props: { term: "running shoes", results: 42 } },
  { name: "wishlist_added", weight: 7, props: { sku: "SKU-1190", list: "summer" } },
  { name: "checkout_started", weight: 6, props: { cart_value: 149.8, items: 2, currency: "EUR" } },
  { name: "purchase", weight: 5, props: { order_id: "ORD-77120", value: 149.8, currency: "EUR", items: 2, payment: "card" } },
  { name: "promo_applied", weight: 4, props: { code: "SUMMER20", discount: 20 } },
  { name: "store_locator_used", weight: 3, props: { city: "Lyon", results: 6 } },
  { name: "review_submitted", weight: 2, props: { sku: "SKU-8842", rating: 4 } },
  { name: "loyalty_card_scanned", weight: 2, props: { store_id: "FR-0142" } },
  { name: "delivery_tracked", weight: 2, props: { order_id: "ORD-77120", carrier: "colissimo" } },
  { name: "size_guide_opened", weight: 1, props: { category: "sneakers" } },
  // Android only, on purpose: shows up as a platform gap in the summary.
  { name: "android_widget_tapped", weight: 1, props: { widget: "last_order" }, platforms: ["ANDROID"] },
  // Only ever seen on an old build: shows up as potentially obsolete.
  { name: "legacy_wallet_opened", weight: 1, props: { source: "menu" }, versions: ["2.9.4"] },
];

const SCREENS = [
  ["home", 26],
  ["product_detail", 22],
  ["category_list", 16],
  ["cart", 12],
  ["checkout", 8],
  ["account", 8],
  ["store_locator", 5],
  ["order_history", 3],
];

const ATTRIBUTES = [
  ["loyalty_tier", "gold", "text", 20],
  ["city", "Lyon", "text", 16],
  ["first_name", "Camille", "text", 12],
  ["birthdate", "1991-04-18", "date", 9],
  ["favourite_category", "sneakers", "text", 9],
  ["shoe_size", 42, "number", 7],
  ["newsletter_optin", "true", "text", 6],
  ["last_order_value", 149.8, "number", 5],
  ["preferred_store", "FR-0142", "text", 4],
  // Airship's own key: the report keeps these out of the client's plan.
  ["ua_country", "FR", "text", 3],
];

const TAGS = [
  ["vip", 18],
  ["newsletter", 16],
  ["sneakers_lover", 14],
  ["cart_abandoner", 12],
  ["loyalty_member", 10],
  ["push_optin", 9],
  ["store_lyon", 7],
  ["beta_tester", 3],
];

const LISTS = [
  ["promotions", 34],
  ["new_arrivals", 26],
  ["back_in_stock", 22],
  ["store_events", 18],
];

const PLATFORMS = [
  ["IOS", 54],
  ["ANDROID", 42],
  ["WEB", 4],
];

const VERSIONS = [
  ["3.2.1", 62],
  ["3.2.0", 26],
  ["3.1.0", 10],
  ["2.9.4", 2],
];

const TYPES = [
  ["CUSTOM", 46],
  ["SCREEN_VIEWED", 30],
  ["ATTRIBUTE_OPERATION", 12],
  ["TAG_CHANGE", 8],
  ["SUBSCRIPTION_LIST", 4],
];

// ------------------------------------------------------------------ generation

/** Deterministic, so two runs produce the same screenshots. */
let seed = 20260729;
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let target = random() * total;
  for (const entry of entries) {
    target -= entry[1];
    if (target <= 0) return entry[0];
  }
  return entries[entries.length - 1][0];
}

// Enough events for the real-time stop to fire on its own, which is what the summary
// screenshot then reports.
const TOTAL_EVENTS = 1_250_000;
// Every key is introduced inside this first slice; after it coverage plateaus, which
// is the state the real-time stop is waiting for.
const DISCOVERY_EVENTS = 90_000;
const SPAN_MS = 4 * 60 * 60 * 1_000;
const START = Date.parse("2026-07-28T06:00:00.000Z");

function deviceFor(platform, version, index, type) {
  // A CRM pushing profile data through the API is the common mixed-source case, so
  // only attribute writes arrive without a channel — that is what the report reads as
  // API-fed, and what puts both badges on the attribute rows.
  const apiFed = type === "ATTRIBUTE_OPERATION" && index % 3 === 0;
  const device = {
    device_type: platform,
    attributes: { app_version: version },
  };
  if (apiFed) {
    device.named_user_id = `named-${index % 5_000}`;
  } else {
    device.channel = `channel-${index % 20_000}`;
  }
  return device;
}

function bodyFor(type, index, discovering) {
  if (type === "CUSTOM") {
    const pool = discovering ? CUSTOM_EVENTS : CUSTOM_EVENTS.slice(0, 12);
    const event = pickWeighted(pool.map((entry) => [entry, entry.weight]));
    return { event, body: { name: event.name, properties: event.props } };
  }
  if (type === "SCREEN_VIEWED") {
    return { body: { viewed_screen: pickWeighted(SCREENS) } };
  }
  if (type === "ATTRIBUTE_OPERATION") {
    const row = ATTRIBUTES[Math.floor(random() * (discovering ? ATTRIBUTES.length : 9))];
    return { body: { set: [{ key: row[0], value: row[1], type: row[2] }] } };
  }
  if (type === "TAG_CHANGE") {
    const tag = pickWeighted(TAGS);
    return random() < 0.8
      ? { body: { add: { device: [tag] } } }
      : { body: { remove: { device: [tag] } } };
  }
  const list = pickWeighted(LISTS);
  return random() < 0.85
    ? { body: { enrolled: [list], scope: "APP" } }
    : { body: { canceled: [list], scope: "APP" } };
}

function eventLine(index) {
  const discovering = index < DISCOVERY_EVENTS;
  const type = pickWeighted(TYPES);
  const { event: custom, body } = bodyFor(type, index, discovering);

  let platform = pickWeighted(PLATFORMS);
  let version = pickWeighted(VERSIONS);
  if (custom?.platforms) platform = custom.platforms[0];
  if (custom?.versions) version = custom.versions[0];

  const processed = START + Math.floor((index / TOTAL_EVENTS) * SPAN_MS);
  return JSON.stringify({
    id: `demo-${index}`,
    offset: String(index + 1),
    type,
    occurred: new Date(processed - 1_500).toISOString(),
    processed: new Date(processed).toISOString(),
    device: deviceFor(platform, version, index, type),
    body,
  });
}

function ndjsonStream() {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= TOTAL_EVENTS) {
        controller.close();
        return;
      }
      const lines = [];
      const end = Math.min(index + 5_000, TOTAL_EVENTS);
      for (; index < end; index += 1) {
        lines.push(eventLine(index));
      }
      controller.enqueue(new TextEncoder().encode(`${lines.join("\n")}\n`));
    },
  });
}

globalThis.fetch = async (url) => {
  if (String(url).includes("connect.")) {
    return new Response(ndjsonStream(), {
      status: 200,
      headers: { "Content-Type": "application/vnd.urbanairship+x-ndjson" },
    });
  }
  throw new Error(`unexpected fetch to ${url}`);
};

// ----------------------------------------------------------------------- drive

const { runDataCollectionCapture } = await import(
  path.join(ROOT, "server/src/controllers/captureController.js")
);

const downloadAbort = new AbortController();
let report = null;
let progressSnapshot = null;

const started = Date.now();
for await (const chunk of runDataCollectionCapture(
  { profile: PROFILE, timezone: "Europe/Paris", stop_mode: "realtime" },
  {
    downloadSignal: downloadAbort.signal,
    analyzeSignal: new AbortController().signal,
    downloadAbort,
  },
)) {
  const payload = JSON.parse(chunk.replace(/^data: /, "").trim());

  if (payload.kind === "progress") {
    // Keep the payload closest to 45% of the way through: enough for the gauges to
    // read as a capture well under way rather than one about to finish.
    const events = payload.coverage?.events ?? 0;
    if (!progressSnapshot && events >= TOTAL_EVENTS * 0.45) progressSnapshot = payload;
  }

  if (payload.kind === "complete") report = payload.report;
  if (payload.kind === "error") {
    console.error("capture error:", payload.message, payload.detail ?? "");
    process.exit(1);
  }
}

if (!report) {
  console.error("no report produced");
  process.exit(1);
}

if (progressSnapshot) {
  // The stub hands over the whole backlog at once, so the real elapsed reads as a few
  // seconds. A screenshot showing half a million events in 3s would only puzzle the
  // reader, so the label is what reading that backlog off a live stream would cost.
  progressSnapshot.elapsedLabel = "11m 4s";
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report));
fs.writeFileSync(path.join(OUT, "progress.json"), JSON.stringify(progressSnapshot ?? {}, null, 2));

console.log(`demo audit ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  events analyzed: ${report.meta.totalEvents?.toLocaleString("en-US")}`);
console.log(`  auto-stopped:    ${report.meta.autoStopped} ${report.meta.autoStopReason ?? ""}`);
console.log(`  processed span:  ${report.meta.downloadHours?.processedRange?.spanLabel}`);
console.log(`  progress shot:   ${progressSnapshot?.coverage?.events?.toLocaleString("en-US") ?? "none"} events`);
console.log(`  written to:      ${OUT}`);
