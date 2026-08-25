import { randomUUID } from "node:crypto";
import { resolveLiveStoreRaw } from "../rtds/liveStreamReconnect.js";
import { cleanupLiveStream, registerLiveStream } from "./streamRegistry.js";
import { createLiveRawFilePath } from "./paths.js";

/**
 * Run a live RTDS SSE response with abort on client disconnect and temp file cleanup.
 * Keep the NDJSON only when the request opted into store_raw — otherwise delete on teardown.
 */
export async function runLiveSse(req, res, profileName, streamFactory) {
  const streamId = randomUUID();
  const storeRaw = resolveLiveStoreRaw(req.query);
  const rawFilePath = createLiveRawFilePath(profileName, streamId);
  const abort = new AbortController();

  registerLiveStream(streamId, { filePath: rawFilePath, profileName, storeRaw });

  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
    abort.abort();
    cleanupLiveStream(streamId);
  });

  const heartbeatMs = 15_000;
  const heartbeat = setInterval(() => {
    if (clientClosed || abort.signal.aborted) return;
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clientClosed = true;
      abort.abort();
    }
  }, heartbeatMs);

  try {
    for await (const chunk of streamFactory({
      signal: abort.signal,
      rawFilePath,
      streamId,
    })) {
      if (clientClosed || abort.signal.aborted) break;
      res.write(chunk);
    }
  } catch (error) {
    if (!clientClosed && !abort.signal.aborted) {
      res.write(`data: ${JSON.stringify({ kind: "error", message: String(error) })}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    cleanupLiveStream(streamId);
    res.end();
  }
}
