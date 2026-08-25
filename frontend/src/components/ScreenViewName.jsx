import { eventScreenViewName } from "../lib/eventRegistry.js";

function StreamBadge({ name, title }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 ring-1 ring-amber-200/90"
      title={title ?? name}
    >
      <span className="uppercase tracking-wide text-amber-800/90">screen</span>
      <span className="min-w-0 break-all font-mono font-semibold normal-case tracking-normal">{name}</span>
    </span>
  );
}

/** Compact badge for stream list rows (SCREEN_VIEWED). */
export function ScreenViewNameBadge({ event }) {
  const detail = eventScreenViewName(event);
  if (!detail || detail.name === "(unnamed)") return null;
  return (
    <span className="flex min-w-0 pl-1">
      <StreamBadge
        name={detail.name}
        title={detail.field ? `${detail.field}: ${detail.name}` : detail.name}
      />
    </span>
  );
}

/** Highlighted block for event detail drawer. */
export function ScreenViewNamePanel({ event }) {
  const detail = eventScreenViewName(event);
  if (!detail) return null;

  const fieldLabel = detail.field ?? "body.viewed_screen";

  return (
    <section className="rounded-lg border-2 border-amber-300/80 bg-amber-50/90 px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-airship-navy">Screen name</p>
      <p className="mt-0.5 text-[11px] leading-snug text-airship-muted">
        RTDS <span className="font-mono text-airship-navy">{fieldLabel}</span> — screen or page
        identifier in the stream and segments.
      </p>
      <p className="mt-2 break-all font-mono text-sm font-semibold text-airship-navy">{detail.name}</p>
    </section>
  );
}
