import { useMemo } from "react";
import { buildCoverageSummary } from "../../lib/coverageSummary.js";
import CoverageCategoryCard from "./CoverageCategoryCard.jsx";
import TaggingPlanDownloads from "./TaggingPlanDownloads.jsx";
import WarningsList from "./WarningsList.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function stopModeLabel(meta) {
  const mode = meta?.stopMode ?? (meta?.realTime ? "realtime" : "manual");
  if (mode !== "realtime") return "Manual stop";
  return meta?.autoStopped ? "Real-time auto-stop (triggered)" : "Real-time auto-stop";
}

function CaptureFacts({ meta, summary }) {
  const facts = [
    ["Events analyzed", (meta?.totalEvents ?? 0).toLocaleString("en-US")],
    ["Tracked keys", summary.totalKeys.toLocaleString("en-US")],
    ["Processed time", meta?.downloadHours?.processedRange?.spanLabel ?? "—"],
    ["Stop mode", stopModeLabel(meta)],
    ["Platforms", summary.platforms.length ? summary.platforms.join(", ") : "—"],
    ["Report timezone", meta?.timezone ?? "—"],
  ];

  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-airship-border/60 pb-1">
          <dt className="text-xs uppercase tracking-wide text-airship-muted">{label}</dt>
          <dd className="text-right font-medium text-airship-navy">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The results screen: what the capture covered, what looks inconsistent, and the
 * two tagging plan downloads.
 */
export default function CoverageSummary({ report, onNewCapture, savedAt = null }) {
  const summary = useMemo(() => buildCoverageSummary(report), [report]);
  const meta = report?.meta ?? {};

  return (
    <div className="space-y-4">
      <section className="card-padded space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-airship-navy">Coverage summary</h2>
            <p className="mt-1 text-sm text-airship-muted">
              {meta.profile ?? "Unknown project"} · captured {formatDateTime(meta.generatedAt)}
              {savedAt ? ` · saved ${formatDateTime(savedAt)}` : ""}
            </p>
          </div>
          {onNewCapture ? (
            <button type="button" className="btn-secondary" onClick={onNewCapture}>
              New capture
            </button>
          ) : null}
        </div>
        <CaptureFacts meta={meta} summary={summary} />
      </section>

      <TaggingPlanDownloads report={report} />

      <div className="space-y-3">
        {summary.categories.map((category) => (
          <CoverageCategoryCard key={category.id} category={category} />
        ))}
      </div>

      <WarningsList report={report} />
    </div>
  );
}
