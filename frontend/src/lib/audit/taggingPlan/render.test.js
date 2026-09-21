import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { downloadTaggingPlanJson, generateTaggingPlanXlsx } from "./render.js";

/**
 * The renderer is the one layer that needs a DOM and exceljs, so it used to run
 * only in a browser. A stub anchor is enough to run it under `node --test`, which
 * is what proves the workbook still assembles from the golden report.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.resolve(HERE, "../../../../../server/src/capture/golden/report.json");
const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

/** Capture what the download would hand to the browser. */
function stubDownloads() {
  const downloads = [];
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let pending = null;

  globalThis.document = {
    createElement: () => ({
      style: {},
      click() {
        downloads.push({ ...pending, fileName: this.download });
      },
      remove() {},
    }),
    body: { appendChild() {} },
  };
  URL.createObjectURL = (blob) => {
    pending = { size: blob.size, type: blob.type, blob };
    return "blob:stub";
  };
  URL.revokeObjectURL = () => {};

  return {
    downloads,
    restore() {
      globalThis.document = originalDocument;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

const noValues = {
  fetchAttributeValues: async () => ({ values: [], total: 0 }),
  fetchCustomPropertyValues: async () => ({ values: [], total: 0 }),
};

test("the workbook renders from a real report and is handed to the browser", async () => {
  const stub = stubDownloads();
  try {
    const { fileName } = await generateTaggingPlanXlsx(report, {
      profileName: "Demo Retail",
      ndjsonFileName: "golden-capture.ndjson",
      ...noValues,
    });

    assert.equal(fileName, "Demo-Retail-tagging-plan-2026-07-29.xlsx");
    assert.equal(stub.downloads.length, 1);
    const [download] = stub.downloads;
    assert.equal(download.fileName, fileName);
    assert.match(download.type, /spreadsheetml\.sheet$/);
    assert.ok(download.size > 10_000, "a plan of this size is not a near-empty file");
  } finally {
    stub.restore();
  }
});

test("the .json download carries the same payload the skill reads", async () => {
  const stub = stubDownloads();
  try {
    const { fileName, payload } = await downloadTaggingPlanJson(report, {
      profileName: "Demo Retail",
      ndjsonFileName: "golden-capture.ndjson",
      ...noValues,
    });

    assert.equal(fileName, "Demo-Retail-tagging-plan-2026-07-29.json");
    assert.equal(payload.kind, "airship-rtds-tagging-plan");
    assert.equal(stub.downloads.length, 1);
    assert.equal(stub.downloads[0].type, "application/json");
    const written = JSON.parse(await stub.downloads[0].blob.text());
    assert.deepEqual(written, payload);
  } finally {
    stub.restore();
  }
});
