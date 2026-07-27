const DEFAULT_WINDOW = 400;

/** @param {string | undefined} message */
export function extractJsonErrorPosition(message) {
  if (!message) return null;
  const match = String(message).match(/position (\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Build a preview of an NDJSON line, centered on the JSON parse error when possible.
 * @param {string} line
 * @param {string | undefined} errorMessage
 * @param {{ windowSize?: number }} [options]
 */
export function buildLineErrorPreview(line, errorMessage, { windowSize = DEFAULT_WINDOW } = {}) {
  if (!line) {
    return { preview: "", lineLength: 0, position: null, range: { start: 0, end: 0 } };
  }

  const lineLength = line.length;
  const position = extractJsonErrorPosition(errorMessage);
  if (position != null && Number.isFinite(position)) {
    const half = Math.floor(windowSize / 2);
    let start = Math.max(0, position - half);
    let end = Math.min(lineLength, start + windowSize);
    if (end - start < windowSize) {
      start = Math.max(0, end - windowSize);
    }
    const slice = line.slice(start, end);
    return {
      preview: `${start > 0 ? "…" : ""}${slice}${end < lineLength ? "…" : ""}`,
      position,
      lineLength,
      range: { start, end },
    };
  }

  const end = Math.min(windowSize, lineLength);
  return {
    preview: line.slice(0, end) + (lineLength > windowSize ? "…" : ""),
    position: null,
    lineLength,
    range: { start: 0, end },
  };
}

/** @param {Array<{ kind?: string, message?: string, linePreview?: string, eventType?: string | null }>} samples */
export function formatLineErrorSampleHint(samples) {
  if (!samples?.length) return "";
  const first = samples[0];
  const kindPrefix = first.kind === "process" ? `${first.eventType ?? "event"} — ` : "";
  const errPart = first.message ? `${kindPrefix}${first.message}` : "";
  const linePart = first.linePreview ? ` Content: ${first.linePreview}` : "";
  if (!errPart && !linePart) return "";
  return ` Example: ${errPart}${linePart}`;
}
