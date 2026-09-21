import EventTypePicker from "./EventTypePicker.jsx";
import {
  allDeviceTypesCsv,
  DEVICE_TYPES,
  deviceTypeSelection,
  toggleDeviceTypeCsv,
} from "../lib/deviceTypes.js";
import { hasAttributeKeys } from "../lib/streamAudienceFilters.js";
import { streamTypesSummary } from "../lib/streamRequestFilters.js";

/** What to stream: device types and event types. The capture and setup screens' view. */
export default function StreamScopeFields({
  filters,
  onChange,
  eventTypeOptions = [],
  beforeEventSelection = null,
}) {
  const {
    selected: selectedDeviceTypes,
    all: allDeviceTypesSelected,
    some: someDeviceTypesSelected,
  } = deviceTypeSelection(filters.device_types);
  const typesSummary = streamTypesSummary(filters.types);

  const toggleDeviceType = (value) =>
    onChange({ ...filters, device_types: toggleDeviceTypeCsv(filters.device_types, value) });
  const setAllDeviceTypes = (checked) =>
    onChange({ ...filters, device_types: allDeviceTypesCsv(checked) });

  return (
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
        <span className="text-xs text-airship-muted">{typesSummary}</span>
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
  );
}
