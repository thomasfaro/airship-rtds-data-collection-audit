import test from "node:test";
import assert from "node:assert/strict";
import {
  addAudienceValues,
  AUDIENCE_FILTER_FIELDS,
  parseAudienceInput,
  removeAudienceValue,
  splitAudienceValues,
} from "./streamAudienceFilters.js";

const CHANNEL = AUDIENCE_FILTER_FIELDS.find((field) => field.key === "channel");
const NAMED_USER = AUDIENCE_FILTER_FIELDS.find((field) => field.key === "named_user");

const CHANNEL_A = "5b389366-7caf-43e2-a19c-6159c7ea9936";
const CHANNEL_B = "c8044c8a-d5fa-4e58-91d4-54d0f70b7409";

test("a pasted list of channels becomes one value per channel", () => {
  for (const separator of [" ", ",", ", ", ";", "\n", "\t", "  \n  "]) {
    assert.deepEqual(
      parseAudienceInput(`${CHANNEL_A}${separator}${CHANNEL_B}`, CHANNEL),
      [CHANNEL_A, CHANNEL_B],
      `separator ${JSON.stringify(separator)} should split the list`,
    );
  }
});

test("a named user keeps its spaces, since a space can be part of the value", () => {
  assert.deepEqual(parseAudienceInput("VIP Customer", NAMED_USER), ["VIP Customer"]);
  assert.deepEqual(parseAudienceInput("VIP Customer, George", NAMED_USER), [
    "VIP Customer",
    "George",
  ]);
});

test("blank and separator-only input adds nothing", () => {
  for (const input of ["", "   ", ",", " , ; \n", null, undefined]) {
    assert.deepEqual(parseAudienceInput(input, CHANNEL), []);
  }
});

test("addAudienceValues appends to what is already there and drops duplicates", () => {
  assert.equal(addAudienceValues("", [CHANNEL_A]), CHANNEL_A);
  assert.equal(addAudienceValues(CHANNEL_A, [CHANNEL_B]), `${CHANNEL_A},${CHANNEL_B}`);
  assert.equal(addAudienceValues(CHANNEL_A, [CHANNEL_A]), CHANNEL_A);
  assert.equal(
    addAudienceValues(CHANNEL_A, [CHANNEL_B, CHANNEL_A, CHANNEL_B]),
    `${CHANNEL_A},${CHANNEL_B}`,
  );
});

test("pasting a list then reading it back yields every value", () => {
  const csv = addAudienceValues("", parseAudienceInput(`${CHANNEL_A} ${CHANNEL_B}`, CHANNEL));
  assert.deepEqual(splitAudienceValues(csv), [CHANNEL_A, CHANNEL_B]);
});

test("removeAudienceValue takes out only the value asked for", () => {
  const csv = `${CHANNEL_A},${CHANNEL_B}`;
  assert.equal(removeAudienceValue(csv, CHANNEL_A), CHANNEL_B);
  assert.equal(removeAudienceValue(csv, "not-in-the-list"), csv);
});
