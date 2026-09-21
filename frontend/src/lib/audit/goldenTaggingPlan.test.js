import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildTaggingPlanJsonPayload, collectValueExtracts } from "./taggingPlanExport.js";

/**
 * The deliverable, pinned. The server golden is the report a capture of the invented
 * app produces; this turns it into the plan a client actually receives — the same
 * model the workbook is rendered from, and the `.json` the download writes.
 *
 * Together the two goldens cover the whole chain, engine to file, which is what lets
 * the engine below be cut down with something other than hope.
 *
 * Rebase deliberately, never to make the suite pass: RTDS_GOLDEN_UPDATE=1 npm test.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.resolve(HERE, "../../../../server/src/capture/golden/report.json");
const GOLDEN_PATH = path.join(HERE, "golden", "taggingPlan.json");

const FROZEN_GENERATED_AT = "2026-07-29T09:00:00.000Z";

/** Deterministic stand-ins for the two value endpoints the export takes by injection. */
function stubValuePage(seedParts) {
  const seed = seedParts.join("|");
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) & 0x7fffffff;
  const values = Array.from({ length: 3 }, (_, rank) => ({
    value: `${seedParts.at(-1)}-value-${rank + 1}`,
    count: ((hash >> (rank * 3)) % 500) + rank + 1,
    deviceTypes: [
      { deviceType: "IOS", count: (hash % 40) + 1 },
      { deviceType: "ANDROID", count: (hash % 25) + 1 },
    ],
  }));
  return { values, total: values.length, capped: false };
}

test("the tagging plan built from the golden report is unchanged", async () => {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

  const extracts = await collectValueExtracts({
    report,
    ndjsonFileName: "golden-capture.ndjson",
    fetchAttributeValues: async ({ key }) => stubValuePage(["attr", key]),
    fetchCustomPropertyValues: async ({ source, event, property }) =>
      stubValuePage(["custom", source, event, property]),
  });

  const payload = buildTaggingPlanJsonPayload(report, {
    extracts,
    profileName: report.meta.profile,
  });
  payload.generatedAt = FROZEN_GENERATED_AT;

  if (process.env.RTDS_GOLDEN_UPDATE === "1") {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  }

  assert.deepEqual(payload, JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")));
});
