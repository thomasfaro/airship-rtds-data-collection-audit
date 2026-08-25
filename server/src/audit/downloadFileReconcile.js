import fs from "node:fs";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import { scanNdjsonProcessedRange } from "./scanProcessedRange.js";

async function countNdjsonLines(filePath) {
  let count = 0;
  const rl = readline.createInterface({
    input: createReadStream(filePath, { highWaterMark: 1024 * 1024 }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

/**
 * After a manual stop, verify the capture file on disk before analyze.
 * When `trustLiveLines` is set (manual stop with in-flight counters), skip a full line count.
 */
export async function reconcileDownloadedNdjsonFile(
  filePath,
  {
    liveLines = 0,
    liveBytes = 0,
    trustLiveLines = false,
    skipProcessedScan = false,
    oldestProcessed: knownOldest = null,
    newestProcessed: knownNewest = null,
  } = {},
) {
  if (!filePath) {
    return {
      linesWritten: 0,
      bytesWritten: 0,
      oldestProcessed: null,
      newestProcessed: null,
      fileMissing: true,
    };
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        linesWritten: 0,
        bytesWritten: 0,
        oldestProcessed: null,
        newestProcessed: null,
        fileMissing: true,
      };
    }
    throw error;
  }

  if (stat.size === 0) {
    return {
      linesWritten: 0,
      bytesWritten: 0,
      oldestProcessed: null,
      newestProcessed: null,
      fileMissing: false,
      emptyFile: true,
    };
  }

  let linesWritten = 0;
  if (trustLiveLines && liveLines > 0 && stat.size > 0) {
    linesWritten = liveLines;
  } else {
    try {
      linesWritten = await countNdjsonLines(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          linesWritten: 0,
          bytesWritten: 0,
          oldestProcessed: null,
          newestProcessed: null,
          fileMissing: true,
        };
      }
      throw error;
    }

    if (linesWritten === 0 && liveLines > 0) {
      linesWritten = liveLines;
    }
  }

  const bytesWritten = stat.size > 0 ? stat.size : liveBytes;

  let oldestProcessed = knownOldest;
  let newestProcessed = knownNewest;
  if (linesWritten > 0 && !(skipProcessedScan && (oldestProcessed || newestProcessed))) {
    try {
      ({ oldestProcessed, newestProcessed } = await scanNdjsonProcessedRange(filePath));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("[capture] processed range scan failed:", error.message);
      }
    }
  }

  return {
    linesWritten,
    bytesWritten,
    oldestProcessed,
    newestProcessed,
    fileMissing: false,
  };
}
