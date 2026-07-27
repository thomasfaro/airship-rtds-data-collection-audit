import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeJsonPropertyStatsForRow,
  parseJsonObjectAttributeValue,
  trackAttributeJsonProperties,
} from "./attributeJsonSchema.js";
import { persistAttributeValuesSidecar, readAttributeJsonPropertyValuesPage } from "./attributeValues.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("parseJsonObjectAttributeValue accepts objects and JSON strings", () => {
  assert.deepEqual(parseJsonObjectAttributeValue({ city: "Paris" }), { city: "Paris" });
  assert.deepEqual(parseJsonObjectAttributeValue('{"age":30}', "JSON"), { age: 30 });
  assert.equal(parseJsonObjectAttributeValue("plain text"), null);
  assert.equal(parseJsonObjectAttributeValue("[1,2]"), null);
});

test("trackAttributeJsonProperties records top-level JSON fields", () => {
  const row = {};
  trackAttributeJsonProperties(row, '{"city":"Paris","tier":"gold"}', "JSON", "ios");
  const stats = attributeJsonPropertyStatsForRow(row);
  assert.equal(stats.length, 2);
  assert.deepEqual(stats.map((s) => s.property).sort(), ["city", "tier"]);
});

test("attribute JSON property values persist in attribute sidecar", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attr-json-"));
  const ndjsonPath = path.join(dir, "audit-json.ndjson");
  const row = {};
  trackAttributeJsonProperties(row, { score: 10, level: "A" }, "JSON", "android");
  trackAttributeJsonProperties(row, { score: 20, level: "B" }, "JSON", "ios");

  persistAttributeValuesSidecar(ndjsonPath, { profile: row });

  const page = readAttributeJsonPropertyValuesPage(ndjsonPath, "profile", "score", {
    offset: 0,
    limit: 50,
  });
  assert.equal(page.total, 2);
  assert.ok(page.values.some((v) => v.value === "10"));
  assert.ok(page.values.some((v) => v.value === "20"));
});
