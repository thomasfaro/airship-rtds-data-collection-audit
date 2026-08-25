import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTmpPaths, sanitizeProfileName } from "./paths.js";

test("sanitizeProfileName strips unsafe characters", () => {
  assert.equal(sanitizeProfileName("Euro Goat / PROD"), "Euro_Goat_PROD");
  assert.equal(sanitizeProfileName("a".repeat(80)).length, 64);
});

test("createTmpPaths builds audit-style paths with unique suffix", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-audit-"));
  const audit = createTmpPaths({
    tmpDir,
    prefix: "audit",
    keepEnvKey: "AUDIT_KEEP_RAW_FILE",
    logTag: "test-audit",
  });

  const filePath = audit.createRawFilePath("My Profile!");
  assert.match(filePath, new RegExp(`^${tmpDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/audit-My_Profile_-`));
  assert.ok(filePath.endsWith(".ndjson"));
  assert.ok(fs.existsSync(tmpDir));
});

test("createTmpPaths builds live-style paths from stream id", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-live-"));
  const live = createTmpPaths({
    tmpDir,
    prefix: "live",
    keepEnvKey: "LIVE_KEEP_RAW_FILE",
    logTag: "test-live",
  });

  const filePath = live.createRawFilePath("euro goat", { streamId: "abc-123" });
  assert.equal(filePath, path.join(tmpDir, "live-euro_goat-abc-123.ndjson"));
});

test("shouldKeepRawFile respects env override", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-keep-"));
  const prev = process.env.TEST_KEEP_RAW_FILE;
  process.env.TEST_KEEP_RAW_FILE = "false";
  try {
    const storage = createTmpPaths({
      tmpDir,
      prefix: "audit",
      keepEnvKey: "TEST_KEEP_RAW_FILE",
      logTag: "test-keep",
    });
    assert.equal(storage.shouldKeepRawFile(), false);
  } finally {
    if (prev === undefined) delete process.env.TEST_KEEP_RAW_FILE;
    else process.env.TEST_KEEP_RAW_FILE = prev;
  }
});

test("removeRawFile deletes existing file", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-rm-"));
  const filePath = path.join(tmpDir, "sample.ndjson");
  fs.writeFileSync(filePath, "{}");
  const storage = createTmpPaths({
    tmpDir,
    prefix: "audit",
    keepEnvKey: "AUDIT_KEEP_RAW_FILE",
    logTag: "test-rm",
  });

  assert.equal(storage.removeRawFile(filePath), true);
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(storage.removeRawFile(filePath), false);
});
