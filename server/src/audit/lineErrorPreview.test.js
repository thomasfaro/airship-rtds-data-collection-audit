import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLineErrorPreview,
  extractJsonErrorPosition,
  formatLineErrorSampleHint,
} from "./lineErrorPreview.js";

test("extractJsonErrorPosition reads position from V8 message", () => {
  assert.equal(
    extractJsonErrorPosition("Unterminated string in JSON at position 819 (line 1 column 820)"),
    819,
  );
});

test("buildLineErrorPreview centers on parse error position", () => {
  const line = `${"a".repeat(700)}ERROR${"b".repeat(700)}`;
  const preview = buildLineErrorPreview(line, "Unexpected token at position 703", { windowSize: 40 });
  assert.equal(preview.position, 703);
  assert.equal(preview.lineLength, line.length);
  assert.match(preview.preview, /ERROR/);
  assert.ok(preview.preview.startsWith("…") || preview.range.start === 0);
});

test("formatLineErrorSampleHint includes line content", () => {
  const hint = formatLineErrorSampleHint([
    {
      kind: "json",
      message: "Unterminated string in JSON at position 142",
      linePreview: '{"id":"abc","processed":"2026-05-27',
    },
  ]);
  assert.match(hint, /Example:/);
  assert.match(hint, /Unterminated string/);
  assert.match(hint, /Content: \{"id":"abc"/);
});
