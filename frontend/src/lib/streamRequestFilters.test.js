import test from "node:test";
import assert from "node:assert/strict";
import {
  liveStreamFilters,
  streamParamsFromFilters,
} from "./streamRequestFilters.js";

test("liveStreamFilters keeps EARLIEST and drops unknown types", () => {
  const next = liveStreamFilters({
    start: "earliest",
    types: "CUSTOM,NOT_A_TYPE,OPEN",
    attribute_key: " firstName , firstName ",
  });
  assert.equal(next.start, "EARLIEST");
  assert.equal(next.types, "CUSTOM,OPEN");
  assert.equal(next.attribute_key, "firstName");
});

test("streamParamsFromFilters builds the live SSE query", () => {
  const params = streamParamsFromFilters({
    profile: "Demo",
    start: "LATEST",
    named_user: "alice",
    store_raw: true,
    limit: "500",
  });
  assert.equal(params.get("profile"), "Demo");
  assert.equal(params.get("named_user"), "alice");
  assert.equal(params.get("store_raw"), "1");
  assert.equal(params.get("limit"), "500");
});

test("streamParamsFromFilters omits limit when no_limit is set", () => {
  const params = streamParamsFromFilters({
    profile: "Demo",
    no_limit: true,
    limit: "500",
  });
  assert.equal(params.get("limit"), null);
});
