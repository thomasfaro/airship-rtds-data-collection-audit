import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-capture-"));
const token = `Bearer ${Buffer.from("app:test-app-key:secret").toString("base64")}`;
fs.mkdirSync(path.join(dataDir, "config"), { recursive: true });
fs.writeFileSync(
  path.join(dataDir, "config", "rtds-profiles.json"),
  JSON.stringify({ profiles: { Demo: { token, region: "eu", app_key: "test-app-key" } } }),
);

process.env.RTDS_DCA_DATA_DIR = dataDir;
process.env.RTDS_DCA_STORAGE_DIR = path.join(dataDir, "analyses");
process.env.RTDS_PROFILES_PATH = path.join(dataDir, "config", "rtds-profiles.json");

const { runDataCollectionCapture } = await import("./captureController.js");

function trackingEvent(overrides = {}) {
  return JSON.stringify({
    id: overrides.id ?? "evt-1",
    offset: overrides.offset ?? "1",
    type: overrides.type ?? "CUSTOM",
    occurred: overrides.occurred ?? "2026-07-27T10:00:00.000Z",
    processed: overrides.processed ?? "2026-07-27T10:00:01.000Z",
    device: {
      device_type: "IOS",
      channel: "chan-1",
      attributes: { app_version: "3.2.0" },
      ...overrides.device,
    },
    body: overrides.body ?? { name: "purchase", properties: { sku: "A1" } },
  });
}

/** Serve a fixed NDJSON payload once, then an empty stream so reconnects end fast. */
function stubRtds(lines) {
  const original = globalThis.fetch;
  let served = false;
  globalThis.fetch = async () => {
    const payload = served ? "" : `${lines.join("\n")}\n`;
    served = true;
    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "application/vnd.urbanairship+x-ndjson" },
    });
  };
  return () => {
    globalThis.fetch = original;
  };
}

async function collect(query, { stopAfterEvents = null } = {}) {
  const downloadAbort = new AbortController();
  const messages = [];
  const generator = runDataCollectionCapture(query, {
    downloadSignal: downloadAbort.signal,
    analyzeSignal: new AbortController().signal,
    downloadAbort,
  });
  for await (const chunk of generator) {
    const payload = JSON.parse(chunk.replace(/^data: /, "").trim());
    messages.push(payload);
    if (
      stopAfterEvents != null &&
      payload.kind === "progress" &&
      (payload.coverage?.events ?? 0) >= stopAfterEvents
    ) {
      downloadAbort.abort();
    }
  }
  return messages;
}

test("rejects an invalid stop mode before touching RTDS", async () => {
  const messages = await collect({ profile: "Demo", stop_mode: "someday" });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "error");
  assert.match(messages[0].message, /stop_mode must be one of/);
});

test("requires a project", async () => {
  const messages = await collect({});
  assert.deepEqual(messages, [{ kind: "error", message: "No project selected" }]);
});

test("reports an unknown project", async () => {
  const messages = await collect({ profile: "Nope" });
  assert.equal(messages[0].kind, "error");
  assert.match(messages[0].message, /Unknown RTDS profile/);
});

test("captures tracking events and completes with a tagging plan report", async () => {
  const restore = stubRtds([
    trackingEvent({ id: "a", offset: "1" }),
    trackingEvent({
      id: "b",
      offset: "2",
      type: "SCREEN_VIEWED",
      body: { viewed_screen: "home" },
    }),
    trackingEvent({
      id: "c",
      offset: "3",
      type: "TAG_CHANGE",
      body: { add: { device: ["vip"] } },
    }),
  ]);
  try {
    const messages = await collect({ profile: "Demo", timezone: "UTC" }, { stopAfterEvents: 3 });
    const complete = messages.find((m) => m.kind === "complete");
    assert.ok(complete, "expected a complete message");

    const { report } = complete;
    assert.equal(report.meta.taggingPlanMode, true);
    assert.equal(report.meta.stopMode, "manual");
    assert.equal(report.meta.startPosition, "earliest");
    assert.equal(report.meta.realTime, false);
    assert.equal(report.meta.autoStopped, false);
    assert.equal(report.meta.storage.analysisOnly, true);
    assert.equal(report.meta.storage.rawFileKept, false);
    assert.ok(report.meta.storage.sourceFileName, "export needs a storage stem for value lookups");
    assert.equal(report.meta.totalEvents, 3);
    assert.deepEqual(report.meta.typesRequested, [
      "ATTRIBUTE_OPERATION",
      "CUSTOM",
      "SCREEN_VIEWED",
      "SUBSCRIPTION_LIST",
      "TAG_CHANGE",
    ]);
  } finally {
    restore();
  }
});

