import { eventOpenPushAttribution, shortPushId } from "../lib/openPushAttribution.js";

function StreamBadge({ kind, pushId }) {
  const short = shortPushId(pushId);
  const isTriggering = kind === "triggering_push";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        isTriggering ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80" : "bg-teal-50 text-teal-900 ring-1 ring-teal-200"
      }`}
      title={pushId ? `${kind} · ${pushId}` : kind}
    >
      <span>{isTriggering ? "triggering" : "last delivered"}</span>
      {short && <span className="font-mono font-normal normal-case tracking-normal">{short}</span>}
    </span>
  );
}

function DetailBlock({ title, help, pushId, categories, timeDelivered, accent }) {
  const accentClass =
    accent === "amber"
      ? "border-amber-300/80 bg-amber-50/90"
      : "border-teal-300/80 bg-teal-50/90";

  return (
    <div className={`rounded-lg border-2 px-3 py-2.5 ${accentClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-airship-navy">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-airship-body">{help}</p>
      <dl className="mt-2 flex flex-col gap-2">
        {pushId && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase text-airship-muted">push_id</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-airship-navy">{pushId}</dd>
          </div>
        )}
        {categories && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase text-airship-muted">campaign categories</dt>
            <dd className="mt-0.5 break-words text-xs text-airship-navy">{categories}</dd>
          </div>
        )}
        {timeDelivered && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase text-airship-muted">time_delivered</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-airship-navy">{timeDelivered}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Compact badges for stream list rows (OPEN + push attribution). */
export function OpenPushAttributionBadges({ event }) {
  const attribution = eventOpenPushAttribution(event);
  if (!attribution) return null;

  return (
    <span className="flex min-w-0 flex-wrap gap-1 pl-1">
      {attribution.triggering && (
        <StreamBadge kind="triggering_push" pushId={attribution.triggering.pushId} />
      )}
      {attribution.lastDelivered && (
        <StreamBadge kind="last_delivered" pushId={attribution.lastDelivered.pushId} />
      )}
    </span>
  );
}

/** Highlighted panel for event detail drawer. */
export function OpenPushAttributionPanel({ event }) {
  const attribution = eventOpenPushAttribution(event);
  if (!attribution) return null;

  return (
    <section className="flex flex-col gap-2 border-t border-airship-border/80 pt-3">
      <div>
        <p className="text-xs font-bold text-airship-navy">Push attribution</p>
        <p className="mt-0.5 text-[11px] leading-snug text-airship-muted">
          This OPEN event includes messaging context from the device session.
        </p>
      </div>
      {attribution.triggering && (
        <DetailBlock
          title="triggering_push"
          help={attribution.triggering.help}
          pushId={attribution.triggering.pushId}
          categories={attribution.triggering.categories}
          timeDelivered={attribution.triggering.timeDelivered}
          accent="amber"
        />
      )}
      {attribution.lastDelivered && (
        <DetailBlock
          title="last_delivered"
          help={attribution.lastDelivered.help}
          pushId={attribution.lastDelivered.pushId}
          categories={attribution.lastDelivered.categories}
          timeDelivered={attribution.lastDelivered.timeDelivered}
          accent="teal"
        />
      )}
    </section>
  );
}
