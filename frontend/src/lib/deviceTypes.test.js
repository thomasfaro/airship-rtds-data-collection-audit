import test from "node:test";
import assert from "node:assert/strict";
import {
  allDeviceTypesCsv,
  DEVICE_TYPES,
  deviceTypeSelection,
  formatEventDeviceTypeLabel,
  toggleDeviceTypeCsv,
} from "./deviceTypes.js";

test("an empty selection is not 'some selected'", () => {
  const state = deviceTypeSelection("");
  assert.equal(state.selected.size, 0);
  assert.equal(state.all, false);
  assert.equal(state.some, false);
});

test("every type ticked reads as all, not as some", () => {
  const csv = allDeviceTypesCsv(true);
  const state = deviceTypeSelection(csv);
  assert.equal(state.selected.size, DEVICE_TYPES.length);
  assert.equal(state.all, true);
  assert.equal(state.some, false);
  assert.equal(allDeviceTypesCsv(false), "");
});

test("toggling adds then removes, and never duplicates", () => {
  const once = toggleDeviceTypeCsv("ios", "android");
  assert.deepEqual(once.split(","), ["ios", "android"]);
  assert.equal(toggleDeviceTypeCsv(once, "android"), "ios");
  assert.equal(toggleDeviceTypeCsv("ios,ios", "web"), "ios,web");
});

test("event payloads carry uppercase device types", () => {
  assert.equal(formatEventDeviceTypeLabel("IOS"), formatEventDeviceTypeLabel("ios"));
  assert.equal(formatEventDeviceTypeLabel(""), "");
  assert.equal(formatEventDeviceTypeLabel("MARS"), "MARS");
});
