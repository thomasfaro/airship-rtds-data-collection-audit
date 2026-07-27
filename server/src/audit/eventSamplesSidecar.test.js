import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  eventSamplesSidecarPath,
  loadEventSamplesSidecar,
  persistEventSamplesSidecar,
} from "./eventSamplesSidecar.js";

test("persistEventSamplesSidecar round-trips sample buckets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-samples-"));
  const ndjsonPath = path.join(dir, "audit-demo.ndjson");
  fs.writeFileSync(ndjsonPath, "{}\n", "utf8");

  const samples = [
    {
      kpiId: "custom.SDK.purchase.IOS",
      title: "CUSTOM (SDK): purchase on IOS",
      events: [{ type: "CUSTOM", body: { name: "purchase" } }],
    },
  ];

  const basename = persistEventSamplesSidecar(ndjsonPath, samples);
  assert.equal(basename, "audit-demo.event-samples.json");
  assert.deepEqual(loadEventSamplesSidecar(ndjsonPath), samples);
  assert.equal(
    eventSamplesSidecarPath(ndjsonPath),
    path.join(dir, "audit-demo.event-samples.json"),
  );
});
