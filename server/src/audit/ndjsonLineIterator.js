import { createReadStream } from "node:fs";

export const NDJSON_READ_HIGH_WATER_MARK = 1024 * 1024;

function ndjsonLineToString(lineBytes) {
  if (!lineBytes.length) return "";
  if (lineBytes[0] <= 0x20 || lineBytes[lineBytes.length - 1] <= 0x20) {
    return lineBytes.toString("utf8").trim();
  }
  return lineBytes.toString("utf8");
}

/**
 * Stream NDJSON lines from disk with a large read buffer (faster than readline on big files).
 * @param {string} filePath
 * @param {{ signal?: AbortSignal, highWaterMark?: number }} [options]
 */
export async function* iterateNdjsonLines(
  filePath,
  { signal, highWaterMark = NDJSON_READ_HIGH_WATER_MARK } = {},
) {
  const stream = createReadStream(filePath, { highWaterMark });
  let lineCarry = Buffer.alloc(0);

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const scanBuf = lineCarry.length ? Buffer.concat([lineCarry, chunk]) : chunk;
      let start = 0;

      for (let i = 0; i < scanBuf.length; i += 1) {
        if (scanBuf[i] !== 0x0a) continue;
        if (i > start) {
          const line = ndjsonLineToString(scanBuf.subarray(start, i));
          if (line) yield line;
        }
        start = i + 1;
      }

      lineCarry = scanBuf.subarray(start);
    }

    if (lineCarry.length) {
      const line = ndjsonLineToString(lineCarry);
      if (line) yield line;
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw error;
  } finally {
    stream.destroy();
  }
}
