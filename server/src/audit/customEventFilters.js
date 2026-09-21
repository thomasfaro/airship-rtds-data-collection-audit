/** CUSTOM events that are not the client's own instrumentation, and so not part of the plan. */

const MESSAGING_INTERACTION_PREFIXES = ["ua_button_tap", "button_click"];

/** In-app / message interaction taps — not client product custom events. */
export function isMessagingInteractionCustomEvent(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return MESSAGING_INTERACTION_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}_`) || normalized.startsWith(prefix),
  );
}

/**
 * Airship's own email send feedback, which arrives as CUSTOM events on the EMAIL
 * channel. Nobody instrumented these, so counting them as product custom events
 * would put a dozen rows nobody asked for at the top of the plan.
 */
const EMAIL_FEEDBACK_CUSTOM_NAMES = new Set([
  "injection",
  "delivery",
  "click",
  "delay",
  "open",
  "initial_open",
  "unsubscribe",
  "bounce",
  "spam_complaint",
  "opt_in",
]);

export function isEmailFeedbackCustomEvent(event) {
  if (String(event?.type ?? "").toUpperCase() !== "CUSTOM") return false;
  if (String(event?.device?.device_type ?? "").toUpperCase() !== "EMAIL") return false;
  return EMAIL_FEEDBACK_CUSTOM_NAMES.has(String(event?.body?.name ?? "").trim().toLowerCase());
}
