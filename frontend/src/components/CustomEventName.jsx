import { eventCustomEventName } from "../lib/eventRegistry.js";

function StreamBadge({ name }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 ring-1 ring-amber-200/90"
      title={`body.name: ${name}`}
    >
      <span className="uppercase tracking-wide text-amber-800/90">name</span>
      <span className="min-w-0 break-all font-mono font-semibold normal-case tracking-normal">{name}</span>
    </span>
  );
}

/** Compact badge for stream list rows (CUSTOM + body.name). */
export function CustomEventNameBadge({ event }) {
  const name = eventCustomEventName(event);
  if (!name) return null;
  return (
    <span className="flex min-w-0 pl-1">
      <StreamBadge name={name} />
    </span>
  );
}

/** Highlighted block for event detail drawer. */
export function CustomEventNamePanel({ event }) {
  const name = eventCustomEventName(event);
  if (!name) return null;

  return (
    <section className="rounded-lg border-2 border-amber-300/80 bg-amber-50/90 px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-airship-navy">Event name</p>
      <p className="mt-0.5 text-[11px] leading-snug text-airship-muted">
        RTDS <span className="font-mono text-airship-navy">body.name</span> — custom event identifier in the stream and automations.
      </p>
      <p className="mt-2 break-all font-mono text-sm font-semibold text-airship-navy">{name}</p>
    </section>
  );
}
