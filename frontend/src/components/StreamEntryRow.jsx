import { memo } from "react";
import { formatEventDeviceTypeLabel } from "../lib/deviceTypes.js";
import {
  effectiveEventType,
  eventIdentityFields,
  eventMeta,
} from "../lib/eventRegistry.js";
import { AttributeOperationBadges } from "./AttributeOperationSummary.jsx";
import { CustomEventNameBadge } from "./CustomEventName.jsx";
import { CustomEventPropertiesBadge } from "./CustomEventProperties.jsx";
import { CompliancePropertiesBadge, SubscriptionPropertiesBadge } from "./EventBodyProperties.jsx";
import { OpenPushAttributionBadges } from "./OpenPushAttribution.jsx";
import { ScreenViewNameBadge } from "./ScreenViewName.jsx";
import { TagChangeBadges } from "./TagChangeSummary.jsx";
import { formatOccurredShort } from "../lib/streamEntries.js";

function MiniChip({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <span
      className={`inline-flex max-w-full items-start rounded border border-airship-border bg-airship-off-white px-1 py-0.5 text-[10px] text-airship-navy ${
        mono ? "min-w-0 flex-1 break-all font-mono" : "shrink-0"
      }`}
    >
      <span className="mr-0.5 shrink-0 text-airship-muted">{label}</span>
      {String(value)}
    </span>
  );
}

function StreamEntryRow({ entry, timezone, selected, highlighted, onSelect }) {
  if (entry.kind === "message") {
    const label = entry.payload?.message || entry.payload?.kind || "message";
    return (
      <button
        type="button"
        onClick={() => onSelect(entry.id)}
        className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition ${
          selected
            ? "border-airship-blue bg-airship-blue-light/30"
            : "border-airship-border bg-airship-surface hover:bg-airship-off-white"
        } ${highlighted ? "ring-2 ring-airship-blue ring-offset-1" : ""}`}
      >
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-airship-muted bg-airship-off-white">
          msg
        </span>
        <span className="min-w-0 flex-1 truncate text-airship-body">{label}</span>
        {entry.isError && <span className="shrink-0 text-[10px] text-airship-danger">error</span>}
      </button>
    );
  }

  const event = entry.event;
  const type = effectiveEventType(event);
  const meta = eventMeta(event);
  const { group, channelId, deviceType, namedUser } = eventIdentityFields(event);
  const deviceTypeLabel = formatEventDeviceTypeLabel(deviceType);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      className={`flex w-full flex-col gap-1 rounded border border-l-4 px-2 py-1.5 text-left text-xs transition ${
        selected
          ? "border-airship-blue bg-airship-blue-light/30"
          : "border-airship-border bg-airship-surface hover:bg-airship-off-white"
      } ${highlighted ? "ring-2 ring-airship-blue ring-offset-1" : ""}`}
      style={{ borderLeftColor: meta.color }}
      title={type}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="shrink-0 max-w-[11rem] rounded px-2 py-0.5 text-[10px] font-bold leading-snug text-white"
          style={{ background: meta.color }}
        >
          <span className="line-clamp-2 break-words">{meta.label}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-airship-muted" title={event.occurred}>
          {formatOccurredShort(event.occurred, timezone)}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          <MiniChip label="group" value={group} />
          <MiniChip label="device" value={deviceTypeLabel} />
        </span>
      </span>
      <CustomEventNameBadge event={event} />
      <CustomEventPropertiesBadge event={event} />
      <ScreenViewNameBadge event={event} />
      <TagChangeBadges event={event} />
      <AttributeOperationBadges event={event} />
      <OpenPushAttributionBadges event={event} />
      <SubscriptionPropertiesBadge event={event} />
      <CompliancePropertiesBadge event={event} />
      {(channelId || namedUser) && (
        <span className="flex min-w-0 flex-wrap gap-1 pl-1">
          <MiniChip label="channel" value={channelId} mono />
          <MiniChip label="named_user" value={namedUser} mono />
        </span>
      )}
    </button>
  );
}

export default memo(StreamEntryRow);
