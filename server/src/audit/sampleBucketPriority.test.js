import test from "node:test";
import assert from "node:assert/strict";
import {
  canOpenSampleBucket,
  evictSampleBucketForPriority,
  isPrioritySampleKpi,
} from "./sampleBucketPriority.js";

test("isPrioritySampleKpi recognizes messaging and main email feedback buckets", () => {
  assert.equal(isPrioritySampleKpi("messaging.send_rejected.Unregistered"), true);
  assert.equal(isPrioritySampleKpi("email_custom.unsubscribe.EMAIL"), true);
  assert.equal(isPrioritySampleKpi("email_custom.prop.unsubscribe.EMAIL.link"), false);
});

test("canOpenSampleBucket evicts deprioritized buckets for priority KPIs at cap", () => {
  const buckets = new Map();
  for (let i = 0; i < 500; i += 1) {
    buckets.set(`email_custom.prop.click.EMAIL.prop_${i}`, { events: [{ id: i }] });
  }
  assert.equal(buckets.size, 500);
  const opened = canOpenSampleBucket(buckets, "messaging.send_rejected.Unregistered", 500);
  assert.equal(opened, true);
  assert.equal(buckets.size, 499);
  buckets.set("messaging.send_rejected.Unregistered", { events: [] });
  assert.equal(buckets.has("messaging.send_rejected.Unregistered"), true);
});

test("evictSampleBucketForPriority prefers email property buckets", () => {
  const buckets = new Map([
    ["by_device.IOS", { events: [{ id: 1 }] }],
    ["email_custom.prop.open.EMAIL.subject", { events: [{ id: 2 }, { id: 3 }] }],
  ]);
  const evicted = evictSampleBucketForPriority(buckets);
  assert.equal(evicted, true);
  assert.equal(buckets.has("email_custom.prop.open.EMAIL.subject"), false);
  assert.equal(buckets.has("by_device.IOS"), true);
});
