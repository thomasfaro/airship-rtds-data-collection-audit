import test from "node:test";
import assert from "node:assert/strict";
import { buildRtdsBody } from "./buildRtdsBody.js";

test("requested types are copied onto a single filter", () => {
  const { body, droppedTypes } = buildRtdsBody({ types: "CUSTOM,OPEN" });
  assert.deepEqual(droppedTypes, []);
  assert.deepEqual(body.filters, [{ types: ["CUSTOM", "OPEN"] }]);
  assert.equal(body.start, "LATEST");
});

test("audience values become OR branches (one filter per value)", () => {
  const { body } = buildRtdsBody({ named_user: "alice,bob", types: "CUSTOM" });
  assert.equal(body.filters.length, 2);
  assert.deepEqual(body.filters[0].users, [{ named_user_id: "alice" }]);
  assert.deepEqual(body.filters[1].users, [{ named_user_id: "bob" }]);
  assert.deepEqual(body.filters[0].types, ["CUSTOM"]);
});

test("attribute_key opens an ATTRIBUTE_OPERATION branch per key", () => {
  const { body } = buildRtdsBody({ attribute_key: "firstName,city" });
  assert.equal(body.filters.length, 2);
  for (const filter of body.filters) {
    assert.deepEqual(filter.types, ["ATTRIBUTE_OPERATION"]);
    assert.equal(filter.predicates.length, 1);
    assert.equal(filter.predicates[0].key, "attribute");
  }
});

test("unknown types are dropped and reported", () => {
  const { body, droppedTypes, requestedTypes } = buildRtdsBody({
    types: "CUSTOM,NOT_A_TYPE,OPEN",
  });
  assert.deepEqual(requestedTypes, ["CUSTOM", "NOT_A_TYPE", "OPEN"]);
  assert.deepEqual(droppedTypes, ["NOT_A_TYPE"]);
  assert.deepEqual(body.filters[0].types, ["CUSTOM", "OPEN"]);
});
