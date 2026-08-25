import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupLiveStream,
  registerLiveStream,
  resetLiveStreamsForTests,
} from "./streamRegistry.js";

test.afterEach(() => {
  resetLiveStreamsForTests();
});

test("cleanup deletes the raw file when storeRaw is off", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-live-"));
  const filePath = path.join(dir, "live-Demo-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.ndjson");
  fs.writeFileSync(filePath, '{"type":"CUSTOM"}\n');
  registerLiveStream("s1", { filePath, profileName: "Demo", storeRaw: false });
  const result = cleanupLiveStream("s1");
  assert.equal(result.deleted, true);
  assert.equal(fs.existsSync(filePath), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("cleanup keeps the raw file when storeRaw is on", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-live-"));
  const filePath = path.join(dir, "live-Demo-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.ndjson");
  fs.writeFileSync(filePath, '{"type":"CUSTOM"}\n');
  registerLiveStream("s1", { filePath, profileName: "Demo", storeRaw: true });
  const result = cleanupLiveStream("s1");
  assert.equal(result.deleted, false);
  assert.equal(result.kept, true);
  assert.equal(fs.existsSync(filePath), true);
  fs.rmSync(dir, { recursive: true, force: true });
});
