import { parseDeviceTypesCsv } from "../lib/deviceTypes.js";
import { AUDIENCE_FILTER_FIELDS, splitAudienceValues } from "../lib/streamAudienceFilters.js";

function formatTypesShort(typesCsv) {
  const types = String(typesCsv ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (types.length === 0) return "all types";
  if (types.length <= 3) return types.join(", ");
  return `${types.length} types`;
}

function formatDeviceTypesShort(deviceTypesCsv) {
  const values = parseDeviceTypesCsv(deviceTypesCsv);
  if (values.length === 0) return "all devices";
  if (values.length <= 2) return values.join(", ");
  return `${values.length} devices`;
}

function formatAudienceShort(key, values) {
  if (!values.length) return null;
  if (values.length === 1) {
    if (key === "channel" || key === "push_id") {
      return `${key.slice(0, 4)}:…${values[0].slice(-6)}`;
    }
    return `${key.slice(0, 4)}:${values[0]}`;
  }
  return `${key.slice(0, 4)}:${values.length}`;
}

/** One-line recap for collapsed summary. */
export function liveRequestOneLine(filters) {
  const start =
    String(filters.start ?? "LATEST").toUpperCase() === "EARLIEST" ? "EARLIEST" : "LATEST";
  const parts = [
    filters.profile,
    start,
    formatTypesShort(filters.types),
    formatDeviceTypesShort(filters.device_types),
  ];
  for (const { key } of AUDIENCE_FILTER_FIELDS) {
    const short = formatAudienceShort(key, splitAudienceValues(filters[key]));
    if (short) parts.push(short);
  }
  return parts.filter(Boolean).join(" · ");
}

function CompactChip({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex max-w-full items-baseline gap-1 rounded bg-airship-surface-muted px-1.5 py-0.5">
      <span className="shrink-0 text-[10px] uppercase text-airship-muted">{label}</span>
      <span className="truncate font-mono text-[11px] text-airship-navy">{value}</span>
    </span>
  );
}

function AudienceChips({ filters }) {
  const chips = [];
  for (const { key, label } of AUDIENCE_FILTER_FIELDS) {
    for (const value of splitAudienceValues(filters[key])) {
      chips.push({ key: `${key}-${value}`, label, value });
    }
  }
  if (!chips.length) return null;
  return (
    <>
      {chips.map((chip) => (
        <CompactChip key={chip.key} label={chip.label} value={chip.value} />
      ))}
    </>
  );
}

export default function LiveRequestSummary({ filters, requestLabel, compact = false }) {
  const oneLine = liveRequestOneLine(filters);

  if (compact) {
    return (
      <details className="group rounded border border-airship-border bg-airship-surface text-xs">
        <summary className="cursor-pointer list-none px-2 py-1 hover:bg-airship-off-white [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold text-airship-muted">Request</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-airship-navy">{oneLine}</span>
            <span className="text-[10px] text-airship-muted group-open:hidden">details</span>
          </span>
        </summary>
        <div className="flex flex-wrap gap-1 border-t border-airship-border px-2 py-1.5">
          <CompactChip label="project" value={filters.profile} />
          <CompactChip
            label="start"
            value={String(filters.start ?? "LATEST").toUpperCase() === "EARLIEST" ? "EARLIEST" : "LATEST"}
          />
          <CompactChip label="tz" value={filters.timezone} />
          <AudienceChips filters={filters} />
          <CompactChip label="devices" value={formatDeviceTypesShort(filters.device_types)} />
          <CompactChip label="types" value={formatTypesShort(filters.types)} />
          <CompactChip label="limit" value={filters.no_limit ? "∞" : filters.limit} />
        </div>
        {requestLabel && (
          <p className="border-t border-airship-border px-2 py-1 font-mono text-[10px] text-airship-muted">
            {requestLabel}
          </p>
        )}
      </details>
    );
  }

  return (
    <section className="card-padded">
      <h2 className="section-title">Stream request</h2>
      <p className="mt-1 text-xs text-airship-muted">
        {String(filters.start ?? "LATEST").toUpperCase() === "EARLIEST" ? "EARLIEST" : "LATEST"} — configuration sent
        when the stream started.
      </p>
      <p className="mt-2 font-mono text-sm text-airship-navy">{oneLine}</p>
    </section>
  );
}
