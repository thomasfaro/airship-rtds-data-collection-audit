import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailFeedbackDimensions,
  parseEmailDomain,
  trackEmailFeedbackBreakdowns,
} from "./emailFeedbackBreakdowns.js";
import { formatSparkpostBounceClassLabel, getSparkpostBounceClassDetail } from "./sparkpostBounceClasses.js";
import {
  buildEmailFeedbackReport,
  createEmailFeedbackAccumulator,
  processEmailFeedbackCustomEvent,
} from "./emailCustomEvents.js";

function emailEvent(name, properties = {}) {
  return {
    type: "CUSTOM",
    device: { device_type: "EMAIL" },
    body: { name, properties },
  };
}

test("formatSparkpostBounceClassLabel maps known codes", () => {
  assert.equal(formatSparkpostBounceClassLabel("10"), "10 — Invalid Recipient (Hard)");
  assert.equal(formatSparkpostBounceClassLabel("51"), "51 — Spam Block (Block)");
});

test("getSparkpostBounceClassDetail includes SparkPost description", () => {
  assert.match(getSparkpostBounceClassDetail("51"), /known spam source/i);
  assert.match(getSparkpostBounceClassDetail("51"), /Category: Block/);
});

test("delivery breakdown by transactional and sender", () => {
  const acc = createEmailFeedbackAccumulator();
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("delivery", { transactional: true, sender: "news@brand.com" }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("delivery", { transactional: false, sender: "news@brand.com" }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("delivery", { transactional: true, sender: "alerts@brand.com" }),
    "EMAIL",
  );

  const report = buildEmailFeedbackReport(acc);
  const row = report.funnel.find((item) => item.name === "delivery");
  assert.equal(row.count, 3);

  const transactional = row.dimensions.find((d) => d.id === "transactional");
  assert.ok(transactional);
  assert.deepEqual(
    transactional.rows.map((r) => [r.key, r.count]),
    [
      ["transactional", 2],
      ["commercial", 1],
    ],
  );

  const sender = row.dimensions.find((d) => d.id === "sender");
  assert.ok(sender);
  assert.equal(sender.rows.find((r) => r.key === "news@brand.com")?.count, 2);
});

test("parseEmailDomain extracts domain from recipient email", () => {
  assert.equal(parseEmailDomain("User@Gmail.COM"), "gmail.com");
  assert.equal(parseEmailDomain(""), "(missing)");
  assert.equal(parseEmailDomain("not-an-email"), "(invalid)");
});

test("delay breakdown by transactional, sender and email domain", () => {
  const acc = createEmailFeedbackAccumulator();
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("delay", {
      transactional: true,
      sender: "news@brand.com",
      email: "alice@gmail.com",
    }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("delay", {
      transactional: true,
      sender: "news@brand.com",
      email: "bob@gmail.com",
    }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("delay", {
      transactional: false,
      sender: "alerts@brand.com",
      email: "carol@yahoo.co.uk",
    }),
    "EMAIL",
  );

  const report = buildEmailFeedbackReport(acc);
  const row = report.funnel.find((item) => item.name === "delay");
  assert.equal(row.count, 3);

  const sender = row.dimensions.find((d) => d.id === "sender");
  assert.equal(sender.rows.find((r) => r.key === "news@brand.com")?.count, 2);
  assert.equal(sender.rows.find((r) => r.key === "alerts@brand.com")?.count, 1);

  const emailDomain = row.dimensions.find((d) => d.id === "emailDomain");
  assert.equal(emailDomain.rows.find((r) => r.key === "gmail.com")?.count, 2);
  assert.equal(emailDomain.rows.find((r) => r.key === "yahoo.co.uk")?.count, 1);
});

test("initial_open mobile and prefetch breakdowns", () => {
  const acc = createEmailFeedbackAccumulator();
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("initial_open", {
      is_mobile: true,
      is_prefetched: false,
      os_family: "iOS",
      device_brand: "Apple",
    }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("initial_open", {
      is_mobile: true,
      is_prefetched: true,
      os_family: "Android",
      device_brand: "Samsung",
    }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("initial_open", { is_mobile: false, is_prefetched: false, os_family: "Windows" }),
    "EMAIL",
  );

  const report = buildEmailFeedbackReport(acc);
  const row = report.funnel.find((item) => item.name === "initial_open");
  assert.equal(row.count, 3);

  const prefetched = row.dimensions.find((d) => d.id === "isPrefetched");
  assert.equal(prefetched.rows.find((r) => r.key === "true")?.count, 1);
  assert.equal(prefetched.rows.find((r) => r.key === "false")?.count, 2);

  const mobileOs = row.dimensions.find((d) => d.id === "mobileOsFamily");
  assert.ok(mobileOs.rows.some((r) => r.key === "iOS" && r.count === 1));
  assert.ok(mobileOs.rows.some((r) => r.key === "Android" && r.count === 1));
  assert.ok(!mobileOs.rows.some((r) => r.key === "Windows"));

  const prefetchDetail = row.dimensions.find((d) => d.id === "prefetchedDetail");
  assert.ok(prefetchDetail.rows.some((r) => r.label.includes("Android")));
});

test("bounce breakdown uses SparkPost bounce class labels", () => {
  const acc = createEmailFeedbackAccumulator();
  processEmailFeedbackCustomEvent(acc, emailEvent("bounce", { bounce_class: 10 }), "EMAIL");
  processEmailFeedbackCustomEvent(acc, emailEvent("bounce", { bounce_class: 51 }), "EMAIL");

  const report = buildEmailFeedbackReport(acc);
  const row = report.funnel.find((item) => item.name === "bounce");
  const bounceClass = row.dimensions.find((d) => d.id === "bounceClass");
  assert.equal(bounceClass.rows.length, 2);
  const labels = bounceClass.rows.map((r) => r.label).sort();
  assert.deepEqual(labels, [
    "10 — Invalid Recipient (Hard)",
    "51 — Spam Block (Block)",
  ]);
  assert.match(bounceClass.rows.find((r) => r.key === "51")?.detail, /known spam source/i);
});

test("unsubscribe breakdown by unsubscribe_event_type", () => {
  const acc = createEmailFeedbackAccumulator();
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("unsubscribe", { unsubscribe_event_type: "list_unsubscribe" }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("unsubscribe", { unsubscribe_event_type: "list_unsubscribe" }),
    "EMAIL",
  );
  processEmailFeedbackCustomEvent(
    acc,
    emailEvent("unsubscribe", { unsubscribe_event_type: "global_unsubscribe" }),
    "EMAIL",
  );

  const report = buildEmailFeedbackReport(acc);
  const row = report.funnel.find((item) => item.name === "unsubscribe");
  assert.equal(row.count, 3);

  const byType = row.dimensions.find((d) => d.id === "unsubscribeEventType");
  assert.ok(byType);
  assert.equal(byType.rows.find((r) => r.key === "list_unsubscribe")?.count, 2);
  assert.equal(byType.rows.find((r) => r.key === "global_unsubscribe")?.count, 1);
  assert.match(byType.rows.find((r) => r.key === "list_unsubscribe")?.detail, /List-Unsubscribe/i);
  assert.match(byType.rows.find((r) => r.key === "global_unsubscribe")?.detail, /full opt-out/i);
});

test("trackEmailFeedbackBreakdowns ignores unrelated event types", () => {
  const bucket = { count: 1 };
  trackEmailFeedbackBreakdowns(bucket, "click", { properties: { sender: "x" } });
  assert.equal(buildEmailFeedbackDimensions("click", bucket, 1), undefined);
});