test("report rows expose the fields the summary screen and the exporter read", async () => {
  const restore = stubRtds([
    trackingEvent({ id: "a", offset: "1" }),
    trackingEvent({
      id: "b",
      offset: "2",
      device: { device_type: "ANDROID", channel: "chan-2", attributes: { app_version: "3.2.0" } },
    }),
    trackingEvent({
      id: "c",
      offset: "3",
      type: "ATTRIBUTE_OPERATION",
      body: { attributes: [{ action: "set", key: "city", value: "Paris" }] },
    }),
    trackingEvent({
      id: "d",
      offset: "4",
      type: "SUBSCRIPTION_LIST",
      body: { subscription_lists: [{ action: "subscribe", list_id: "news" }] },
    }),
  ]);
  try {
    const messages = await collect({ profile: "Demo", timezone: "UTC" }, { stopAfterEvents: 4 });
    const { report } = messages.find((m) => m.kind === "complete");

    const [purchase] = report.customEvents.sdk.top;
    assert.equal(purchase.name, "purchase");
    assert.equal(purchase.source, "SDK");
    assert.deepEqual(
      purchase.byDeviceBreakdown.map((entry) => entry.deviceType).sort(),
      ["ANDROID", "IOS"],
      "platform pills are built from byDeviceBreakdown",
    );
    assert.equal(purchase.versionScope.maxAppVersion, "3.2.0");
    assert.deepEqual(
      purchase.propertyValueStats.map((stat) => stat.property),
      ["sku"],
    );

    const [city] = report.attributes.topKeys;
    assert.equal(city.key, "city");
    assert.equal(city.sources.SDK, 1, "attribute sources are a per-source count map");
    assert.ok(Array.isArray(city.byDeviceBreakdown));

    const [news] = report.subscriptionLists.byList;
    assert.equal(news.listId, "news");
    assert.equal(news.subscribe, 1);
  } finally {
    restore();
  }
});

test("download progress carries the per-category coverage breakdown", async () => {
  const restore = stubRtds([trackingEvent({ id: "a" }), trackingEvent({ id: "b" })]);
  try {
    const messages = await collect({ profile: "Demo", timezone: "UTC" }, { stopAfterEvents: 2 });
    const withCoverage = messages.filter((m) => m.kind === "progress" && m.coverage);
    assert.ok(withCoverage.length > 0, "expected coverage on progress events");
    const last = withCoverage.at(-1);
    assert.equal(typeof last.coverage.keys.customEvents, "number");
    assert.equal(typeof last.coverage.keys.attributes, "number");
    assert.equal(typeof last.coverage.keys.tags, "number");
    assert.equal(typeof last.coverage.keys.screens, "number");
    assert.equal(typeof last.coverage.keys.subscriptionLists, "number");
    assert.equal(last.coverage.keys.total >= 1, true);
    assert.equal(last.coverage.autoStop, undefined, "manual stop has no auto-stop progress");
  } finally {
    restore();
  }
});

test("real-time mode exposes progress toward each auto-stop condition", async () => {
  const restore = stubRtds([trackingEvent({ id: "a" }), trackingEvent({ id: "b" })]);
  try {
    const messages = await collect(
      { profile: "Demo", timezone: "UTC", stop_mode: "realtime", rt_preset: "fast" },
      { stopAfterEvents: 2 },
    );
    const last = messages.filter((m) => m.kind === "progress" && m.coverage?.autoStop).at(-1);
    assert.ok(last, "expected auto-stop progress in real-time mode");
    const { autoStop } = last.coverage;
    assert.equal(autoStop.events.target, 100_000);
    assert.equal(autoStop.processedSpanMs.target, 30 * 60 * 1000);
    assert.equal(autoStop.eventsSinceLastNewKey.target, 25_000);
    assert.equal(autoStop.spanSinceLastNewKeyMs.target, 10 * 60 * 1000);

    const complete = messages.find((m) => m.kind === "complete");
    assert.equal(complete.report.meta.realTime, true);
    assert.equal(complete.report.meta.realtimeThresholds.preset, "fast");
  } finally {
    restore();
  }
});

test("stopping before any event yields an explicit error", async () => {
  const restore = stubRtds([]);
  try {
    const downloadAbort = new AbortController();
    const messages = [];
    const generator = runDataCollectionCapture(
      { profile: "Demo", timezone: "UTC" },
      { downloadSignal: downloadAbort.signal, downloadAbort },
    );
    downloadAbort.abort();
    for await (const chunk of generator) {
      messages.push(JSON.parse(chunk.replace(/^data: /, "").trim()));
    }
    assert.equal(messages.at(-1).kind, "error");
  } finally {
    restore();
  }
});

test("the finished analysis is saved so it can be reopened later", async () => {
  const restore = stubRtds([trackingEvent({ id: "a" })]);
  try {
    const messages = await collect({ profile: "Demo", timezone: "UTC" }, { stopAfterEvents: 1 });
    const complete = messages.find((m) => m.kind === "complete");
    const stem = complete.report.meta.storage.sourceFileName.replace(/\.ndjson$/, "");
    const saved = fs
      .readdirSync(process.env.RTDS_DCA_STORAGE_DIR)
      .filter((name) => name.startsWith(stem));
    assert.ok(
      saved.some((name) => name.endsWith(".audit-report.json")),
      `expected a saved report among ${saved.join(", ")}`,
    );
  } finally {
    restore();
  }
});

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
