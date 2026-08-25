import { Link } from "react-router-dom";
import { APP_ROUTES } from "../lib/appNav.js";
import { formatProcessedStreamCompact } from "../lib/processedHours.js";

function statusClass(tone) {
  if (tone === "live") return "status-live";
  if (tone === "error") return "status-error";
  return "text-airship-muted";
}

function QuickNavLink({ to, children }) {
  return (
    <Link
      to={to}
      className="shrink-0 rounded px-1.5 py-0.5 text-airship-muted hover:bg-airship-off-white hover:text-airship-blue"
    >
      {children}
    </Link>
  );
}

export default function LiveMonitorHeader({
  status,
  isLive = false,
  visibleCount,
  eventCount,
  showProcessedRange = false,
  earliestProgress = null,
  onClear,
  onStop,
}) {
  const processedSummary =
    showProcessedRange && earliestProgress ? formatProcessedStreamCompact(earliestProgress) : null;

  return (
    <header className="flex flex-col gap-1 border-b border-airship-border bg-airship-surface">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 px-2 py-1 text-[11px]">
        <QuickNavLink to={APP_ROUTES.home}>Home</QuickNavLink>
        <span className="text-airship-border-strong" aria-hidden>
          ·
        </span>
        <QuickNavLink to={APP_ROUTES.live}>Live setup</QuickNavLink>
        <span className="text-airship-border-strong" aria-hidden>
          ·
        </span>
        <QuickNavLink to={APP_ROUTES.history}>History</QuickNavLink>
        <span className="text-airship-border-strong" aria-hidden>
          ·
        </span>
        <QuickNavLink to={APP_ROUTES.audit}>Data collection audit</QuickNavLink>
      </div>
      <div className="flex items-center gap-x-2 gap-y-1 px-2 pb-2 text-xs">
        <div className="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden">
          <span className={`shrink-0 font-medium ${statusClass(status?.tone)}`}>{status?.text ?? "—"}</span>
          {processedSummary ? (
            <span
              className="min-w-0 truncate font-mono text-[11px] text-teal-800"
              title={processedSummary.title}
            >
              {processedSummary.label}
            </span>
          ) : showProcessedRange && isLive ? (
            <span className="shrink-0 text-[11px] text-airship-muted-light">processed…</span>
          ) : null}
          <span className="shrink-0 text-airship-muted">
            {visibleCount} visible · {eventCount} received
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded border border-airship-border-strong px-2.5 py-1 text-xs font-medium text-airship-navy hover:bg-airship-off-white"
            onClick={onClear}
            disabled={eventCount === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className={`rounded-pill px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isLive
                ? "bg-airship-danger text-white hover:bg-red-600 focus-visible:outline-airship-danger"
                : "cursor-default border border-airship-border-strong bg-airship-off-white text-airship-muted"
            }`}
            onClick={onStop}
            disabled={!isLive}
            aria-label={isLive ? "Stop live stream" : "Stream already stopped"}
          >
            {isLive ? "Stop stream" : "Stopped"}
          </button>
        </div>
      </div>
    </header>
  );
}
