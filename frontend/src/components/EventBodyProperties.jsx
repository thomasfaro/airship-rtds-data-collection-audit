import {
  eventCompliancePropertyEntries,
  eventSubscriptionPropertyEntries,
  formatCustomPropertyValue,
  isComplexCustomPropertyValue,
} from "../lib/eventRegistry.js";

const ACCENTS = {
  emerald: {
    badge: "bg-emerald-50 text-emerald-950 ring-emerald-200/90",
    label: "text-emerald-800/90",
    more: "bg-emerald-50 text-emerald-800 ring-emerald-200/90",
  },
  violet: {
    badge: "bg-violet-50 text-violet-950 ring-violet-200/90",
    label: "text-violet-800/90",
    more: "bg-violet-50 text-violet-800 ring-violet-200/90",
  },
};

function PropertyBadge({ name, value, accent }) {
  const styles = ACCENTS[accent] ?? ACCENTS.emerald;
  const preview = isComplexCustomPropertyValue(value)
    ? "{…}"
    : formatCustomPropertyValue(value);
  const short = preview.length > 40 ? `${preview.slice(0, 37)}…` : preview;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ring-1 ${styles.badge}`}
      title={`${name}: ${formatCustomPropertyValue(value)}`}
    >
      <span className={`shrink-0 uppercase tracking-wide ${styles.label}`}>{name}</span>
      <span className="min-w-0 break-all font-mono font-semibold normal-case tracking-normal">{short}</span>
    </span>
  );
}

function BodyPropertiesBadges({ entries, accent = "emerald", max = 4 }) {
  if (!entries?.length) return null;

  const visible = entries.slice(0, max);
  const extra = entries.length - visible.length;
  const styles = ACCENTS[accent] ?? ACCENTS.emerald;

  return (
    <span className="flex min-w-0 flex-wrap gap-1 pl-1">
      {visible.map(([key, value]) => (
        <PropertyBadge key={key} name={key} value={value} accent={accent} />
      ))}
      {extra > 0 && (
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${styles.more}`}>
          +{extra} more
        </span>
      )}
    </span>
  );
}

/** Compact property badges for SUBSCRIPTION events in the stream list. */
export function SubscriptionPropertiesBadge({ event, max = 4 }) {
  return (
    <BodyPropertiesBadges entries={eventSubscriptionPropertyEntries(event)} accent="emerald" max={max} />
  );
}

/** Compact property badges for COMPLIANCE events in the stream list. */
export function CompliancePropertiesBadge({ event, max = 4 }) {
  return (
    <BodyPropertiesBadges entries={eventCompliancePropertyEntries(event)} accent="violet" max={max} />
  );
}
