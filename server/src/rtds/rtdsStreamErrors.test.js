import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRtdsStreamError,
  isRtdsStreamTerminatedError,
} from "./rtdsStreamErrors.js";

test("isRtdsStreamTerminatedError detects undici terminated", () => {
  const error = new TypeError("terminated");
  error.cause = { code: "UND_ERR_SOCKET", message: "other side closed" };
  assert.equal(isRtdsStreamTerminatedError(error), true);
});

test("isRtdsStreamTerminatedError ignores AbortError", () => {
  const error = new DOMException("Aborted", "AbortError");
  assert.equal(isRtdsStreamTerminatedError(error), false);
});

test("formatRtdsStreamError maps terminated to friendly download message", () => {
  const error = new TypeError("terminated");
  error.cause = { code: "UND_ERR_SOCKET", message: "other side closed" };
  const formatted = formatRtdsStreamError(error, { phase: "download" });
  assert.match(formatted.message, /interrupted during download/i);
  assert.equal(formatted.retryable, true);
  assert.ok(formatted.causeHint);
});
