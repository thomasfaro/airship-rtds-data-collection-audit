import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailFeedbackReport,
  createEmailFeedbackAccumulator,
  isEmailFeedbackCustomEvent,
  processEmailFeedbackCustomEvent,
} from "./emailCustomEvents.js";

test("isEmailFeedbackCustomEvent includes spam_complaint on EMAIL channel", () => {
  assert.equal(
    isEmailFeedbackCustomEvent({
      type: "CUSTOM",
      device: { device_type: "EMAIL" },
      body: { name: "spam_complaint" },
    }),
    true,
  );
  assert.equal(
    isEmailFeedbackCustomEvent({
      type: "CUSTOM",
      device: { device_type: "IOS" },
      body: { name: "spam_complaint" },
    }),
    false,
  );
});

test("buildEmailFeedbackReport lists spam_complaint in negative funnel", () => {
  const acc = createEmailFeedbackAccumulator();
  processEmailFeedbackCustomEvent(
    acc,
    {
      type: "CUSTOM",
      device: { device_type: "EMAIL" },
      body: { name: "spam_complaint" },
    },
    "EMAIL",
  );
  const report = buildEmailFeedbackReport(acc);
  const row = report.funnel.find((item) => item.name === "spam_complaint");
  assert.equal(row?.count, 1);
  assert.equal(row?.category, "negative");
  assert.ok(report.summaryLines.some((line) => line.includes("spam complaint")));
});
