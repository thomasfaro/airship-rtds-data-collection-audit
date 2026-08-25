import assert from "node:assert/strict";
import test from "node:test";
import { APP_LAUNCH_URL, pingServer, waitForRestart, waitForServer } from "./serverControl.js";

test("the launch url targets the registered handler", () => {
  assert.equal(APP_LAUNCH_URL, "rtds-audit://start");
});

test("pingServer reports what the health endpoint answers", async () => {
  const calls = [];
  const ok = await pingServer({
    fetchImpl: (url, options) => {
      calls.push({ url, options });
      return Promise.resolve({ ok: true });
    },
  });
  assert.equal(ok, true);
  assert.equal(calls[0].url, "/api/health");
  assert.equal(calls[0].options.cache, "no-store", "a cached answer would be worthless here");
});

test("pingServer treats a refused connection as down, not as a crash", async () => {
  const ok = await pingServer({
    fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  assert.equal(ok, false);
});

test("pingServer treats an error status as down", async () => {
  const ok = await pingServer({ fetchImpl: () => Promise.resolve({ ok: false, status: 502 }) });
  assert.equal(ok, false);
});

test("pingServer gives up on a hanging connection", async () => {
  const ok = await pingServer({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  assert.equal(ok, false);
});

test("waitForServer resolves as soon as the server answers", async () => {
  let attempts = 0;
  const waits = [];
  const up = await waitForServer({
    ping: () => {
      attempts += 1;
      return Promise.resolve(attempts === 3);
    },
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    timeoutMs: 1_000,
    intervalMs: 100,
  });
  assert.equal(up, true);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [100, 100], "it waits between attempts, not after the last one");
});

test("waitForRestart ignores the old server still answering on its way out", async () => {
  // Up twice (the process being replaced), then down, then up for good.
  const answers = [true, true, false, false, true];
  let attempts = 0;
  const up = await waitForRestart({
    ping: () => {
      const answer = answers[attempts] ?? true;
      attempts += 1;
      return Promise.resolve(answer);
    },
    wait: () => Promise.resolve(),
    downTimeoutMs: 1_000,
    upTimeoutMs: 1_000,
    intervalMs: 100,
  });
  assert.equal(up, true);
  assert.equal(attempts, 5, "it waited for the port to go quiet before believing it was back");
});

test("waitForRestart still checks for the server when it never seems to go down", async () => {
  let attempts = 0;
  const up = await waitForRestart({
    ping: () => {
      attempts += 1;
      return Promise.resolve(true);
    },
    wait: () => Promise.resolve(),
    downTimeoutMs: 200,
    upTimeoutMs: 200,
    intervalMs: 100,
  });
  assert.equal(up, true, "a restart too fast to observe is still a restart");
});

test("waitForServer gives up instead of polling forever", async () => {
  let attempts = 0;
  const up = await waitForServer({
    ping: () => {
      attempts += 1;
      return Promise.resolve(false);
    },
    wait: () => Promise.resolve(),
    timeoutMs: 300,
    intervalMs: 100,
  });
  assert.equal(up, false);
  assert.equal(attempts, 3);
});
