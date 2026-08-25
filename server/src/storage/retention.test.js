import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_RETENTION_DAYS,
  purgeExpiredCaptures,
  resolveRetentionDays,
  selectExpiredEntries,
} from "./retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_NAME = "live-acme-11111111-2222-3333-4444-555555555555.ndjson";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtds-retention-"));
}

/** Write a file and backdate it, so age is the only thing under test. */
function writeAged(dir, name, ageDays) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, "{}");
  const seconds = (Date.now() - ageDays * DAY_MS) / 1000;
  fs.utimesSync(filePath, seconds, seconds);
  return filePath;
}

function withoutWarnings(run) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
  }
}

test("resolveRetentionDays defaults when nothing is set", () => {
  assert.equal(resolveRetentionDays({}), DEFAULT_RETENTION_DAYS);
  assert.equal(resolveRetentionDays({ RTDS_DCA_RETENTION_DAYS: "" }), DEFAULT_RETENTION_DAYS);
});

test("resolveRetentionDays reads an explicit window", () => {
  assert.equal(resolveRetentionDays({ RTDS_DCA_RETENTION_DAYS: "7" }), 7);
  assert.equal(resolveRetentionDays({ RTDS_DCA_RETENTION_DAYS: " 90 " }), 90);
});

test("resolveRetentionDays treats 0, off and never as keep forever", () => {
  for (const value of ["0", "off", "never", "NEVER"]) {
    assert.equal(resolveRetentionDays({ RTDS_DCA_RETENTION_DAYS: value }), null);
  }
});

test("an unreadable window keeps everything rather than falling back to the default", () => {
  // Deleting a client deliverable because a setting was mistyped is the outcome worth ruling out.
  withoutWarnings(() => {
    for (const value of ["soon", "30 days", "-5", "1.5"]) {
      assert.equal(resolveRetentionDays({ RTDS_DCA_RETENTION_DAYS: value }), null);
    }
  });
});

test("selectExpiredEntries takes only what is past the window", () => {
  const nowMs = Date.UTC(2026, 7, 25);
  const entries = [
    { name: "old", kind: "audit", mtimeMs: nowMs - 31 * DAY_MS },
    { name: "fresh", kind: "audit", mtimeMs: nowMs - 29 * DAY_MS },
    { name: "unreadable", kind: "audit", mtimeMs: Number.NaN },
  ];

  const expired = selectExpiredEntries(entries, { nowMs, retentionDays: 30 });
  assert.deepEqual(
    expired.map((entry) => entry.name),
    ["old"],
  );
});

test("selectExpiredEntries takes nothing when expiry is off", () => {
  const nowMs = Date.now();
  const entries = [{ name: "ancient", kind: "audit", mtimeMs: nowMs - 400 * DAY_MS }];
  assert.deepEqual(selectExpiredEntries(entries, { nowMs, retentionDays: null }), []);
});

test("an expired audit takes its whole group, scoped sidecars included", () => {
  const dir = tmpDir();
  const stem = "capture-acme-20260101-abcd1234";
  writeAged(dir, `${stem}.audit-report.json`, 40);
  writeAged(dir, `${stem}.attr-values.json`, 40);
  writeAged(dir, `${stem}.custom-prop-values.json`, 40);
  writeAged(dir, `${stem}.event-samples.json`, 40);
  // The suffix helpers do not reach these, so a naive purge would leave client values behind.
  writeAged(dir, `${stem}.attr-values.scope-xyz.json`, 40);

  const result = purgeExpiredCaptures({ dir, retentionDays: 30 });

  assert.equal(result.audits, 1);
  assert.equal(result.files, 5);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("a capture inside the window is left alone, and a similar stem is not caught by it", () => {
  const dir = tmpDir();
  writeAged(dir, "capture-acme-20260101-abcd1234.audit-report.json", 40);
  writeAged(dir, "capture-acme-20260101-abcd1234b.audit-report.json", 5);
  writeAged(dir, "capture-acme-20260201-eeee5678.audit-report.json", 5);

  const result = purgeExpiredCaptures({ dir, retentionDays: 30 });

  assert.equal(result.audits, 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    "capture-acme-20260101-abcd1234b.audit-report.json",
    "capture-acme-20260201-eeee5678.audit-report.json",
  ]);
});

test("a kept live capture expires too, being the rawest thing on disk", () => {
  const dir = tmpDir();
  writeAged(dir, LIVE_NAME, 40);

  const result = purgeExpiredCaptures({ dir, retentionDays: 30 });

  assert.equal(result.liveFiles, 1);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("purgeExpiredCaptures does nothing at all when expiry is off", () => {
  const dir = tmpDir();
  writeAged(dir, "capture-acme-20200101-abcd1234.audit-report.json", 900);
  writeAged(dir, LIVE_NAME, 900);

  const result = purgeExpiredCaptures({ dir, retentionDays: null });

  assert.equal(result.skipped, true);
  assert.equal(result.files, 0);
  assert.equal(fs.readdirSync(dir).length, 2);
});

test("unrelated files in the storage folder are never touched", () => {
  const dir = tmpDir();
  writeAged(dir, "notes.txt", 900);
  writeAged(dir, "capture-acme-20200101-abcd1234.ndjson", 900);

  const result = purgeExpiredCaptures({ dir, retentionDays: 30 });

  assert.equal(result.files, 0);
  assert.equal(fs.readdirSync(dir).length, 2);
});
