/**
 * Produces the demo audit the documentation screenshots are taken from.
 *
 * The screenshots have to show a plausible tagging plan without showing a single byte
 * of client data, so the RTDS response is stubbed with an invented retail app and
 * everything downstream — the capture controller, the analysis engine, the report —
 * is the code that actually ships. The invented app itself lives with the golden
 * capture, so a screenshot and a golden describe the same fictional client.
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
import {
  DEMO_STREAM_DEFAULTS,
  createDemoNdjsonStream,
} from "../../server/src/capture/golden/demoStream.js";

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

const TOTAL_EVENTS = DEMO_STREAM_DEFAULTS.totalEvents;

globalThis.fetch = async (url) => {
  if (String(url).includes("connect.")) {
    return new Response(createDemoNdjsonStream(), {
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
