import { useState } from "react";
import { formatEventDeviceTypeLabel } from "../lib/deviceTypes.js";
import {
  derivedEventSourceDescription,
  effectiveEventType,
  eventHighlightsNarrative,
  eventIdentityFields,
  eventMeta,
  eventTypeDescription,
  formatTime,
} from "../lib/eventRegistry.js";
import { AttributeOperationPanel } from "./AttributeOperationSummary.jsx";
import { CustomEventNamePanel } from "./CustomEventName.jsx";
import { CustomEventPropertiesPanel } from "./CustomEventProperties.jsx";
import { ScreenViewNamePanel } from "./ScreenViewName.jsx";
import { TagChangePanel } from "./TagChangeSummary.jsx";
import { OpenPushAttributionPanel } from "./OpenPushAttribution.jsx";
import JsonTree from "./JsonTree.jsx";

function DetailRow({ label, value, mono = false }) {
  const text = value == null || value === "" ? "n/a" : String(value);
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-airship-body">{label}</p>
      <p className={`mt-0.5 text-xs leading-snug text-airship-muted ${mono ? "break-all font-mono" : ""}`}>{text}</p>
    </div>
  );
}

function FieldChip({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-lg border border-airship-border-strong bg-airship-blue-light/30 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-airship-muted">{label}</p>
      <p className={`mt-0.5 text-xs text-airship-navy ${mono ? "break-all font-mono" : "break-words"}`}>{String(value)}</p>
    </div>
  );
}

export default function EventCard({ event, timezone, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const type = effectiveEventType(event);
  const rtdsType = event.type;
  const meta = eventMeta(event);
  const { group, channelId, deviceType, namedUser } = eventIdentityFields(event);
  const deviceTypeLabel = formatEventDeviceTypeLabel(deviceType);
  const derivedSource = type !== rtdsType ? derivedEventSourceDescription(type) : null;
  const typeDescription = eventTypeDescription(event);
  const highlightsNarrative = eventHighlightsNarrative(event);

  return (
    <article className="overflow-hidden rounded-xl border border-l-4 bg-airship-surface" style={{ borderLeftColor: meta.color }}>
      <div className="flex flex-col gap-3 border-b border-airship-border bg-airship-off-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <span
              className="inline-block max-w-full rounded-full px-2.5 py-1 text-xs font-extrabold leading-snug text-white"
              style={{ background: meta.color }}
              title={type}
            >
              {meta.label}
            </span>
            <p className="break-all font-mono text-[10px] text-airship-muted">{type}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-airship-border-strong px-3 py-1 text-xs"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>

        {derivedSource && (
          <p className="text-[10px] leading-snug text-airship-muted">
            RTDS <span className="font-mono text-airship-navy">{derivedSource.rtdsType}</span>
            {derivedSource.deviceType && (
              <>
                {" "}
                · {derivedSource.deviceType} · <span className="font-mono">{derivedSource.field}={derivedSource.value}</span>
              </>
            )}
          </p>
        )}

        <CustomEventNamePanel event={event} />
        <CustomEventPropertiesPanel event={event} />
        <ScreenViewNamePanel event={event} />
        <TagChangePanel event={event} />
        <AttributeOperationPanel event={event} />

        <div className="flex flex-col gap-2.5 border-t border-airship-border/80 pt-3">
          <DetailRow label="occurred" value={formatTime(event.occurred, timezone)} mono />
          <DetailRow label="processed" value={formatTime(event.processed, timezone)} mono />
          <DetailRow label="id" value={event.id} mono />
        </div>

        <div className="flex flex-col gap-1.5 border-t border-airship-border/80 pt-3">
          <FieldChip label="group" value={group} />
          <FieldChip label="device" value={deviceTypeLabel} />
          <FieldChip label="channel" value={channelId} mono />
          <FieldChip label="named_user" value={namedUser} mono />
        </div>

        <OpenPushAttributionPanel event={event} />
      </div>

      <div className="space-y-2 border-b border-airship-border bg-airship-surface px-3 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-airship-muted">Description</p>
          <p className="mt-1 text-sm leading-relaxed text-airship-body">{typeDescription}</p>
        </div>
        {highlightsNarrative && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-airship-muted">Summary</p>
            <p className="mt-1 text-sm leading-relaxed text-airship-navy">{highlightsNarrative}</p>
          </div>
        )}
      </div>

      {expanded && (
        <div className="overflow-x-auto p-3">
          <JsonTree value={event} label="event" root />
        </div>
      )}
    </article>
  );
}
