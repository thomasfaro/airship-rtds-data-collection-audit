/** CUSTOM event names excluded from the audit custom-events section (handled elsewhere or noise). */

const MESSAGING_INTERACTION_PREFIXES = ["ua_button_tap", "button_click"];

/** In-app / message interaction taps — not client product custom events. */
export function isMessagingInteractionCustomEvent(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return MESSAGING_INTERACTION_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}_`) || normalized.startsWith(prefix),
  );
}
