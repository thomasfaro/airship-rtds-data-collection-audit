import test from "node:test";
import assert from "node:assert/strict";
import {
  splitMessageWithHighlights,
  warningMessageHighlights,
} from "./warningMessageDisplay.js";

test("warningMessageHighlights collects structured field names", () => {
  const highlights = warningMessageHighlights({
    category: "custom_event_platform_mismatch",
    message:
      'Custom event "purchase_complete" (SDK): present on IOS only — not on ANDROID (42 hits).',
    name: "purchase_complete",
  });
  assert.ok(highlights.includes("purchase_complete"));
});

test("warningMessageHighlights includes attribute keys and property names", () => {
  const highlights = warningMessageHighlights({
    category: "attribute_value_mismatch",
    message:
      'Attributes: value type/shape differs by device_type for "loyalty_tier" (IOS, ANDROID) — not letter casing alone.',
    key: "loyalty_tier",
  });
  assert.ok(highlights.includes("loyalty_tier"));
});

test("warningMessageHighlights includes SDK versions", () => {
  const highlights = warningMessageHighlights({
    category: "sdk_version_split",
    message:
      "IOS: multiple SDK versions in use — 17.2.0 (45%) and 16.1.0 (32%) both ≥10% of platform events.",
    deviceType: "IOS",
  });
  assert.ok(highlights.includes("17.2.0"));
  assert.ok(highlights.includes("16.1.0"));
  assert.ok(highlights.includes("IOS"));
});

test("splitMessageWithHighlights wraps matched terms", () => {
  const parts = splitMessageWithHighlights('Screen "Home" on IOS only', ["Home"]);
  assert.deepEqual(parts, [
    { text: 'Screen "', bold: false },
    { text: "Home", bold: true },
    { text: '" on IOS only', bold: false },
  ]);
});
