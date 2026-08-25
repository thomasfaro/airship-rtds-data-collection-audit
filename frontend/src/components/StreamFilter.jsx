import { useState } from "react";
import EventTypePicker from "./EventTypePicker.jsx";
import StreamAudienceFilterInput from "./StreamAudienceFilterInput.jsx";
import TimezoneSelect from "./TimezoneSelect.jsx";
import { DEVICE_TYPES, deviceTypesToCsv, parseDeviceTypesCsv } from "../lib/deviceTypes.js";
import {
  addAudienceValue,
  AUDIENCE_FILTER_FIELDS,
  hasAttributeKeys,
  hasAudienceFilters,
  removeAudienceValue,
  splitAudienceValues,
} from "../lib/streamAudienceFilters.js";

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

  const selectedDeviceTypes = new Set(parseDeviceTypesCsv(filters.device_types));

  const toggleDeviceType = (value) => {
    const next = new Set(selectedDeviceTypes);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...filters, device_types: deviceTypesToCsv(Array.from(next)) });
  };

  const setAllDeviceTypes = (checked) => {
    onChange({
      ...filters,
      device_types: checked ? deviceTypesToCsv(DEVICE_TYPES.map((item) => item.value)) : "",
    });
  };

  const allDeviceTypesSelected = selectedDeviceTypes.size === DEVICE_TYPES.length;
  const someDeviceTypesSelected = selectedDeviceTypes.size > 0 && !allDeviceTypesSelected;

  const [showAdvanced, setShowAdvanced] = useState(false);

  const attributeKeys = splitAudienceValues(filters.attribute_key);
  const audienceActive = hasAudienceFilters(filters);
  const streamStart = String(filters.start ?? "LATEST").toUpperCase() === "EARLIEST" ? "EARLIEST" : "LATEST";
  const useEarliest = streamStart === "EARLIEST";

  const setStreamStart = (earliest) => {
    onChange({ ...filters, start: earliest ? "EARLIEST" : "LATEST" });
  };

  const selectedStreamTypesCount = String(filters.types ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean).length;
  const streamTypesSummary = selectedStreamTypesCount === 0 ? "all types (default)" : `${selectedStreamTypesCount} selected`;

  const addAudienceFilter = (key, value) => {
    onChange({ ...filters, [key]: addAudienceValue(filters[key], value) });
  };

  const removeAudienceFilter = (key, value) => {
    onChange({ ...filters, [key]: removeAudienceValue(filters[key], value) });
  };

  const profileOptions =
    profileItems.length > 0
      ? profileItems.map((item) => ({
          name: item.name,
          disabled: !item.has_token || item.decrypt_failed,
          hint: item.decrypt_failed ? "token unreadable" : !item.has_token ? "missing token" : "",
        }))
      : profiles.map((name) => ({ name, disabled: false, hint: "" }));

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
        <>
          <details className="rounded-lg border border-airship-border bg-airship-off-white p-3 text-xs text-airship-body md:col-span-3 lg:col-span-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <span className="text-xs text-airship-muted">Device types (optional filter)</span>
              <span className="text-xs text-airship-muted">
                {selectedDeviceTypes.size ? `${selectedDeviceTypes.size} selected` : "all devices"}
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-airship-navy">
                <input
                  type="checkbox"
                  checked={allDeviceTypesSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someDeviceTypesSelected;
                  }}
                  onChange={(e) => setAllDeviceTypes(e.target.checked)}
                />
                <span>Select all device types</span>
              </label>
              {DEVICE_TYPES.map(({ value, label, description }) => (
                <label
                  key={value}
                  className="flex items-start gap-2 rounded-lg border border-airship-border bg-airship-surface-muted p-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedDeviceTypes.has(value)}
                    onChange={() => toggleDeviceType(value)}
                  />
                  <span className="leading-snug">
                    <div>
                      <span className="font-mono text-[11px] text-airship-navy">{value}</span>
                      <span className="ml-2 text-airship-body">{label}</span>
                    </div>
                    <div className="mt-1 text-xs text-airship-muted">{description}</div>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-airship-muted">
              Leave empty to stream events from every device type. When set, only events for the selected platforms are
              requested from RTDS (<span className="font-mono">device_types</span>).
            </p>
          </details>

          {beforeEventSelection && (
            <div className="md:col-span-3 lg:col-span-6">{beforeEventSelection}</div>
          )}

          <details
            className="rounded-lg border border-airship-border bg-airship-off-white p-3 md:col-span-3 lg:col-span-6"
            open
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-semibold text-airship-navy">Events to stream</span>
              <span className="text-xs text-airship-muted">{streamTypesSummary}</span>
            </summary>
            <div className="mt-3">
              <EventTypePicker
                value={filters.types}
                onChange={(types) => onChange({ ...filters, types })}
                eventTypeOptions={eventTypeOptions}
                title=""
                hint={
                  <>
                    <strong>If none selected, all event types are streamed</strong> (default). Combined with device types
                    using AND on each audience branch. RTDS filter types only — email feedback uses CUSTOM on EMAIL channels
                    (<span className="font-mono">body.name</span>).
                    {hasAttributeKeys(filters) ? (
                      <>
                        {" "}
                        Attribute key branches always use <span className="font-mono">ATTRIBUTE_OPERATION</span>.
                      </>
                    ) : null}
                  </>
                }
              />
            </div>
          </details>
        </>
      )}

      {liveOnly && (
        <div className="md:col-span-3 lg:col-span-6">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-airship-blue hover:underline"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform${showAdvanced ? " rotate-90" : ""}`}
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 3l5 5-5 5V3z" />
            </svg>
            Advanced options
          </button>

          {showAdvanced && (
            <div className="mt-3 overflow-hidden rounded-xl border border-airship-border divide-y divide-airship-border">

              <details className="group">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 bg-white px-3 py-2.5 hover:bg-airship-off-white [&::-webkit-details-marker]:hidden">
                  <span className="text-xs font-semibold text-airship-navy">Event types</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-airship-muted">{streamTypesSummary}</span>
                    <svg className="h-3.5 w-3.5 text-airship-muted transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M6 3l5 5-5 5V3z" />
                    </svg>
                  </div>
                </summary>
                <div className="border-t border-airship-border bg-white px-3 pb-3 pt-2">
                  <EventTypePicker
                    value={filters.types}
                    onChange={(types) => onChange({ ...filters, types })}
                    eventTypeOptions={eventTypeOptions}
                    title=""
                    hint={
                      <>
                        <strong>If none selected, all event types are streamed</strong> (default).
                        {hasAttributeKeys(filters) ? (
                          <> Attribute key branches always use <span className="font-mono">ATTRIBUTE_OPERATION</span>.</>
                        ) : null}
                      </>
                    }
                  />
                </div>
              </details>

              <details className="group">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 bg-white px-3 py-2.5 hover:bg-airship-off-white [&::-webkit-details-marker]:hidden">
                  <span className="text-xs font-semibold text-airship-navy">Device types</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-airship-muted">
                      {selectedDeviceTypes.size ? `${selectedDeviceTypes.size} selected` : "all devices"}
                    </span>
                    <svg className="h-3.5 w-3.5 text-airship-muted transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M6 3l5 5-5 5V3z" />
                    </svg>
                  </div>
                </summary>
                <div className="border-t border-airship-border bg-white p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-airship-navy">
                    <input
                      type="checkbox"
                      checked={allDeviceTypesSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someDeviceTypesSelected;
                      }}
                      onChange={(e) => setAllDeviceTypes(e.target.checked)}
                    />
                    Select all
                  </label>
                  {DEVICE_TYPES.map(({ value, label, description }) => (
                    <label key={value} className="flex items-start gap-2 rounded border border-airship-border bg-airship-surface-muted p-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={selectedDeviceTypes.has(value)}
                        onChange={() => toggleDeviceType(value)}
                      />
                      <span className="leading-snug">
                        <span className="font-mono text-[11px] text-airship-navy">{value}</span>
                        <span className="ml-2 text-xs text-airship-body">{label}</span>
                        <span className="mt-0.5 block text-[11px] text-airship-muted">{description}</span>
                      </span>
                    </label>
                  ))}
                  <p className="text-[11px] text-airship-muted">Leave empty to stream all device types.</p>
                </div>
              </details>

              <div className="bg-white p-3 space-y-3">
                <p className="text-xs font-semibold text-airship-navy">Additional audience filters</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {AUDIENCE_FILTER_FIELDS.filter(({ key }) =>
                    ["push_id", "campaign_category", "attribute_key"].includes(key),
                  ).map(({ key, label, placeholder }) => (
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
                            <span className="font-mono">ATTRIBUTE_OPERATION</span> branch.
                          </span>
                        ) : null
                      }
                    />
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-airship-muted">
                  Combined with named user and channel above using <strong>OR</strong>.
                </p>
              </div>

              <div className="bg-white p-3 space-y-3">
                <p className="text-xs font-semibold text-airship-navy">Playback &amp; storage</p>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-airship-border bg-airship-surface-muted p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={useEarliest}
                    onChange={(event) => setStreamStart(event.target.checked)}
                  />
                  <span className="text-xs leading-relaxed text-airship-body">
                    <span className="font-semibold text-airship-navy">Start from EARLIEST (7 days replay)</span>
                    <span className="mt-1 block text-airship-muted">
                      By default the live monitor uses <span className="font-mono">LATEST</span> and only shows new
                      events from the moment you connect. Enable to replay RTDS history from the oldest retained
                      position (up to ~7 days).
                    </span>
                  </span>
                </label>

                {useEarliest && (
                  <div className="alert-warning space-y-2" role="alert">
                    <p className="font-semibold">Limitations — read before starting</p>
                    <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
                      <li>
                        <span className="font-mono">EARLIEST</span> replays up to <strong>7 days</strong> of history,
                        not just live traffic.
                      </li>
                      <li>
                        <strong>Do not use in production</strong> with high event volumes — the burst can slow or
                        freeze the UI.
                      </li>
                      <li>
                        Intended for <strong>QA, staging, or recette</strong> environments.
                      </li>
                    </ul>
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-airship-border bg-airship-surface-muted p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={Boolean(filters.store_raw)}
                    onChange={set("store_raw")}
                  />
                  <span className="text-xs leading-relaxed text-airship-body">
                    <span className="font-semibold text-airship-navy">Store raw data file</span>
                    <span className="mt-1 block text-airship-muted">
                      Off by default. Enable to persist the raw NDJSON to disk — only then does this session appear in
                      History.
                    </span>
                  </span>
                </label>
              </div>

            </div>
          )}
        </div>
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
