import StreamAdvancedOptions from "./StreamAdvancedOptions.jsx";
import StreamAudienceFilterInput from "./StreamAudienceFilterInput.jsx";
import StreamScopeFields from "./StreamScopeFields.jsx";
import TimezoneSelect from "./TimezoneSelect.jsx";
import {
  addAudienceValues,
  AUDIENCE_FILTER_FIELDS,
  hasAudienceFilters,
  parseAudienceInputForField,
  removeAudienceValue,
  splitAudienceValues,
} from "../lib/streamAudienceFilters.js";
import { normalizeStreamStart, profileSelectOptions } from "../lib/streamRequestFilters.js";

const inputClass = "input-field";

export default function StreamFilter({
  filters,
  profiles = [],
  profileItems = [],
  eventTypeOptions = [],
  onChange,
  onStart,
  onStop,
  onClear,
  isLive,
  showProfile = true,
  showToken = false,
  disableStart = false,
  liveOnly = false,
  beforeEventSelection = null,
  showStopClear = true,
}) {
  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    onChange({ ...filters, [key]: value });
  };

  const attributeKeys = splitAudienceValues(filters.attribute_key);
  const audienceActive = hasAudienceFilters(filters);
  const streamStart = normalizeStreamStart(filters.start);

  const addAudienceFilter = (key, input) => {
    const values = parseAudienceInputForField(key, input);
    if (!values.length) return;
    onChange({ ...filters, [key]: addAudienceValues(filters[key], values) });
  };

  const removeAudienceFilter = (key, value) => {
    onChange({ ...filters, [key]: removeAudienceValue(filters[key], value) });
  };

  const profileOptions = profileSelectOptions({ profileItems, profiles });

  const hasSelectableProfiles = profileOptions.some((item) => !item.disabled);

  return (
    <form
      className="card sticky top-0 z-10 grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      {showToken && (
        <label className="block text-xs text-airship-muted md:col-span-2 lg:col-span-4">
          RTDS bearer token
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            required
            value={filters.token ?? ""}
            onChange={set("token")}
            placeholder="Bearer ..."
          />
        </label>
      )}

      {showToken && (
        <label className="block text-xs text-airship-muted">
          Server
          <select className={inputClass} value={filters.region ?? "eu"} onChange={set("region")}>
            <option value="eu">EU</option>
            <option value="us">US</option>
          </select>
        </label>
      )}

      {showProfile && (
        <label className={`block text-xs text-airship-muted${liveOnly ? " md:col-span-2 lg:col-span-3" : ""}`}>
          Project
          <select
            className={inputClass}
            value={filters.profile}
            onChange={set("profile")}
            disabled={!hasSelectableProfiles}
          >
            {!hasSelectableProfiles ? (
              <option value="">No usable projects</option>
            ) : (
              profileOptions.map((item) => (
                <option key={item.name} value={item.name} disabled={item.disabled}>
                  {item.hint ? `${item.name} (${item.hint})` : item.name}
                </option>
              ))
            )}
          </select>
        </label>
      )}

      {!liveOnly && (
        <label className="block text-xs text-airship-muted">
          Start
          <select className={inputClass} value={streamStart} onChange={set("start")}>
            <option value="LATEST">LATEST</option>
            <option value="EARLIEST">EARLIEST</option>
          </select>
        </label>
      )}

      <label className={`block text-xs text-airship-muted${liveOnly ? " md:col-span-1 lg:col-span-2" : ""}`}>
        Timezone
        <TimezoneSelect value={filters.timezone} onChange={(tz) => onChange({ ...filters, timezone: tz })} />
      </label>

      {!liveOnly && (
        <div className="md:col-span-3 lg:col-span-6 space-y-3 rounded-lg border border-airship-border bg-airship-off-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-airship-navy">Audience filters</span>
            <span className="text-[11px] text-airship-muted">
              {audienceActive ? "OR between added values" : "Optional — add one or more values per field"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {AUDIENCE_FILTER_FIELDS.map(({ key, label, placeholder }) => (
              <StreamAudienceFilterInput
                key={key}
                label={label}
                placeholder={placeholder}
                values={splitAudienceValues(filters[key])}
                onAdd={(value) => addAudienceFilter(key, value)}
                onRemove={(value) => removeAudienceFilter(key, value)}
                hint={
                  key === "attribute_key" && attributeKeys.length > 0 ? (
                    <span className="mt-1 block text-[11px] leading-snug text-airship-muted">
                      Each attribute key adds an{" "}
                      <span className="font-mono">ATTRIBUTE_OPERATION</span> branch (OR with other audience filters).
                    </span>
                  ) : null
                }
              />
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-airship-muted">
            Named user, channel, push ID, campaign category, and attribute key values are combined with{" "}
            <strong>OR</strong> in the RTDS request. Device types and event types below use <strong>AND</strong> on each
            branch.
          </p>
        </div>
      )}

      {liveOnly && (
        <div className="md:col-span-3 lg:col-span-6 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-airship-navy">Audience filter</span>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              Strongly recommended for Production projects
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {AUDIENCE_FILTER_FIELDS.filter(({ key }) => key === "named_user" || key === "channel").map(
              ({ key, label, placeholder }) => (
                <StreamAudienceFilterInput
                  key={key}
                  label={label}
                  placeholder={placeholder}
                  values={splitAudienceValues(filters[key])}
                  onAdd={(value) => addAudienceFilter(key, value)}
                  onRemove={(value) => removeAudienceFilter(key, value)}
                />
              ),
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-amber-700">
            Without an audience filter, all events from all users stream at full volume — use a named user or
            channel ID to focus on specific test traffic.
          </p>
        </div>
      )}

      {!liveOnly && (
        <label className="block text-xs text-airship-muted">
          Latency ms
          <input className={inputClass} type="number" value={filters.latency} onChange={set("latency")} placeholder="86400000" />
        </label>
      )}

      <label className={`block text-xs text-airship-muted${liveOnly ? " lg:col-span-1" : ""}`}>
        Max events shown
        <input
          className={inputClass}
          type="number"
          min={1}
          name="limit"
          value={filters.limit}
          onChange={set("limit")}
          disabled={filters.no_limit}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-airship-muted">
          <input type="checkbox" checked={filters.no_limit} onChange={set("no_limit")} />
          No limit
        </label>
      </label>

      {!liveOnly && (
        <StreamScopeFields
          filters={filters}
          onChange={onChange}
          eventTypeOptions={eventTypeOptions}
          beforeEventSelection={beforeEventSelection}
        />
      )}

      {liveOnly && (
        <StreamAdvancedOptions
          filters={filters}
          onChange={onChange}
          eventTypeOptions={eventTypeOptions}
        />
      )}

      <div className="flex items-end gap-2 md:col-span-3 lg:col-span-6">
        <button
          type="submit"
          className={showStopClear ? "btn-primary w-full" : "btn-primary w-full md:max-w-xs"}
          disabled={isLive || disableStart}
        >
          Start Stream
        </button>
        {showStopClear && (
          <>
            <button
              type="button"
              className="btn-secondary w-full border-red-200 text-airship-danger hover:border-red-300 hover:bg-red-50"
              onClick={onStop}
            >
              Stop
            </button>
            <button type="button" className="btn-secondary w-full" onClick={onClear}>
              Clear
            </button>
          </>
        )}
      </div>

    </form>
  );
}
