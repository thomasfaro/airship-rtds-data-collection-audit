import assert from "node:assert/strict";
import test from "node:test";
import { streamAuditEvents } from "./streamRtdsEvents.js";

const PROFILE = { name: "Quiet Project", region: "eu", token: "Bearer test", app_key: "k" };

function eventLine(name) {
  return `${JSON.stringify({
    id: name,
    type: "CUSTOM",
    offset: name,
    processed: "2026-09-22T07:00:00.000Z",
    occurred: "2026-09-22T07:00:00.000Z",
    device: { device_type: "IOS", channel: "c" },
    body: { name },
  })}\n`;
}

/** A backlog of two events, then a socket that stays open and silent. */
function trickleThenSilence() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(eventLine("a") + eventLine("b")));
      // Never closed and never fed again: what a low-traffic project looks like.
    },
  });
}

async function collectProgressWhileSilent(ms) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(trickleThenSilence(), {
      status: 200,
      headers: { "Content-Type": "application/vnd.urbanairship+x-ndjson" },
    });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  const ticks = [];

  try {
    for await (const progress of streamAuditEvents(PROFILE, {
      signal: abort.signal,
      onLine: () => null,
      trackingOnly: true,
    })) {
      ticks.push(progress);
    }
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
  } finally {
    clearTimeout(timer);
    globalThis.fetch = realFetch;
  }
  return ticks;
}

/**
 * The counter used to move only every 10,000 events, so a project sending a few
 * hundred an hour showed "0 events" for as long as the operator cared to watch —
 * indistinguishable from a capture that had failed to connect.
 */
test("a silent stream still reports what it has already ingested", async () => {
  const ticks = await collectProgressWhileSilent(2_600);

  assert.ok(ticks.length >= 2, `expected repeated ticks, got ${ticks.length}`);
  const counted = ticks.filter((tick) => tick.linesWritten === 2);
  assert.ok(counted.length >= 1, "no tick reported the two ingested events");
  assert.equal(ticks.at(-1).linesWritten, 2);
  assert.ok(ticks.at(-1).elapsedMs > 0, "elapsed time must advance while waiting");
});
