/** @typedef {{ message: string, detail?: string, causeCode?: string, causeHint?: string, retryable?: boolean }} RtdsStreamErrorInfo */

export function isRtdsStreamTerminatedError(error) {
  if (!error) return false;
  if (error?.name === "AbortError") return false;

  const message = String(error?.message ?? error);
  if (message === "terminated" || /terminated/i.test(message)) return true;

  const cause = error?.cause;
  if (!cause) return false;
  if (cause.code === "UND_ERR_SOCKET" || cause.code === "UND_ERR_BODY_TIMEOUT") return true;
  const causeMessage = String(cause.message ?? "");
  return /other side closed|socket hang up|ECONNRESET/i.test(causeMessage);
}

function readCauseCode(error) {
  const cause = error?.cause;
  if (!cause) return undefined;
  if (cause.code) return String(cause.code);
  const message = String(cause.message ?? "");
  if (/other side closed/i.test(message)) return "UND_ERR_SOCKET";
  if (/hang up|ECONNRESET/i.test(message)) return "ECONNRESET";
  return undefined;
}

function causeHintForCode(code) {
  switch (code) {
    case "UND_ERR_SOCKET":
      return "The RTDS server or network closed the connection before the stream finished.";
    case "UND_ERR_BODY_TIMEOUT":
      return "The download timed out waiting for more RTDS data.";
    case "ECONNRESET":
      return "The network connection was reset (VPN, proxy, or firewall).";
    default:
      return "The RTDS stream was interrupted unexpectedly.";
  }
}

/**
 * Map low-level fetch/undici stream errors to user-facing audit messages.
 * @param {unknown} error
 * @param {{ phase?: string }} [options]
 * @returns {RtdsStreamErrorInfo}
 */
export function formatRtdsStreamError(error, { phase = "download" } = {}) {
  if (error?.name === "AbortError") {
    return {
      message: phase === "analyze" ? "Analysis cancelled" : "Audit cancelled",
      retryable: false,
    };
  }

  const causeCode = readCauseCode(error);
  const raw = String(error?.message ?? error);

  if (isRtdsStreamTerminatedError(error)) {
    return {
      message:
        phase === "download"
          ? "RTDS connection interrupted during download"
          : "RTDS connection interrupted",
      detail: causeCode ? `${causeCode}: ${raw}` : raw,
      causeCode,
      causeHint: causeHintForCode(causeCode),
      retryable: true,
    };
  }

  if (/RTDS HTTP/i.test(raw)) {
    return {
      message: "RTDS rejected the audit request",
      detail: raw,
      retryable: false,
    };
  }

  return {
    message: phase === "download" ? "Audit download failed" : "Audit failed",
    detail: raw,
    causeCode,
    causeHint: causeCode ? causeHintForCode(causeCode) : undefined,
    retryable: false,
  };
}
