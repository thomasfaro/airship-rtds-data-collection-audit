import test from "node:test";
import assert from "node:assert/strict";
import { sseDataLine, initSseResponse, writeSse } from "./sse.js";

test("sseDataLine serializes payload as SSE data line", () => {
  assert.equal(sseDataLine({ kind: "status", message: "ok" }), 'data: {"kind":"status","message":"ok"}\n\n');
});

test("initSseResponse sets event-stream headers", () => {
  const headers = {};
  const res = {
    setHeader(key, value) {
      headers[key] = value;
    },
    flushHeaders() {},
  };
  initSseResponse(res);
  assert.equal(headers["Content-Type"], "text/event-stream");
  assert.equal(headers["Cache-Control"], "no-cache, no-transform");
  assert.match(headers.Connection, /keep-alive/i);
});

test("writeSse writes chunk to response", () => {
  const chunks = [];
  const res = { write(chunk) { chunks.push(chunk); } };
  writeSse(res, "data: {}\n\n", { flush: false });
  assert.deepEqual(chunks, ["data: {}\n\n"]);
});
