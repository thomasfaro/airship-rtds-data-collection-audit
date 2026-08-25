import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-history-live-"));
const storageDir = path.join(dataDir, "analyses");
fs.mkdirSync(storageDir, { recursive: true });
process.env.RTDS_DCA_DATA_DIR = dataDir;
process.env.RTDS_DCA_STORAGE_DIR = storageDir;
process.env.RTDS_PROFILES_PATH = path.join(dataDir, "config", "rtds-profiles.json");

const { persistStoredAuditReport } = await import("../audit/storedAuditReport.js");
const { default: historyRoutes } = await import("../routes/history.js");
const {
  registerLiveStream,
  resetLiveStreamsForTests,
} = await import("../live/streamRegistry.js");

const CAPTURE = "capture-Demo-1.ndjson";
persistStoredAuditReport(path.join(storageDir, CAPTURE), {
  meta: { profile: "Demo", totalEvents: 3, stopMode: "manual" },
});

const LIVE = "live-Demo-550e8400-e29b-41d4-a716-446655440000.ndjson";
const liveBody = '{"occurred":"2026-08-01T12:00:00.000Z","type":"CUSTOM"}\n';
fs.writeFileSync(path.join(storageDir, LIVE), liveBody);

const app = express();
app.use("/api/history", historyRoutes);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  resetLiveStreamsForTests();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("history lists audit reports and kept live ndjson together", async () => {
  const response = await fetch(`${base}/api/history`);
  const body = await response.json();
  assert.equal(response.status, 200);
  const kinds = Object.fromEntries(body.items.map((item) => [item.kind, item]));
  assert.equal(kinds.audit?.name, CAPTURE);
  assert.equal(kinds.live?.name, LIVE);
  assert.equal(kinds.live?.totalEvents, 1);
});

test("raw download streams the live file and rejects path traversal", async () => {
  const ok = await fetch(`${base}/api/history/raw?name=${encodeURIComponent(LIVE)}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(await ok.text(), liveBody);

  const traversal = await fetch(`${base}/api/history/raw?name=${encodeURIComponent("../secret.ndjson")}`);
  assert.equal(traversal.status, 400);
});

test("deleting a locked live file returns 409, then succeeds after unlock", async () => {
  registerLiveStream("active", {
    filePath: path.join(storageDir, LIVE),
    profileName: "Demo",
    storeRaw: true,
  });
  const locked = await fetch(`${base}/api/history/item?name=${encodeURIComponent(LIVE)}`, {
    method: "DELETE",
  });
  assert.equal(locked.status, 409);
  resetLiveStreamsForTests();

  const deleted = await fetch(`${base}/api/history/item?name=${encodeURIComponent(LIVE)}`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 200);
  assert.equal(fs.existsSync(path.join(storageDir, LIVE)), false);
});
