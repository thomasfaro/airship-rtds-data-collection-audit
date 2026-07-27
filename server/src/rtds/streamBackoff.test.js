import test from "node:test";
import assert from "node:assert/strict";
import { reconnectBackoffMs, sleepMs } from "./streamBackoff.js";

test("reconnectBackoffMs grows exponentially and caps at 30s", () => {
  assert.equal(reconnectBackoffMs(1), 1000);
  assert.equal(reconnectBackoffMs(2), 2000);
  assert.equal(reconnectBackoffMs(3), 4000);
  assert.equal(reconnectBackoffMs(6), 30_000);
  assert.equal(reconnectBackoffMs(50), 30_000);
});

test("reconnectBackoffMs clamps non-positive attempts to the first delay", () => {
  assert.equal(reconnectBackoffMs(0), 1000);
  assert.equal(reconnectBackoffMs(-5), 1000);
});

test("sleepMs rejects immediately when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => sleepMs(50, controller.signal), { name: "AbortError" });
});

test("sleepMs rejects when aborted mid-flight", async () => {
  const controller = new AbortController();
  const pending = sleepMs(5_000, controller.signal);
  controller.abort();
  await assert.rejects(() => pending, { name: "AbortError" });
});

test("sleepMs resolves without a signal", async () => {
  await sleepMs(1);
});
