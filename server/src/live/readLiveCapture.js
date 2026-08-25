import fs from "node:fs";
import readline from "node:readline";

/**
 * Read NDJSON events from a live capture file, optionally skipping the first N non-empty lines.
 * @returns {Promise<{ events: object[], totalLines: number, fromLine: number }>}
 */
export async function readLiveCaptureEvents(filePath, { afterLines = 0, maxEvents = 10_000 } = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { events: [], totalLines: 0, fromLine: afterLines };
  }

  const events = [];
  let totalLines = 0;
  let fromLine = afterLines;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (totalLines < afterLines) {
      totalLines += 1;
      continue;
    }
    totalLines += 1;
    try {
      events.push(JSON.parse(trimmed));
      if (events.length >= maxEvents) break;
    } catch {
      // skip malformed lines
    }
  }

  return { events, totalLines, fromLine: afterLines };
}
