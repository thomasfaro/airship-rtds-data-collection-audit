import test from "node:test";
import assert from "node:assert/strict";
import { createAuditAccumulator, ingestAuditLine } from "./analyzeEvents.js";
import { buildCustomEventInsights } from "./analyzeInsights.js";
import {
  buildCustomPropertyTypeWarnings,
  mergeCustomPropertyTypes,
  propertyValueKind,
  summarizePropertyTypes,
  trackCustomPropertyType,
} from "./customPropertyTypes.js";

function customEvent(index, deviceType, name, properties) {
  return JSON.stringify({
    id: `e-${index}`,
    offset: String(index),
    type: "CUSTOM",
    occurred: "2026-06-01T10:00:00.000Z",
    processed: "2026-06-01T10:00:01.000Z",
    device: { device_type: deviceType, channel: `chan-${index}` },
    body: { name, source: "SDK", properties },
  });
}

function warningsFor(lines) {
  const acc = createAuditAccumulator();
  lines.forEach((line) => ingestAuditLine(acc, line, "UTC"));
  const top = buildCustomEventInsights(acc.customBySource.SDK, { source: "SDK" });
  return buildCustomPropertyTypeWarnings({ sdk: { top } });
}

test("propertyValueKind tells a quoted literal from the real type", () => {
  assert.equal(propertyValueKind(true), "boolean");
  assert.equal(propertyValueKind("true"), "text-boolean");
  assert.equal(propertyValueKind(" FALSE "), "text-boolean");
  assert.equal(propertyValueKind(42), "number");
  assert.equal(propertyValueKind("42"), "text-number");
  assert.equal(propertyValueKind("-9.99"), "text-number");
  assert.equal(propertyValueKind("SKU-42"), "string");
  assert.equal(propertyValueKind(""), "string");
  assert.equal(propertyValueKind([1]), "array");
  assert.equal(propertyValueKind({ a: 1 }), "object");
  assert.equal(propertyValueKind(null), null);
});

test("a boolean sent as the text \"true\" is reported, with the platforms sending it", () => {
  const warnings = warningsFor([
    customEvent(1, "IOS", "ad_completed", { ad_id: "A1", completed: "true" }),
    customEvent(2, "ANDROID", "ad_completed", { ad_id: "A2", completed: "true" }),
  ]);
  assert.equal(warnings.length, 1);
  const [warning] = warnings;
  assert.equal(warning.category, "custom_property_text_boolean");
  assert.equal(warning.name, "ad_completed");
  assert.equal(warning.key, "completed");
  assert.match(warning.message, /sent as the text "true"\/"false", not a boolean — 2 of 2 value\(s\), on ANDROID, IOS/);
});

test("the old event's boolean against the new event's text is a cross-event conflict", () => {
  const warnings = warningsFor([
    customEvent(1, "IOS", "video_completed", { completed: true }),
    customEvent(2, "IOS", "ad_completed", { completed: "true" }),
  ]);
  const conflict = warnings.find((w) => w.category === "custom_property_type_conflict");
  assert.ok(conflict);
  assert.equal(conflict.key, "completed");
  assert.deepEqual(conflict.byEvent, [
    { type: "boolean", events: ["video_completed"] },
    { type: 'text "true"/"false"', events: ["ad_completed"] },
  ]);
});

test("a property that changes type between builds of one event is a mix", () => {
  const warnings = warningsFor([
    customEvent(1, "IOS", "add_to_cart", { price: 9.99 }),
    customEvent(2, "ANDROID", "add_to_cart", { price: "9.99" }),
  ]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].category, "custom_property_type_mix");
  assert.match(warnings[0].message, /number ×1 on IOS; number in quotes ×1 on ANDROID/);
});

test("consistent types, including numeric ids kept as text, stay silent", () => {
  const warnings = warningsFor([
    customEvent(1, "IOS", "purchase", { order_id: "77120", paid: true, total: 42 }),
    customEvent(2, "ANDROID", "purchase", { order_id: "77121", paid: false, total: 12.5 }),
    customEvent(3, "IOS", "refund", { order_id: "ORD-1", paid: true }),
  ]);
  assert.deepEqual(warnings, []);
});

test("an event that is itself mixed is not reported again as a cross-event conflict", () => {
  const warnings = warningsFor([
    customEvent(1, "IOS", "a", { flag: true }),
    customEvent(2, "IOS", "a", { flag: "yes" }),
    customEvent(3, "IOS", "b", { flag: true }),
  ]);
  assert.deepEqual(
    warnings.map((w) => w.category),
    ["custom_property_type_mix"],
  );
});

test("merging buckets adds kinds per device type", () => {
  const a = {};
  const b = {};
  trackCustomPropertyType(a, "completed", true, "ios");
  trackCustomPropertyType(b, "completed", "true", "IOS");
  trackCustomPropertyType(b, "completed", "true", "android");
  mergeCustomPropertyTypes(a, b);
  assert.deepEqual(summarizePropertyTypes(a.propertyTypes), [
    {
      property: "completed",
      kinds: { "text-boolean": 2, boolean: 1 },
      byDevice: { ANDROID: { "text-boolean": 1 }, IOS: { boolean: 1, "text-boolean": 1 } },
    },
  ]);
});
