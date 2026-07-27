import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExcludedDeviceTypesPredicate,
  excludedDeviceTypesFromFilter,
} from "./auditDeviceTypePredicates.js";

test("buildExcludedDeviceTypesPredicate uses not equals for one type", () => {
  assert.deepEqual(buildExcludedDeviceTypesPredicate(["email"]), {
    not: {
      scope: ["device"],
      key: "device_type",
      value: { equals: "EMAIL" },
    },
  });
});

test("buildExcludedDeviceTypesPredicate combines multiple exclusions with and", () => {
  const predicate = buildExcludedDeviceTypesPredicate(["EMAIL", "SMS"]);
  assert.equal(predicate.and.length, 2);
  assert.equal(predicate.and[0].not.value.equals, "EMAIL");
  assert.equal(predicate.and[1].not.value.equals, "SMS");
});

test("excludedDeviceTypesFromFilter round-trips predicate", () => {
  const filter = {
    types: ["OPEN"],
    predicates: [buildExcludedDeviceTypesPredicate(["WEB", "EMAIL"])],
  };
  assert.deepEqual(excludedDeviceTypesFromFilter(filter), ["EMAIL", "WEB"]);
});
