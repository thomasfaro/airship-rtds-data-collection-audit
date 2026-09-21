/**
 * Runs a capture end to end — the real controller, the real engine — over an invented
 * app, with every source of variation pinned. What comes out can be compared to a
 * committed golden, which is how a refactor proves it changed no behaviour.
 *
 * Three things are pinned, and each one would otherwise make the report differ between
 * two runs of identical code: the RTDS stream (fixed seed), the clock (every duration,
 * timestamp and SDK age is read from it) and the GitHub release lookup (a network call
 * the enrichment makes unconditionally).
 *
 * Two values survive as noise and are normalised instead: the random stem a capture
 * stores itself under, and the version of the app that produced the report.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoNdjsonStream } from "./demoStream.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

export const GOLDEN_REPORT_PATH = path.join(HERE, "report.json");

const PROFILE = "Demo Retail EU";
const FROZEN_NOW_MS = Date.parse("2026-07-29T09:00:00.000Z");
const GOLDEN_STEM = "golden-capture";
const GOLDEN_APP_VERSION = "0.0.0-golden";

/** Small enough to run inside a test, long enough to introduce every key. */
const GOLDEN_STREAM = { totalEvents: 20_000, discoveryEvents: 20_000 };

/**
 * The capture ends on its own, the way a real-time one does. A manual capture would
 * never end here: the stub hands over a finite backlog, and the end of a stream is a
 * disconnection the reconnect loop answers by opening another one.
 *
 * The thresholds are the `rt_*` overrides, which exist for exactly this — tuning a
 * single run. Scaled to the invented app: every key appears in its first few hundred
 * events, so a plateau is real long before the standard 100k margin would say so.
 */
const GOLDEN_STOP = {
  stop_mode: "realtime",
  rt_min_events: "5000",
  rt_min_span_ms: "600000",
  rt_margin: "2000",
  rt_plateau_span_ms: "60000",
};

/** Two releases per platform: one recent, one old enough to read as stale. */
const SDK_RELEASES = [
  { tag_name: "19.2.0", published_at: "2026-06-02T10:00:00Z" },
  { tag_name: "17.0.0", published_at: "2024-01-15T10:00:00Z" },
];

function freezeClock() {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(FROZEN_NOW_MS);
        return;
      }
      super(...args);
    }
    static now() {
      return FROZEN_NOW_MS;
    }
  }
  globalThis.Date = FrozenDate;
  return () => {
    globalThis.Date = RealDate;
  };
}

function stubFetch() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("connect.")) {
      return new Response(createDemoNdjsonStream(GOLDEN_STREAM), {
        status: 200,
        headers: { "Content-Type": "application/vnd.urbanairship+x-ndjson" },
      });
    }
    if (target.includes("api.github.com")) {
      const firstPage = target.includes("page=1");
      return new Response(JSON.stringify(firstPage ? SDK_RELEASES : []), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch to ${target}`);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

function prepareDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-golden-"));
  fs.mkdirSync(path.join(dir, "config"), { recursive: true });
  const token = `Bearer ${Buffer.from("app:demo-app-key:demo-secret").toString("base64")}`;
  fs.writeFileSync(
    path.join(dir, "config", "rtds-profiles.json"),
    JSON.stringify({
      profiles: { [PROFILE]: { token, region: "eu", app_key: "demo-app-key" } },
    }),
  );

  process.env.RTDS_DCA_DATA_DIR = dir;
  process.env.RTDS_DCA_STORAGE_DIR = path.join(dir, "analyses");
  process.env.RTDS_PROFILES_PATH = path.join(dir, "config", "rtds-profiles.json");
  process.env.RTDS_DCA_REPO_ROOT = REPO_ROOT;
  process.env.RTDS_DCA_SERVER_ROOT = path.join(REPO_ROOT, "server");
  return dir;
}

/**
 * Replaces the two values that legitimately differ between two runs of the same code,
 * and folds the sample buckets into digests. Those buckets are nine tenths of the
 * report by weight and the one part nobody reads line by line; a digest still fails
 * the moment a sampled event changes, and leaves a golden a human can open.
 */
function normalizeReport(report) {
  const stem = report?.meta?.storage?.sourceFileName?.replace(/\.ndjson$/, "");
  let serialized = JSON.stringify(report);
  if (stem) serialized = serialized.split(stem).join(GOLDEN_STEM);
  const normalized = JSON.parse(serialized);

  if (normalized?.meta?.appVersion) normalized.meta.appVersion = GOLDEN_APP_VERSION;
  if (Array.isArray(normalized.eventSamples)) {
    normalized.eventSamples = normalized.eventSamples.map(({ events, ...bucket }) => ({
      ...bucket,
      eventCount: events?.length ?? 0,
      eventsDigest: createHash("sha256").update(JSON.stringify(events ?? [])).digest("hex").slice(0, 16),
    }));
  }
  return normalized;
}

export async function runGoldenCapture() {
  const dataDir = prepareDataDir();
  const restoreClock = freezeClock();
  const restoreFetch = stubFetch();

  try {
    const { runDataCollectionCapture } = await import("../../controllers/captureController.js");
    const downloadAbort = new AbortController();
    let report = null;

    for await (const chunk of runDataCollectionCapture(
      { profile: PROFILE, timezone: "Europe/Paris", ...GOLDEN_STOP },
      {
        downloadSignal: downloadAbort.signal,
        analyzeSignal: new AbortController().signal,
        downloadAbort,
      },
    )) {
      const payload = JSON.parse(chunk.replace(/^data: /, "").trim());
      if (payload.kind === "complete") report = payload.report;
      if (payload.kind === "error") {
        throw new Error(`golden capture failed: ${payload.message} ${payload.detail ?? ""}`);
      }
    }

    if (!report) throw new Error("golden capture produced no report");
    return normalizeReport(report);
  } finally {
    restoreFetch();
    restoreClock();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

export function readGoldenReport() {
  return JSON.parse(fs.readFileSync(GOLDEN_REPORT_PATH, "utf8"));
}

export function writeGoldenReport(report) {
  fs.writeFileSync(GOLDEN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}
