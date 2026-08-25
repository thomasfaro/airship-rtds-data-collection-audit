import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-values-"));
const storageDir = path.join(dataDir, "analyses");
fs.mkdirSync(storageDir, { recursive: true });
process.env.RTDS_DCA_DATA_DIR = dataDir;
process.env.RTDS_DCA_STORAGE_DIR = storageDir;
process.env.RTDS_PROFILES_PATH = path.join(dataDir, "config", "rtds-profiles.json");

const { persistAttributeValuesSidecar, trackAttributeValue } = await import(
  "../audit/attributeValues.js"
);
const { persistCustomPropertyValuesSidecar, trackCustomPropertyValue } = await import(
  "../audit/customEventPropertyValues.js"
);
const { persistStoredAuditReport } = await import("../audit/storedAuditReport.js");
const { default: valueRoutes } = await import("../routes/values.js");
const { default: historyRoutes } = await import("../routes/history.js");

const CAPTURE = "capture-Demo-1.ndjson";
const capturePath = path.join(storageDir, CAPTURE);

function seedCapture() {
  const attributeRow = { count: 0 };
  trackAttributeValue(attributeRow, "Paris", "IOS");
  trackAttributeValue(attributeRow, "Paris", "ANDROID");
  trackAttributeValue(attributeRow, "Lyon", "IOS");
  persistAttributeValuesSidecar(capturePath, { city: attributeRow });

  const bucket = { count: 1 };
  trackCustomPropertyValue(bucket, "sku", "A1", "IOS");
  trackCustomPropertyValue(bucket, "sku", "A2", "IOS");
  persistCustomPropertyValuesSidecar(capturePath, { SDK: { purchase: bucket } });

  persistStoredAuditReport(capturePath, {
    meta: {
      profile: "Demo",
      timezone: "UTC",
      totalEvents: 3,
      stopMode: "manual",
      startPosition: "earliest",
      autoStopped: false,
      generatedAt: "2026-07-27T12:00:00.000Z",
    },
    customEvents: { sdk: { top: [{ name: "purchase" }] }, api: { top: [{ name: "purchase" }] } },
    attributes: { topKeys: [{ key: "city" }] },
    tags: { topAdded: [{ key: "vip" }], topRemoved: [{ key: "vip" }] },
    screenViewed: { top: [{ name: "home" }, { name: "cart" }] },
    subscriptionLists: { byList: [{ listId: "newsletter" }] },
  });
}

const app = express();
app.use(express.json());
app.use("/api/values", valueRoutes);
app.use("/api/history", historyRoutes);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

seedCapture();

const get = async (url) => {
  const response = await fetch(`${base}${url}`);
  return { status: response.status, body: await response.json() };
};

test("attribute values are served from the sidecar with platform breakdowns", async () => {
  const { status, body } = await get(
    `/api/values/attributes?name=${encodeURIComponent(CAPTURE)}&key=city`,
  );
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.total, 2);
  const paris = body.values.find((v) => v.value === "Paris");
  assert.equal(paris.count, 2);
  assert.deepEqual(
    paris.deviceTypes.map((d) => d.deviceType).sort(),
    ["ANDROID", "IOS"],
  );
});

test("attribute values paginate", async () => {
  const { body } = await get(
    `/api/values/attributes?name=${encodeURIComponent(CAPTURE)}&key=city&offset=1&limit=1`,
  );
  assert.equal(body.values.length, 1);
  assert.equal(body.total, 2);
});

test("custom property values are served from the sidecar", async () => {
  const { status, body } = await get(
    `/api/values/custom-properties?name=${encodeURIComponent(CAPTURE)}&source=SDK&event=purchase&property=sku`,
  );
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  assert.deepEqual(
    body.values.map((v) => v.value).sort(),
    ["A1", "A2"],
  );
});

test("missing query params return 400", async () => {
  assert.equal((await get("/api/values/attributes?key=city")).status, 400);
  assert.equal((await get(`/api/values/attributes?name=${CAPTURE}`)).status, 400);
  assert.equal((await get("/api/values/custom-properties?name=x&source=SDK")).status, 400);
});

test("unknown captures and keys return 404", async () => {
  assert.equal((await get("/api/values/attributes?name=nope.ndjson&key=city")).status, 404);
  const { status, body } = await get(
    `/api/values/attributes?name=${encodeURIComponent(CAPTURE)}&key=unknown_key`,
  );
  assert.equal(status, 200);
  assert.equal(body.total, 0);
});

test("path traversal in the capture name is rejected", async () => {
  const { status, body } = await get(
    "/api/values/attributes?name=..%2F..%2Fetc%2Fpasswd&key=city",
  );
  assert.equal(status, 400);
  assert.match(body.error, /Invalid capture name/);
});

test("history lists the saved analysis with its coverage summary", async () => {
  const { status, body } = await get("/api/history");
  assert.equal(status, 200);
  assert.equal(body.items.length, 1);
  const [item] = body.items;
  assert.equal(item.name, CAPTURE);
  assert.equal(item.profile, "Demo");
  assert.equal(item.totalEvents, 3);
  assert.equal(item.stopMode, "manual");
  assert.deepEqual(item.coverage, {
    customEvents: 1,
    attributes: 1,
    tags: 1,
    screens: 2,
    subscriptionLists: 1,
  });
});

test("a saved analysis can be reopened", async () => {
  const { status, body } = await get(`/api/history/report?name=${encodeURIComponent(CAPTURE)}`);
  assert.equal(status, 200);
  assert.equal(body.report.meta.profile, "Demo");
  assert.ok(body.savedAt);
});

test("reopening an unknown analysis returns 404", async () => {
  assert.equal((await get("/api/history/report?name=missing.ndjson")).status, 404);
});

test("deleting an analysis removes the report and its value sidecars", async () => {
  const response = await fetch(
    `${base}/api/history/item?name=${encodeURIComponent(CAPTURE)}`,
    { method: "DELETE" },
  );
  assert.equal(response.status, 200);

  const remaining = fs.readdirSync(storageDir);
  assert.deepEqual(remaining, [], `expected an empty storage dir, found ${remaining.join(", ")}`);
  assert.deepEqual((await get("/api/history")).body.items, []);
});

test.after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
