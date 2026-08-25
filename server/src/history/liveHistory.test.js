import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isLiveHistoryName,
  listLiveHistoryItems,
  parseLiveFileName,
} from "./liveHistory.js";
import {
  registerLiveStream,
  resetLiveStreamsForTests,
} from "../live/streamRegistry.js";

test.afterEach(() => {
  resetLiveStreamsForTests();
});

test("isLiveHistoryName accepts live-*.ndjson and rejects audit stems", () => {
  assert.equal(
    isLiveHistoryName("live-Demo-550e8400-e29b-41d4-a716-446655440000.ndjson"),
    true,
  );
  assert.equal(isLiveHistoryName("capture-Demo-1.ndjson"), false);
});

test("parseLiveFileName reads the profile slug", () => {
  const parsed = parseLiveFileName("live-Demo-550e8400-e29b-41d4-a716-446655440000.ndjson");
  assert.equal(parsed.profileSlug, "Demo");
  assert.equal(parsed.streamId, "550e8400-e29b-41d4-a716-446655440000");
});

test("listLiveHistoryItems includes kept files and skips unsaved active streams", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-hist-"));
  const kept = "live-Kept-550e8400-e29b-41d4-a716-446655440000.ndjson";
  const unsaved = "live-Temp-550e8400-e29b-41d4-a716-446655440001.ndjson";
  fs.writeFileSync(
    path.join(dir, kept),
    '{"occurred":"2026-08-01T12:00:00.000Z","type":"CUSTOM"}\n{"type":"OPEN"}\n',
  );
  fs.writeFileSync(path.join(dir, unsaved), '{"type":"CUSTOM"}\n');
  registerLiveStream("unsaved", {
    filePath: path.join(dir, unsaved),
    profileName: "Temp",
    storeRaw: false,
  });

  const items = await listLiveHistoryItems(dir);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "live");
  assert.equal(items[0].name, kept);
  assert.equal(items[0].totalEvents, 2);
  assert.equal(items[0].firstOccurred, "2026-08-01T12:00:00.000Z");
  fs.rmSync(dir, { recursive: true, force: true });
});
