import {
  eventCustomBodyValue,
  eventCustomPropertyEntries,
  formatCustomPropertyValue,
  isComplexCustomPropertyValue,
} from "../lib/eventRegistry.js";
import JsonTree from "./JsonTree.jsx";

function PropertyValue({ value }) {
  if (isComplexCustomPropertyValue(value)) {
    return (
      <div className="mt-1 overflow-x-auto rounded border border-teal-200/70 bg-white/90 p-1.5">
        <JsonTree value={value} label="" defaultOpen />
      </div>
    );
  }
  return (
    <p className="mt-0.5 break-all font-mono text-xs leading-snug text-airship-navy">
      {formatCustomPropertyValue(value)}
    </p>
  );
}

function PropertyChip({ name, value }) {
  const preview = isComplexCustomPropertyValue(value)
    ? "{…}"
    : formatCustomPropertyValue(value);
  const short = preview.length > 48 ? `${preview.slice(0, 45)}…` : preview;
  return (
    <span
      className="inline-flex max-w-full items-start gap-1 rounded border border-teal-200/90 bg-teal-50/90 px-1.5 py-0.5 text-[9px] text-teal-950 ring-1 ring-teal-200/70"
      title={`${name}: ${formatCustomPropertyValue(value)}`}
    >
      <span className="shrink-0 font-semibold uppercase tracking-wide text-teal-800/90">{name}</span>
      <span className="min-w-0 break-all font-mono font-medium normal-case tracking-normal">{short}</span>
    </span>
  );
}

/** Compact property chips for stream list rows. */
export function CustomEventPropertiesBadge({ event, max = 4 }) {
  const entries = eventCustomPropertyEntries(event);
  const bodyValue = eventCustomBodyValue(event);
  if (!entries?.length && bodyValue === undefined) return null;

  const chips = [];
  if (bodyValue !== undefined) {
    chips.push(["value", bodyValue]);
  }
  for (const entry of entries ?? []) {
    if (chips.length >= max) break;
    chips.push(entry);
  }

  return (
    <span className="flex min-w-0 flex-wrap gap-1 pl-1">
      {chips.map(([key, value]) => (
        <PropertyChip key={key} name={key} value={value} />
      ))}
      {(entries?.length ?? 0) + (bodyValue !== undefined ? 1 : 0) > max ? (
        <span className="self-center text-[9px] text-airship-muted">
          +{(entries?.length ?? 0) + (bodyValue !== undefined ? 1 : 0) - max} more
        </span>
      ) : null}
    </span>
  );
}

/** Highlighted properties block in the event detail drawer. */
export function CustomEventPropertiesPanel({ event }) {
  const entries = eventCustomPropertyEntries(event);
  const bodyValue = eventCustomBodyValue(event);
  if (!entries?.length && bodyValue === undefined) return null;

  return (
    <section className="rounded-lg border-2 border-teal-300/80 bg-teal-50/90 px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-teal-950">Properties</p>
      <p className="mt-0.5 text-[11px] leading-snug text-teal-900/80">
        RTDS <span className="font-mono">body.properties</span>
        {bodyValue !== undefined ? (
          <>
            {" "}
            and <span className="font-mono">body.value</span>
          </>
        ) : null}{" "}
        — custom event payload fields.
      </p>

      <div className="mt-3 space-y-2">
        {bodyValue !== undefined ? (
          <div className="rounded-lg border border-teal-200/90 bg-white/85 px-2.5 py-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-teal-900">
              body.value
            </p>
            <PropertyValue value={bodyValue} />
          </div>
        ) : null}

        {entries?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="min-w-0 rounded-lg border border-teal-200/90 bg-white/85 px-2.5 py-2"
              >
                <p className="break-all font-mono text-[10px] font-semibold uppercase tracking-wide text-teal-900">
                  {key}
                </p>
                <PropertyValue value={value} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
