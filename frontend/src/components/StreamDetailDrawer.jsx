import { useCallback, useState } from "react";
import { copyTextToClipboard, formatJsonForClipboard } from "../lib/clipboard.js";
import EventCard from "./EventCard.jsx";
import MessageCard from "./MessageCard.jsx";

function payloadForEntry(entry) {
  if (entry.kind === "event") return entry.event;
  return entry.payload;
}

export default function StreamDetailDrawer({ entry, timezone, onClose }) {
  const [copyState, setCopyState] = useState("idle");

  const onCopy = useCallback(async () => {
    if (!entry) return;
    try {
      await copyTextToClipboard(formatJsonForClipboard(payloadForEntry(entry)));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  }, [entry]);

  if (!entry) return null;

  const copyLabel =
    copyState === "copied" ? "Copied!" : copyState === "error" ? "Copy failed" : "Copy JSON";

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-airship-border bg-airship-surface shadow-xl"
      role="dialog"
      aria-label="Event detail"
    >
      <div className="flex items-center justify-between gap-2 border-b border-airship-border px-3 py-2">
        <p className="text-xs font-semibold text-airship-muted">Detail</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs font-medium ${
              copyState === "copied"
                ? "bg-teal-50 text-teal-800"
                : copyState === "error"
                  ? "bg-red-50 text-airship-danger"
                  : "text-airship-navy hover:bg-airship-off-white"
            }`}
            onClick={onCopy}
          >
            {copyLabel}
          </button>
          <button type="button" className="rounded px-2 py-1 text-xs text-airship-muted hover:bg-airship-off-white" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {entry.kind === "event" ? (
          <EventCard key={entry.id} event={entry.event} timezone={timezone} defaultExpanded />
        ) : (
          <MessageCard payload={entry.payload} isError={entry.isError} />
        )}
      </div>
    </div>
  );
}
