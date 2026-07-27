import { createReadStream } from "node:fs";
import readline from "node:readline";
import { parseProcessedMs } from "./auditWindow.js";

/**
 * Scan an NDJSON file for earliest/latest processed timestamps (fallback after manual stop).
 * @returns {{ oldestProcessed: string | null, newestProcessed: string | null }}
 */
export async function scanNdjsonProcessedRange(filePath) {
  let oldestMs = null;
  let newestMs = null;

  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const processedMs = parseProcessedMs(trimmed);
    if (processedMs == null) continue;
    if (oldestMs === null || processedMs < oldestMs) oldestMs = processedMs;
    if (newestMs === null || processedMs > newestMs) newestMs = processedMs;
  }

  return {
    oldestProcessed: oldestMs != null ? new Date(oldestMs).toISOString() : null,
    newestProcessed: newestMs != null ? new Date(newestMs).toISOString() : null,
  };
}
