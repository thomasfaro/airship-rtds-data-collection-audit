import EventTypePicker from "./EventTypePicker.jsx";
import { EVENT_GROUPS } from "../lib/eventRegistry.js";

const inputClass = "input-field !mt-1 !py-2 text-sm";
const labelClass = "block text-xs font-semibold text-airship-navy";

function hasActiveDisplayFilters(filters) {
  return Boolean(filters.group || filters.namedUser || filters.channel || filters.text || filters.types);
}

function ActiveFiltersBadge({ filters }) {
  if (!hasActiveDisplayFilters(filters)) return null;
  return <span className="badge-blue py-0.5 text-[10px]">active</span>;
}

function AudienceFields({ filters, onChange }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className={labelClass}>
        Group
        <select className={inputClass} value={filters.group} onChange={set("group")}>
          {EVENT_GROUPS.map((group) => (
            <option key={group || "all"} value={group}>
              {group || "All groups"}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Named user
        <input
          className={inputClass}
          value={filters.namedUser}
          onChange={set("namedUser")}
          placeholder="contains…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className={labelClass}>
        Channel
        <input
          className={`${inputClass} font-mono`}
          value={filters.channel}
          onChange={set("channel")}
          placeholder="UUID contains…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className={labelClass}>
        Text
        <input
          className={inputClass}
          value={filters.text}
          onChange={set("text")}
          placeholder="search in JSON…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
    </div>
  );
}

function EventTypesSection({ compact, filters, onChange, eventTypeOptions }) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-airship-navy">Event types</p>
        {!compact && (
          <p className="mt-0.5 text-xs text-airship-muted">
            Filter by effective type on cards (includes derived EMAIL/SMS labels). Empty = all types.
          </p>
        )}
      </div>
      <EventTypePicker
        dense={compact}
        showHelp={!compact}
        emptyMeansAllVerb="shown"
        value={filters.types}
        onChange={(types) => onChange({ ...filters, types })}
        eventTypeOptions={eventTypeOptions}
        title=""
        hint={
          compact ? (
            <span className="text-airship-muted">
              Effective type on cards (includes EMAIL_* from CUSTOM). Empty = show all received types.
            </span>
          ) : (
            <>
              Filter by <strong>effective event type</strong> (what you see on each card), including derived email/SMS
              labels. If none selected, <strong>all types</strong> are shown.
            </>
          )
        }
      />
    </div>
  );
}

const panelClass =
  "rounded-xl border-2 border-airship-blue/30 bg-gradient-to-b from-airship-blue-light/50 to-airship-surface shadow-sm";

export default function DisplayFilters({
  filters,
  onChange,
  onClear,
  eventTypeOptions = [],
  compact = false,
}) {
  if (compact) {
    return (
      <details className={panelClass} open={hasActiveDisplayFilters(filters)} aria-label="Display filters">
        <summary className="cursor-pointer list-none p-3 hover:bg-airship-blue-light/30 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-airship-navy">Display filters</span>
            <ActiveFiltersBadge filters={filters} />
            <span className="badge-seafoam py-0.5 text-[10px]">client-side</span>
            <span className="ml-auto text-[10px] text-airship-muted">click to expand</span>
          </span>
          <p className="mt-1 text-xs leading-snug text-airship-body">
            Narrow events already in the stream — group, audience, text search, then event types.
          </p>
        </summary>

        <div className="space-y-3 border-t border-airship-blue/20 p-3 pt-3">
          <AudienceFields filters={filters} onChange={onChange} />

          <div className="border-t border-airship-blue/20 pt-4">
            <EventTypesSection compact filters={filters} onChange={onChange} eventTypeOptions={eventTypeOptions} />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded border border-airship-border-strong px-2.5 py-1 text-xs font-medium text-airship-navy hover:bg-airship-surface"
              onClick={onClear}
            >
              Clear all filters
            </button>
          </div>
        </div>
      </details>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border-2 border-airship-blue/25 bg-airship-surface p-5 shadow-card">
      <div>
        <p className="text-sm font-bold text-airship-navy">Display filters</p>
        <p className="mt-1 text-sm text-airship-body">
          Narrow events already received in the stream (client-side only). Start with audience fields, then event types.
        </p>
      </div>

      <AudienceFields filters={filters} onChange={onChange} />

      <div className="border-t border-airship-border pt-4">
        <EventTypesSection compact={false} filters={filters} onChange={onChange} eventTypeOptions={eventTypeOptions} />
      </div>

      <div>
        <button type="button" className="btn-secondary" onClick={onClear}>
          Clear all filters
        </button>
      </div>
    </section>
  );
}
