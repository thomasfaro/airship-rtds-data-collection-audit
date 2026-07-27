import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  analyzeAuditEventsFromFile,
  createAuditAccumulator,
  finalizeAuditAccumulatorWithProgress,
  ingestAuditLine,
} from "./analyzeEvents.js";
import {
  attributeValuesSidecarPath,
  persistAttributeValuesSidecar,
  readAttributeValuesPage,
  trackAttributeValue,
} from "./attributeValues.js";

async function drainToReturn(gen) {
  while (true) {
    const step = await gen.next();
    if (step.done) return step.value;
  }
}

function sampleEvents() {
  const device = {
    platform: "ios",
    named_user_id: "user-1",
    channel: "chan-1",
    attributes: { app_version: "3.1.0", ua_sdk_version: "18.0.0" },
  };
  return [
    {
      type: "CUSTOM_EVENT",
      offset: "1",
      occurred: "2026-06-01T10:00:00.000Z",
      processed: "2026-06-01T10:00:01.000Z",
      device,
      body: { name: "add_to_cart", source: "SDK", properties: { sku: "ABC", price: 9.99 } },
    },
    {
      type: "CUSTOM_EVENT",
      offset: "2",
      occurred: "2026-06-01T11:00:00.000Z",
      processed: "2026-06-01T11:00:01.000Z",
      device,
      body: { name: "purchase", source: "SDK", properties: { total: 42 } },
    },
    {
      type: "OPEN",
      offset: "3",
      occurred: "2026-06-01T12:00:00.000Z",
      processed: "2026-06-01T12:00:01.000Z",
      device,
      body: {},
    },
    {
      type: "CUSTOM_EVENT",
      offset: "4",
      occurred: "2026-06-01T13:00:00.000Z",
      processed: "2026-06-01T13:00:01.000Z",
      device,
      body: { name: "add_to_cart", source: "SDK", properties: { sku: "XYZ" } },
    },
  ];
}

test("analysis-only accumulator yields the same core aggregates as the file analyzer", async () => {
  const events = sampleEvents();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-eq-"));
  const filePath = path.join(dir, "audit-test.ndjson");
  fs.writeFileSync(filePath, `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);

  const baseOpts = {
    profileName: "test",
    timezone: "UTC",
    windowMs: null,
    windowLabel: "no latency",
    storageMeta: { rawFileLines: events.length, rawFileBytes: 0, rawFileKept: false },
    auditContext: { streamMode: "earliest_manual" },
  };

  try {
    const fileReport = await drainToReturn(analyzeAuditEventsFromFile(filePath, { ...baseOpts }));

    const acc = createAuditAccumulator();
    for (const event of events) ingestAuditLine(acc, JSON.stringify(event), "UTC");
    const accReport = await drainToReturn(
      finalizeAuditAccumulatorWithProgress(acc, { ...baseOpts, filePath: null, skipBackfill: true }),
    );

    assert.equal(accReport.meta.totalEvents, fileReport.meta.totalEvents);
    assert.equal(accReport.customEvents.total, fileReport.customEvents.total);
    assert.deepEqual(accReport.customEvents, fileReport.customEvents);
    assert.deepEqual(accReport.byDeviceType, fileReport.byDeviceType);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ingestAuditLine returns the event offset from a single parse", () => {
  const acc = createAuditAccumulator();
  const event = sampleEvents()[0];
  const offset = ingestAuditLine(acc, JSON.stringify(event), "UTC");
  assert.equal(offset, "1");
  assert.equal(acc.parseErrors, 0);
  assert.equal(acc.processErrors, 0);
});

test("ingestAuditLine returns null and records a parse error on bad JSON", () => {
  const acc = createAuditAccumulator();
  const offset = ingestAuditLine(acc, "{not-json", "UTC");
  assert.equal(offset, null);
  assert.equal(acc.parseErrors, 1);
});

test("attribute value sidecar resolves without a raw NDJSON file present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-sidecar-"));
  // Synthetic stem only — the .ndjson is never written (analysis-only).
  const ndjsonPath = path.join(dir, "audit-analysis-only.ndjson");

  const row = { valueCounts: {} };
  trackAttributeValue(row, "blue", "ios");
  trackAttributeValue(row, "blue", "ios");
  trackAttributeValue(row, "red", "android");

  const written = persistAttributeValuesSidecar(ndjsonPath, { favorite_color: row });

  try {
    assert.equal(fs.existsSync(ndjsonPath), false, "raw NDJSON must not exist");
    assert.equal(fs.existsSync(attributeValuesSidecarPath(ndjsonPath)), true, "sidecar exists");
    assert.ok(written);

    const page = readAttributeValuesPage(ndjsonPath, "favorite_color", { offset: 0, limit: 50 });
    assert.equal(page.total, 2);
    assert.deepEqual(
      page.values.map((v) => v.value).sort(),
      ["blue", "red"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
