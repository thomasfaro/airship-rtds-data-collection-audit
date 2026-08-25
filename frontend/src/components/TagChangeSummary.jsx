import { eventTagChangeOps, truncateTagText } from "../lib/tagChange.js";

const STREAM_MAX_OPS = 4;

function StreamBadge({ op }) {
  const action = String(op.action || "set").toLowerCase();
  const isRemove = action === "remove";
  const tag = truncateTagText(op.tag, 40);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${
        isRemove
          ? "bg-slate-100 text-slate-800 ring-1 ring-slate-300/80"
          : "bg-sky-50 text-sky-950 ring-1 ring-sky-200/90"
      }`}
      title={`${tag} (${action})`}
    >
      <span className={`uppercase tracking-wide ${isRemove ? "text-slate-600" : "text-sky-800/90"}`}>
        {action}
      </span>
      <span className="min-w-0 break-all font-mono font-semibold normal-case tracking-normal">{tag}</span>
    </span>
  );
}

function DetailOpRow({ op }) {
  const action = String(op.action || "set").toLowerCase();
  const isRemove = action === "remove";

  return (
    <div className="min-w-0 rounded-lg border border-sky-200/80 bg-white/80 px-2.5 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="break-all font-mono text-xs font-semibold text-airship-navy">{op.tag}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            isRemove ? "bg-slate-200 text-slate-800" : "bg-sky-100 text-sky-900"
          }`}
        >
          {action}
        </span>
        {op.value == null && (
          <span className="text-[10px] text-airship-muted">boolean tag (group only)</span>
        )}
      </div>
      {op.value != null && (
        <p className="mt-1 text-[11px] text-airship-muted">
          group <span className="font-mono text-airship-navy">{op.group}</span>
          {" · "}
          value <span className="font-mono text-airship-navy">{op.value}</span>
        </p>
      )}
    </div>
  );
}

/** Compact badges for stream list rows (TAG_CHANGE). */
export function TagChangeBadges({ event }) {
  const ops = eventTagChangeOps(event);
  if (!ops.length) return null;

  const visible = ops.slice(0, STREAM_MAX_OPS);
  const extra = ops.length - visible.length;

  return (
    <span className="flex min-w-0 flex-wrap gap-1 pl-1">
      {visible.map((op, index) => (
        <StreamBadge key={`${op.tag}-${op.action}-${index}`} op={op} />
      ))}
      {extra > 0 && (
        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-800 ring-1 ring-sky-200/90">
          +{extra} more
        </span>
      )}
    </span>
  );
}

/** Highlighted panel for event detail drawer. */
export function TagChangePanel({ event }) {
  const ops = eventTagChangeOps(event);
  if (!ops.length) return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border-2 border-sky-300/80 bg-sky-50/90 px-3 py-2.5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-airship-navy">Tag changes</p>
        <p className="mt-0.5 text-[11px] leading-snug text-airship-muted">
          Tags set or removed in this <span className="font-mono">TAG_CHANGE</span> event.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {ops.map((op, index) => (
          <DetailOpRow key={`${op.tag}-${op.action}-${index}`} op={op} />
        ))}
      </div>
      {ops.length > 1 && (
        <p className="text-[10px] text-airship-muted">
          {ops.length} change{ops.length === 1 ? "" : "s"} in this event
        </p>
      )}
    </section>
  );
}
