import test from "node:test";
import assert from "node:assert/strict";
import {
  categoriesForType,
  customEmailRegistry,
  customSmsRegistry,
  emailComplianceRegistry,
  eventRegistry,
  EVENT_GROUPS,
  metadataForType,
  smsComplianceRegistry,
} from "./eventCatalog.js";

/**
 * Every display type the picker can offer, which is more than the RTDS types:
 * the email and SMS ones are derived from a CUSTOM or COMPLIANCE payload.
 */
function everyDisplayType() {
  return [
    ...Object.keys(eventRegistry),
    ...Object.values(customEmailRegistry).map((metadata) => metadata.type),
    ...Object.values(emailComplianceRegistry).map((metadata) => metadata.type),
    ...Object.values(customSmsRegistry).map((metadata) => metadata.type),
    ...Object.values(smsComplianceRegistry).map((metadata) => metadata.type),
    "EMAIL_COMPLIANCE_UNSUBSCRIBE",
    "SMS_REGISTRATION_UPDATE",
  ];
}

test("every display type lands in a group the picker renders", () => {
  for (const type of everyDisplayType()) {
    const groups = categoriesForType(type);
    assert.ok(groups.length > 0, `${type} has no category`);
    for (const group of groups) {
      assert.ok(EVENT_GROUPS.includes(group), `${type} is in "${group}", which no group header shows`);
    }
  }
});

test("a derived type is grouped by its channel, not as Other", () => {
  assert.deepEqual(categoriesForType("EMAIL_BOUNCE"), ["Email"]);
  assert.deepEqual(categoriesForType("SMS_MOBILE_OPT_IN"), ["SMS"]);
});

test("CUSTOM appears under both the group it belongs to and App", () => {
  assert.deepEqual(categoriesForType("CUSTOM"), ["Audience", "App"]);
});

test("an unknown type is labelled rather than dropped", () => {
  assert.deepEqual(metadataForType("NOT_A_TYPE"), {
    group: "Other",
    label: "NOT_A_TYPE",
    color: "#e5e7eb",
  });
  assert.equal(metadataForType("").label, "Unknown");
});
