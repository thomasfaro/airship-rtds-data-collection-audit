import test from "node:test";
import assert from "node:assert/strict";
import { formatPlatformCoverageLabel, getPlatformCoverageKey } from "../platformCoverage.js";
import {
  collectPlatformPatternItems,
  flattenGroupedAuditWarnings,
  groupAuditWarnings,
} from "./auditWarningGroups.js";

test("getPlatformCoverageKey groups present/missing platforms", () => {
  const key = getPlatformCoverageKey({
    presentOn: ["IOS", "ANDROID"],
    missingOn: ["WEB"],
  });
  assert.equal(key, "present:ANDROID,IOS|missing:WEB");
});

test("formatPlatformCoverageLabel reads like audit messages", () => {
  const label = formatPlatformCoverageLabel({
    presentOn: ["IOS", "ANDROID"],
    missingOn: ["WEB"],
  });
  assert.equal(label, "Present on iOS, Android only — not on Web");
});

test("groupAuditWarnings nests platform patterns under Missing on platform", () => {
  const groups = groupAuditWarnings([
    {
      category: "custom_event_platform_mismatch",
      presentOn: ["IOS"],
      missingOn: ["ANDROID", "WEB"],
      message: "Custom event foo",
    },
    {
      category: "attribute_device_gap",
      presentOn: ["IOS"],
      missingOn: ["ANDROID", "WEB"],
      message: "Attribute loyalty",
    },
    {
      category: "custom_event_platform_mismatch",
      presentOn: ["ANDROID"],
      missingOn: ["IOS"],
      message: "Custom event bar",
    },
    {
      category: "custom_property_mismatch",
      message: "Property mismatch",
    },
  ]);

  const platformGroup = groups.find((group) => group.key === "platform_coverage");
  assert.ok(platformGroup?.platformPatterns?.length === 2);
  const iosPattern = platformGroup.platformPatterns.find((pattern) =>
    pattern.label.includes("iOS only — not on Android, Web"),
  );
  assert.ok(iosPattern);
  assert.deepEqual(
    iosPattern.subgroups.map((group) => group.key),
    ["custom_events", "attributes"],
  );
  assert.equal(collectPlatformPatternItems(iosPattern).length, 2);
});

test("flattenGroupedAuditWarnings includes platform pattern column", () => {
  const groups = groupAuditWarnings([
    {
      category: "screen_platform_mismatch",
      presentOn: ["IOS"],
      missingOn: ["WEB"],
      message: "Screen home",
    },
  ]);
  const rows = flattenGroupedAuditWarnings(groups);
  assert.equal(rows[0].platformPattern, "Present on iOS only — not on Web");
});
