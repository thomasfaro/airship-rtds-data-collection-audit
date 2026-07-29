import { formatDurationDaysHours } from "../../lib/formatTimeSpan.js";

const KEY_CATEGORIES = [
  { id: "customEvents", label: "Custom events" },
  { id: "attributes", label: "Attributes" },
  { id: "tags", label: "Tags" },
  { id: "screens", label: "Screens" },
  { id: "subscriptionLists", label: "Subscription lists" },
];

const PLATEAU_CHECKS = [
  {
    id: "events",
    label: "Events captured",
    format: (value) => value.toLocaleString("en-US"),
  },
  {
    id: "processedSpanMs",
    label: "Processed time covered",
    format: (value) => formatDurationDaysHours(value),
  },
  {
    id: "eventsSinceLastNewKey",
    label: "Events since the last new key",
    format: (value) => value.toLocaleString("en-US"),
  },
  {
    id: "spanSinceLastNewKeyMs",
    label: "Processed time since the last new key",
    format: (value) => formatDurationDaysHours(value),
  },
];

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-airship border border-airship-border bg-airship-surface px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-airship-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-airship-navy">{value}</p>
      {hint ? <p className="text-[11px] text-airship-muted">{hint}</p> : null}
    </div>
  );
}

function CheckRow({ label, current, target, format }) {
  const ratio = target > 0 ? Math.min(1, current / target) : 0;
  const met = current >= target;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={met ? "font-medium text-teal-700" : "text-airship-body"}>
          {met ? "✓ " : ""}
          {label}
        </span>
        <span className="tabular-nums text-airship-muted">
          {format(current)} / {format(target)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-airship-surface-muted">
        <div
          className={`h-full rounded-pill transition-all ${met ? "bg-airship-success" : "bg-airship-blue"}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </li>
  );
}

/**
 * The four checks that decide coverage has settled. Real-time stops the capture as
 * soon as they all pass; manual only shows them, because "no new key in the last
 * 100k events" is what turns clicking Stop into a decision rather than a guess.
 */
function PlateauChecks({ plateau, realtime }) {
  const checks = PLATEAU_CHECKS.map((check) => ({
    ...check,
    current: plateau[check.id]?.current ?? 0,
    target: plateau[check.id]?.target ?? 0,
  }));
  const allMet = checks.every((check) => check.target > 0 && check.current >= check.target);

  return (
    <div>
      <h3 className="section-title">
        {realtime ? "Progress toward the automatic stop" : "Has the coverage settled?"}
      </h3>
      <p className="mt-1 text-xs text-airship-muted">
        {realtime
          ? "The capture stops on its own once all four conditions are met at the same time."
          : "Nothing stops on its own in manual mode. These are the four checks real-time mode uses — once they all pass, capturing longer rarely turns up a new key."}
      </p>
      <ul className="mt-3 space-y-3">
        {checks.map((check) => (
          <CheckRow key={check.id} {...check} />
        ))}
      </ul>
      {allMet && !realtime && (
        <p className="mt-3 rounded-airship border border-airship-success/40 bg-airship-success/10 p-3 text-sm font-medium text-teal-800">
          Coverage has settled — a good moment to stop and build the plan.
        </p>
      )}
    </div>
  );
}

/**
 * Live view of a running capture: how much has been read, what has been
 * discovered, and how close coverage is to settling.
 */
export default function CaptureProgressPanel({
  profile,
  stopMode,
  status,
  progress,
  stopping,
  onStop,
}) {
  const coverage = progress?.coverage ?? {};
  const keys = coverage.keys ?? {};
  const plateau = coverage.plateau ?? null;
  const events = progress?.linesWritten ?? coverage.events ?? 0;
  const processedRange = progress?.processedRange ?? null;
  const analyzing = progress?.phase && progress.phase !== "download";

  return (
    <section className="card-padded space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-airship-navy">
            {analyzing ? "Building the tagging plan" : "Capturing tracking events"}
          </h2>
          <p className="mt-1 text-sm text-airship-muted">
            {profile}
            {" · "}
            {stopMode === "realtime" ? "real-time auto-stop" : "manual stop"}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onStop} disabled={stopping}>
          {stopping ? "Stopping…" : "Stop and build the plan"}
        </button>
      </div>

      {status ? <p className="text-sm text-airship-body">{status}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Events" value={events.toLocaleString("en-US")} />
        <Metric label="Elapsed" value={progress?.elapsedLabel ?? "0s"} />
        <Metric
          label="Processed time covered"
          value={processedRange?.spanLabel ?? "—"}
          hint={
            processedRange?.from && processedRange?.to
              ? `${new Date(processedRange.from).toLocaleString()} → ${new Date(processedRange.to).toLocaleString()}`
              : "Waiting for the first events"
          }
        />
      </div>

      <div>
        <h3 className="section-title">Keys discovered</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-5">
          {KEY_CATEGORIES.map((category) => (
            <li
              key={category.id}
              className="rounded-airship border border-airship-border bg-airship-surface px-3 py-2 text-center"
            >
              <p className="text-lg font-semibold tabular-nums text-airship-navy">
                {(keys[category.id] ?? 0).toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-airship-muted">{category.label}</p>
            </li>
          ))}
        </ul>
      </div>

      {plateau && <PlateauChecks plateau={plateau} realtime={stopMode === "realtime"} />}
    </section>
  );
}
