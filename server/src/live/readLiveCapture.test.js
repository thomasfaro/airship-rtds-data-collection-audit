import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readLiveCaptureEvents } from "./readLiveCapture.js";

test("readLiveCaptureEvents supports after_lines incremental read", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-capture-"));
  const filePath = path.join(dir, "live-test.ndjson");
  fs.writeFileSync(
    filePath,
    ['{"id":"1","type":"OPEN"}', '{"id":"2","type":"CLOSE"}', '{"id":"3","type":"OPEN"}'].join("\n"),
    "utf8",
  );

  const first = await readLiveCaptureEvents(filePath, { afterLines: 0 });
  assert.equal(first.events.length, 3);
  assert.equal(first.totalLines, 3);

  const second = await readLiveCaptureEvents(filePath, { afterLines: 2 });
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].id, "3");
  assert.equal(second.totalLines, 3);

  fs.rmSync(dir, { recursive: true, force: true });
});
