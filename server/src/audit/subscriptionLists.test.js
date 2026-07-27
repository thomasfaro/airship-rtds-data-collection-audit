import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSubscriptionListsReport,
  createSubscriptionListsAccumulator,
  extractSubscriptionListChanges,
  processSubscriptionListEvent,
} from "./subscriptionLists.js";

test("extractSubscriptionListChanges handles subscribe/unsubscribe arrays", () => {
  const changes = extractSubscriptionListChanges({
    subscribe: ["news"],
    unsubscribe: ["promos"],
    scope: "app",
  });
  assert.deepEqual(changes.sort((a, b) => a.listId.localeCompare(b.listId)), [
    { listId: "news", action: "subscribe", scope: "app" },
    { listId: "promos", action: "unsubscribe", scope: "app" },
  ]);
});

test("extractSubscriptionListChanges handles real RTDS enrolled/canceled shape", () => {
  assert.deepEqual(extractSubscriptionListChanges({ enrolled: ["bons_plans_gmf__infos_com"], scope: "APP" }), [
    { listId: "bons_plans_gmf__infos_com", action: "subscribe", scope: "app" },
  ]);
  assert.deepEqual(extractSubscriptionListChanges({ canceled: ["infos_et_actualit_s"], scope: "APP" }), [
    { listId: "infos_et_actualit_s", action: "unsubscribe", scope: "app" },
  ]);
});

test("processSubscriptionListEvent aggregates real enrolled/canceled events", () => {
  const acc = createSubscriptionListsAccumulator();
  const mk = (body) => ({
    type: "SUBSCRIPTION_LIST",
    occurred: "2026-06-23T10:33:01.832Z",
    processed: "2026-06-23T10:33:03.495Z",
    device: { named_user_id: "T000L697300" },
    user: { named_user_id: "T000L697300" },
    body,
  });
  const events = [
    { enrolled: ["bons_plans_gmf__infos_com"], scope: "APP" },
    { enrolled: ["infos_et_actualit_s"], scope: "APP" },
    { canceled: ["infos_et_actualit_s"], scope: "APP" },
    { canceled: ["bons_plans_gmf__infos_com"], scope: "APP" },
  ];
  for (const body of events) {
    const ev = mk(body);
    processSubscriptionListEvent(acc, ev, "UNKNOWN", body, null);
  }

  const report = buildSubscriptionListsReport(acc, { expectedPlatforms: [] });
  assert.equal(report.total, 4);
  assert.equal(report.uniqueLists, 2);
  const infos = report.byList.find((r) => r.listId === "infos_et_actualit_s");
  assert.equal(infos.subscribe, 1);
  assert.equal(infos.unsubscribe, 1);
  assert.deepEqual(report.byScope, [{ scope: "app", count: 4 }]);
});

test("extractSubscriptionListChanges handles action + list_ids", () => {
  const changes = extractSubscriptionListChanges({ action: "opt_in", list_ids: ["a", "b"] });
  assert.deepEqual(changes, [
    { listId: "a", action: "subscribe", scope: null },
    { listId: "b", action: "subscribe", scope: null },
  ]);
});

test("extractSubscriptionListChanges handles lists[] of objects", () => {
  const changes = extractSubscriptionListChanges({
    lists: [
      { list_id: "x", action: "unsubscribe", scope: "email" },
      { id: "y", action: "subscribe" },
    ],
  });
  assert.deepEqual(changes, [
    { listId: "x", action: "unsubscribe", scope: "email" },
    { listId: "y", action: "subscribe", scope: null },
  ]);
});

test("processSubscriptionListEvent + report aggregates by list, platform and scope", () => {
  const acc = createSubscriptionListsAccumulator();
  const mk = (deviceType, body) => ({
    type: "SUBSCRIPTION_LIST",
    device: { device_type: deviceType, channel: "chan-1", attributes: { app_version: "2.0.0" } },
    processed: "2026-01-01T00:00:00Z",
    body,
  });

  processSubscriptionListEvent(acc, mk("IOS", { subscribe: ["news"], scope: "app" }), "IOS", { subscribe: ["news"], scope: "app" }, null);
  processSubscriptionListEvent(acc, mk("IOS", { subscribe: ["news"], scope: "app" }), "IOS", { subscribe: ["news"], scope: "app" }, null);
  processSubscriptionListEvent(acc, mk("IOS", { unsubscribe: ["news"], scope: "app" }), "IOS", { unsubscribe: ["news"], scope: "app" }, null);

  const report = buildSubscriptionListsReport(acc, { expectedPlatforms: ["iOS", "Android"] });
  assert.equal(report.total, 3);
  assert.equal(report.uniqueLists, 1);

  const row = report.byList[0];
  assert.equal(row.listId, "news");
  assert.equal(row.subscribe, 2);
  assert.equal(row.unsubscribe, 1);
  assert.equal(row.net, 1);
  assert.equal(row.source, "SDK");
  assert.deepEqual(row.byScope, [{ scope: "app", count: 3 }]);
  // Seen only on iOS while Android expected => mismatch.
  assert.deepEqual(row.presentPlatforms, ["iOS"]);
  assert.deepEqual(row.missingPlatforms, ["Android"]);
  assert.equal(row.platformMismatch, true);
});
