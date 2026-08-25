const MAX_BACKOFF_MS = 30_000;

/** Exponential backoff between RTDS reconnect attempts, capped at 30s. */
export function reconnectBackoffMs(attempt) {
  const safeAttempt = Math.max(1, attempt);
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(safeAttempt - 1, 5));
}

export async function sleepMs(ms, signal) {
  if (signal?.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      },
      { once: true },
    );
  });
}
