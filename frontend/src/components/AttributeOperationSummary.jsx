import {
  attributeOpStreamLabel,
  eventAttributeOperations,
  formatAttributeValue,
} from "../lib/attributeOperation.js";

const STREAM_MAX_OPS = 4;

function StreamOpBadge({ op }) {
  const label = attributeOpStreamLabel(op);
  const action = String(op.action || "set").toLowerCase();
  const isRemove = action === "remove";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
        isRemove
          ? "bg-slate-100 text-slate-800 ring-1 ring-slate-300/80"
          : "bg-blue-50 text-blue-950 ring-1 ring-blue-200/90"
      }`}
      title={label}
    >
      <span className="min-w-0 break-all font-mono">{label}</span>
    </span>
  );
}

function DetailOpRow({ op }) {
  const action = String(op.action || "set");
  const valueText = formatAttributeValue(op.value);
  const typeHint = op.type != null ? String(op.type) : null;

  return (
    <div className="min-w-0 rounded-lg border border-blue-200/80 bg-white/80 px-2.5 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="break-all font-mono text-xs font-semibold text-airship-navy">{op.key}</span>
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-900">
          {action}
        </span>
        {typeHint && (
          <span className="text-[10px] text-airship-muted">
            type <span className="font-mono text-airship-navy">{typeHint}</span>
          </span>
        )}
      </div>
      {valueText != null ? (
        <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-airship-body">{valueText}</p>
      ) : (
        <p className="mt-1 text-[11px] italic text-airship-muted">No value (attribute removed or cleared)</p>
      )}
    </div>
  );
}

/** Compact badges for stream list rows. */
export function AttributeOperationBadges({ event }) {
  const ops = eventAttributeOperations(event);
  if (!ops.length) return null;

  const visible = ops.slice(0, STREAM_MAX_OPS);
  const extra = ops.length - visible.length;

  return (
    <span className="flex min-w-0 flex-wrap gap-1 pl-1">
      {visible.map((op, index) => (
        <StreamOpBadge key={`${op.key}-${op.action}-${index}`} op={op} />
      ))}
      {extra > 0 && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-800 ring-1 ring-blue-200/90">
          +{extra} more
        </span>
      )}
    </span>
  );
}

/** Highlighted panel for event detail drawer. */
export function AttributeOperationPanel({ event }) {
  const ops = eventAttributeOperations(event);
  if (!ops.length) return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border-2 border-blue-300/80 bg-blue-50/90 px-3 py-2.5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-airship-navy">Attribute operations</p>
        <p className="mt-0.5 text-[11px] leading-snug text-airship-muted">
          Keys and values from this <span className="font-mono">ATTRIBUTE_OPERATION</span> event.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {ops.map((op, index) => (
          <DetailOpRow key={`${op.key}-${op.action}-${index}`} op={op} />
        ))}
      </div>
      {ops.length > 1 && (
        <p className="text-[10px] text-airship-muted">
          {ops.length} operation{ops.length === 1 ? "" : "s"} in this event
        </p>
      )}
    </section>
  );
}
