import assert from "node:assert/strict";
import test from "node:test";
import {
  readGoldenReport,
  runGoldenCapture,
  writeGoldenReport,
} from "./golden/runGoldenCapture.js";

/**
 * The whole engine under one assertion. A refactor that changes any number, label or
 * key in the finished report fails here, which is the point: the modules below are
 * being cut down, and unit tests only cover what someone thought to write.
 *
 * Rebase deliberately, never to make the suite pass: RTDS_GOLDEN_UPDATE=1 npm test.
 */
test("a capture of the invented app still produces the golden report", async () => {
  const report = await runGoldenCapture();

  if (process.env.RTDS_GOLDEN_UPDATE === "1") {
    writeGoldenReport(report);
  }

  assert.deepEqual(report, readGoldenReport());
});
