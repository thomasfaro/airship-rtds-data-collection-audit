/** OPEN event push attribution (`body.triggering_push`, `body.last_delivered`). */

export const OPEN_PUSH_FIELD_HELP = {
  triggering_push:
    "Push notification that directly caused the app open (attribution). Contains push_id, campaign categories, and delivery time.",
  last_delivered:
    "Most recent push delivered to the device before this event. Used for session context and last-touch messaging attribution.",
};

function pushRefSummary(obj) {
  if (obj == null || typeof obj !== "object") {
    return { pushId: null, categories: null, timeDelivered: null };
  }
  const categories = Array.isArray(obj.campaigns?.categories)
    ? obj.campaigns.categories.join(", ")
    : obj.campaigns?.categories != null
      ? String(obj.campaigns.categories)
      : null;
  return {
    pushId: obj.push_id != null ? String(obj.push_id) : null,
    categories: categories || null,
    timeDelivered: obj.time_delivered != null ? String(obj.time_delivered) : null,
  };
}

/**
 * @returns {null | {
 *   triggering: ({ pushId, categories, timeDelivered, help: string } | null),
 *   lastDelivered: ({ pushId, categories, timeDelivered, help: string } | null),
 * }}
 */
export function eventOpenPushAttribution(event) {
  if (String(event?.type ?? "").toUpperCase() !== "OPEN") return null;

  const body = event?.body ?? {};
  const triggeringRaw = body.triggering_push;
  const lastDeliveredRaw = body.last_delivered;
  if (triggeringRaw == null && lastDeliveredRaw == null) return null;

  return {
    triggering:
      triggeringRaw != null
        ? { ...pushRefSummary(triggeringRaw), help: OPEN_PUSH_FIELD_HELP.triggering_push }
        : null,
    lastDelivered:
      lastDeliveredRaw != null
        ? { ...pushRefSummary(lastDeliveredRaw), help: OPEN_PUSH_FIELD_HELP.last_delivered }
        : null,
  };
}

export function shortPushId(pushId) {
  if (!pushId) return null;
  const text = String(pushId);
  if (text.length <= 14) return text;
  return `…${text.slice(-12)}`;
}
