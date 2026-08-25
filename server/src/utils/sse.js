/** Write an SSE chunk. Skip flush during high-volume download progress (caller opts in). */
export function writeSse(res, chunk, { flush = true } = {}) {
  res.write(chunk);
  if (flush && typeof res.flush === "function") {
    res.flush();
  }
}

export function initSseResponse(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

export function sseDataLine(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Send one SSE error event and end the response. */
export function endSseError(res, message, extra = {}) {
  initSseResponse(res);
  writeSse(res, sseDataLine({ kind: "error", message, ...extra }));
  res.end();
}

/**
 * Run an async SSE generator with client-disconnect abort.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {AsyncGenerator<string>} generator
 * @param {{ write?: (chunk: string) => void }} [options]
 */
export async function pipeSseGenerator(req, res, generator, options = {}) {
  initSseResponse(res);

  const abort = new AbortController();
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
    abort.abort();
  });

  const write =
    options.write ??
    ((chunk) => {
      if (clientClosed) return;
      const isBufferedDownloadProgress =
        chunk.includes('"kind":"progress"') &&
        chunk.includes('"phase":"download"') &&
        !chunk.includes('"done":true');
      writeSse(res, chunk, { flush: !isBufferedDownloadProgress });
    });

  try {
    for await (const chunk of generator) {
      if (clientClosed || abort.signal.aborted) break;
      write(chunk);
    }
  } catch (error) {
    if (!clientClosed) {
      writeSse(res, sseDataLine({ kind: "error", message: String(error?.message ?? error) }));
    }
  } finally {
    res.end();
  }

  return { clientClosed, signal: abort.signal };
}
