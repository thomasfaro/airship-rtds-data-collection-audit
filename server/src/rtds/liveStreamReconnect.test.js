import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBodyForConnect,
  resolveLiveEventLimit,
  shouldReconnectLiveStream,
} from "./liveStreamReconnect.js";

test("buildBodyForConnect uses start on first connect", () => {
  const { body } = buildBodyForConnect({ start: "EARLIEST", types: "OPEN" }, null);
  assert.equal(body.start, "EARLIEST");
  assert.equal(body.resume_offset, undefined);
});

test("buildBodyForConnect resumes from offset after first event", () => {
  const { body } = buildBodyForConnect({ start: "EARLIEST", types: "OPEN" }, "offset-42");
  assert.equal(body.start, undefined);
  assert.equal(body.resume_offset, "offset-42");
});

test("shouldReconnectLiveStream without limit always reconnects", () => {
  assert.equal(shouldReconnectLiveStream({}, 500), true);
  assert.equal(resolveLiveEventLimit({}), null);
});

test("shouldReconnectLiveStream stops reconnecting once limit reached", () => {
  assert.equal(shouldReconnectLiveStream({ limit: "1000" }, 999), true);
  assert.equal(shouldReconnectLiveStream({ limit: "1000" }, 1000), false);
});

test("resolveLiveStoreRaw is off unless the query opts in", async () => {
  const { resolveLiveStoreRaw } = await import("./liveStreamReconnect.js");
  assert.equal(resolveLiveStoreRaw({}), false);
  assert.equal(resolveLiveStoreRaw({ store_raw: "0" }), false);
  assert.equal(resolveLiveStoreRaw({ store_raw: "1" }), true);
  assert.equal(resolveLiveStoreRaw({ store_raw: "true" }), true);
});
