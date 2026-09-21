import { useState } from "react";
import EventTypePicker from "./EventTypePicker.jsx";
import StreamAudienceFilterInput from "./StreamAudienceFilterInput.jsx";
import {
  allDeviceTypesCsv,
  DEVICE_TYPES,
  deviceTypeSelection,
  toggleDeviceTypeCsv,
} from "../lib/deviceTypes.js";
import {
  addAudienceValues,
  AUDIENCE_FILTER_FIELDS,
  hasAttributeKeys,
  parseAudienceInputForField,
  removeAudienceValue,
  splitAudienceValues,
} from "../lib/streamAudienceFilters.js";
import { normalizeStreamStart, streamTypesSummary } from "../lib/streamRequestFilters.js";

/**
 * The Live monitor's collapsed panel: everything a session can be narrowed by,
 * plus the two choices with consequences — replaying from EARLIEST, and keeping
 * the raw file.
 */
export default function StreamAdvancedOptions({ filters, onChange, eventTypeOptions = [] }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    selected: selectedDeviceTypes,
    all: allDeviceTypesSelected,
    some: someDeviceTypesSelected,
  } = deviceTypeSelection(filters.device_types);
  const typesSummary = streamTypesSummary(filters.types);
  const attributeKeys = splitAudienceValues(filters.attribute_key);
  const useEarliest = normalizeStreamStart(filters.start) === "EARLIEST";

  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    onChange({ ...filters, [key]: value });
  };
  const toggleDeviceType = (value) =>
    onChange({ ...filters, device_types: toggleDeviceTypeCsv(filters.device_types, value) });
  const setAllDeviceTypes = (checked) =>
    onChange({ ...filters, device_types: allDeviceTypesCsv(checked) });
  const setStreamStart = (earliest) =>
    onChange({ ...filters, start: earliest ? "EARLIEST" : "LATEST" });
  const addAudienceFilter = (key, input) => {
    const values = parseAudienceInputForField(key, input);
    if (!values.length) return;
    onChange({ ...filters, [key]: addAudienceValues(filters[key], values) });
  };
  const removeAudienceFilter = (key, value) =>
    onChange({ ...filters, [key]: removeAudienceValue(filters[key], value) });

  return (
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
              <span className="text-xs text-airship-muted">{typesSummary}</span>
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
  );
}
