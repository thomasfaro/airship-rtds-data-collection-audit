/**
 * Reading an RTDS event: where each field lives, which type an event effectively
 * is once CUSTOM / COMPLIANCE payloads are resolved, and what to label it.
 *
 * The rules; the data they read is in eventCatalog.js.
 */

import {
  DERIVED_DISPLAY_EVENT_TYPES,
  customEmailRegistry,
  customSmsRegistry,
  emailComplianceRegistry,
  eventRegistry,
  isDerivedDisplayEventType,
  marketerHelpForType,
  metadataForType,
  smsComplianceRegistry,
} from "./eventCatalog.js";

export { metadataForType };

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function eventNamedUser(event) {
  return event.user?.named_user_id || event.device?.named_user_id || "";
}

export function eventChannel(event) {
  return event.device?.channel || event.device?.ios_channel || event.device?.android_channel || "";
}

export function eventDeviceType(event) {
  return event.device?.device_type || "";
}

/** `body.name` for RTDS CUSTOM events (in-app, email feedback, SMS delivery_report, etc.). */
export function eventCustomEventName(event) {
  if (String(event?.type ?? "").toUpperCase() !== "CUSTOM") return "";
  const name = event?.body?.name;
  if (name == null || name === "") return "";
  return String(name);
}

/** Sorted [key, value] pairs from body.properties for a given RTDS event type. */
function eventTypedPropertyEntries(event, type) {
  if (String(event?.type ?? "").toUpperCase() !== type) return null;
  const props = event?.body?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return null;
  const entries = Object.entries(props).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (!entries.length) return null;
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

/** Sorted [key, value] pairs from body.properties on CUSTOM events. */
export function eventCustomPropertyEntries(event) {
  return eventTypedPropertyEntries(event, "CUSTOM");
}

/** Sorted [key, value] pairs from body.properties on SUBSCRIPTION events. */
export function eventSubscriptionPropertyEntries(event) {
  return eventTypedPropertyEntries(event, "SUBSCRIPTION");
}

/** Sorted [key, value] pairs from body.properties on COMPLIANCE events (includes body.event_type). */
export function eventCompliancePropertyEntries(event) {
  if (String(event?.type ?? "").toUpperCase() !== "COMPLIANCE") return null;
  const entries = [];
  const eventType = event?.body?.event_type;
  if (eventType !== undefined && eventType !== null && eventType !== "") {
    entries.push(["event_type", eventType]);
  }
  for (const entry of eventTypedPropertyEntries(event, "COMPLIANCE") ?? []) {
    if (entry[0] === "event_type") continue;
    entries.push(entry);
  }
  return entries.length ? entries : null;
}

/** Top-level body.value on CUSTOM events (outside properties). */
export function eventCustomBodyValue(event) {
  if (String(event?.type ?? "").toUpperCase() !== "CUSTOM") return undefined;
  const value = event?.body?.value;
  if (value === undefined || value === null || value === "") return undefined;
  return value;
}

export function formatCustomPropertyValue(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isComplexCustomPropertyValue(value) {
  return value !== null && typeof value === "object";
}

function screenFieldToString(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    const s = String(raw).trim();
    return s || null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const nested =
      raw.name ?? raw.screen_name ?? raw.screenName ?? raw.id ?? raw.screen_id ?? raw.title;
    if (nested !== null && nested !== undefined && nested !== "") {
      const s = String(nested).trim();
      return s || null;
    }
  }
  return null;
}

const SCREEN_NAME_FIELDS = [
  ["viewed_screen", (body) => body?.viewed_screen],
  ["screen", (body) => body?.screen],
  ["screen_name", (body) => body?.screen_name],
  ["screenName", (body) => body?.screenName],
  ["name", (body) => body?.name],
];

/** RTDS SCREEN_VIEWED: primary field is body.viewed_screen (see Airship RTDS docs). */
export function extractScreenViewName(body) {
  if (!body || typeof body !== "object") {
    return { name: "(unnamed)", field: null };
  }
  for (const [field, getter] of SCREEN_NAME_FIELDS) {
    const name = screenFieldToString(getter(body));
    if (name) return { name, field: `body.${field}` };
  }
  return { name: "(unnamed)", field: null };
}

export function eventScreenViewName(event) {
  if (String(event?.type ?? "").toUpperCase() !== "SCREEN_VIEWED") return null;
  return extractScreenViewName(event.body);
}

/** Group, channel id, device type, and named user for compact event cards (no duplicate type/label). */
export function eventIdentityFields(event) {
  const meta = eventMeta(event);
  return {
    group: meta.group,
    channelId: eventChannel(event),
    deviceType: eventDeviceType(event),
    namedUser: eventNamedUser(event),
  };
}

const NARRATIVE_SKIP_KEYS = new Set(["group", "label", "rtds_type", "named_user", "channel"]);

/** Marketer-facing description for the effective event type. */
export function eventTypeDescription(event) {
  return marketerHelpForType(effectiveEventType(event));
}

/** Extra payload fields for a short written summary (excludes identity chips). */
export function eventHighlightFacts(event) {
  return summaryPairs(event).filter(([key]) => !NARRATIVE_SKIP_KEYS.has(key));
}

/** Short prose summary of who/what this event concerns. */
export function eventHighlightsNarrative(event) {
  const { channelId, namedUser } = eventIdentityFields(event);
  const platform = event.device?.device_type;
  const facts = eventHighlightFacts(event);

  const sentences = [];

  const audience = [];
  if (namedUser) audience.push(`named user "${namedUser}"`);
  if (channelId) audience.push(`channel ${channelId}`);
  if (platform) audience.push(`platform ${platform}`);
  if (audience.length) {
    sentences.push(`This event concerns ${audience.join(", ")}.`);
  }

  if (!facts.length) {
    return sentences.join(" ") || null;
  }

  const detail = facts
    .slice(0, 8)
    .map(([key, value]) => {
      const label = key.replace(/_/g, " ");
      const text = String(value);
      const short = text.length > 96 ? `${text.slice(0, 93)}…` : text;
      return `${label} : ${short}`;
    })
    .join(" · ");

  sentences.push(`Notable fields: ${detail}.`);
  return sentences.join(" ");
}

function isCustomEmailEvent(event) {
  return event.type === "CUSTOM" && event.device?.device_type === "EMAIL" && customEmailRegistry[event.body?.name];
}

function isEmailComplianceEvent(event) {
  return event.type === "COMPLIANCE" && event.device?.device_type === "EMAIL" && emailComplianceRegistry[event.body?.event_type];
}

function isEmailComplianceUnsubscribe(event) {
  return isEmailComplianceEvent(event) && event.body?.properties?.registration_type === "unsubscribe";
}

function isCustomSmsEvent(event) {
  return (
    event.type === "CUSTOM" &&
    event.device?.device_type === "SMS" &&
    event.body?.interaction_type === "delivery_report" &&
    customSmsRegistry[event.body?.name]
  );
}

function isSmsComplianceEvent(event) {
  return event.type === "COMPLIANCE" && event.device?.device_type === "SMS" && smsComplianceRegistry[event.body?.event_type];
}

function isSmsRegistrationUpdate(event) {
  return (
    isSmsComplianceEvent(event) &&
    event.body?.event_type === "registration" &&
    event.body?.properties?.registration_type === "update"
  );
}

export function effectiveEventType(event) {
  if (isCustomEmailEvent(event)) return customEmailRegistry[event.body.name].type;
  if (isEmailComplianceUnsubscribe(event)) return "EMAIL_COMPLIANCE_UNSUBSCRIBE";
  if (isEmailComplianceEvent(event)) return emailComplianceRegistry[event.body.event_type].type;
  if (isCustomSmsEvent(event)) return customSmsRegistry[event.body.name].type;
  if (isSmsRegistrationUpdate(event)) return "SMS_REGISTRATION_UPDATE";
  if (isSmsComplianceEvent(event)) return smsComplianceRegistry[event.body.event_type].type;
  return event.type || "UNKNOWN";
}

export function eventMeta(eventOrType) {
  if (typeof eventOrType === "object") {
    if (isCustomEmailEvent(eventOrType)) {
      const metadata = customEmailRegistry[eventOrType.body.name];
      return { group: "Email", label: metadata.label, color: metadata.color };
    }
    if (isEmailComplianceUnsubscribe(eventOrType)) {
      return { group: "Email", label: "Email Compliance Unsubscribe", color: "#f43f5e" };
    }
    if (isEmailComplianceEvent(eventOrType)) {
      const metadata = emailComplianceRegistry[eventOrType.body.event_type];
      return { group: "Email", label: metadata.label, color: metadata.color };
    }
    if (isCustomSmsEvent(eventOrType)) {
      const metadata = customSmsRegistry[eventOrType.body.name];
      return { group: "SMS", label: metadata.label, color: metadata.color };
    }
    if (isSmsRegistrationUpdate(eventOrType)) {
      return { group: "SMS", label: "SMS Registration Update", color: "#14b8a6" };
    }
    if (isSmsComplianceEvent(eventOrType)) {
      const metadata = smsComplianceRegistry[eventOrType.body.event_type];
      return { group: "SMS", label: metadata.label, color: metadata.color };
    }
    return eventMeta(eventOrType.type);
  }
  return metadataForType(eventOrType);
}

/** True when the type can be used in RTDS Connect `filters[].types`. */
export function isRtdsConnectEventType(type) {
  return Object.prototype.hasOwnProperty.call(eventRegistry, String(type || "").toUpperCase());
}

/** Keep only types accepted by the RTDS Connect API (comma-separated). */
export function filterStreamTypesCsv(csv) {
  const valid = String(csv ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(isRtdsConnectEventType);
  return valid.join(",");
}

/** Event types for stream subscription UI (excludes derived email/SMS types from CUSTOM payloads). */
export function streamRtdsEventTypeOptions() {
  return Object.keys(eventRegistry)
    .sort()
    .map((type) => {
      const metadata = metadataForType(type);
      return { type, label: `${metadata.label} (${metadata.group})` };
    });
}

/** All display labels (RTDS types + derived CUSTOM/COMPLIANCE aliases). For client-side display filtering only. */
export function allEventTypeOptions() {
  const types = [...Object.keys(eventRegistry), ...DERIVED_DISPLAY_EVENT_TYPES].sort();
  return types.map((type) => {
    const metadata = metadataForType(type);
    const suffix = isDerivedDisplayEventType(type) ? " · derived" : "";
    return { type, label: `${metadata.label} (${metadata.group})${suffix}` };
  });
}

export function summaryPairs(event) {
  const candidates = [
    ["group", eventMeta(event).group],
    ["label", eventMeta(event).label],
    ["rtds_type", event.type],
    ["platform", event.device?.device_type],
    ["named_user", eventNamedUser(event)],
    ["channel", eventChannel(event)],
    ["email", getPath(event, "body.properties.email") || getPath(event, "body.identifiers.address") || event.device?.delivery_address],
    ["msisdn", getPath(event, "body.identifiers.msisdn") || event.device?.delivery_address],
    ["sender", getPath(event, "body.properties.sender")],
    ["sms_sender", getPath(event, "body.identifiers.sender") || event.device?.identifiers?.sender],
    ["subject", getPath(event, "body.properties.subject")],
    ["push_id", getPath(event, "body.push_id")],
    ["clicked_push", getPath(event, "body.triggering_push.push_id")],
    ["attributed_session", getPath(event, "body.last_delivered.push_id")],
    [
      "campaign_categories",
      Array.isArray(getPath(event, "body.campaigns.categories"))
        ? getPath(event, "body.campaigns.categories").join(", ")
        : undefined,
    ],
    ["group_id", getPath(event, "body.group_id")],
    ["interaction", getPath(event, "body.interaction_type")],
    ["body_type", getPath(event, "body.type")],
    ["reason", getPath(event, "body.reason")],
    ["status", getPath(event, "body.status")],
    ["event_type", getPath(event, "body.event_type")],
    ["name", getPath(event, "body.name")],
    ["registration_type", getPath(event, "body.properties.registration_type")],
    ["message_type", getPath(event, "body.properties.message_type")],
    ["registered", getPath(event, "body.properties.channel_registered")],
    ["commercial_opt_in", getPath(event, "body.properties.commercial_opted_in")],
    ["transactional_opt_in", getPath(event, "body.properties.transactional_opted_in")],
    ["suppression", getPath(event, "body.properties.suppression_state")],
    ["source", getPath(event, "body.properties.source") || getPath(event, "body.source")],
    ["user", getPath(event, "body.properties.user")],
    ["keyword", getPath(event, "body.properties.keyword") || getPath(event, "body.properties.matched_keyword")],
    ["opt_in", getPath(event, "body.properties.opted_in")],
    ["opt_out", getPath(event, "body.properties.opted_out")],
    ["vendor", getPath(event, "body.properties.vendor")],
    ["vendor_id", getPath(event, "body.properties.vendorDeliveryId")],
    ["error_code", getPath(event, "body.properties.error_code")],
    ["result_code", getPath(event, "body.properties.result_code")],
    ["result_status", getPath(event, "body.properties.result_status")],
    ["sent_as", getPath(event, "body.properties.sent_as")],
    ["carrier", getPath(event, "body.properties.carrier_id")],
    ["handset", getPath(event, "body.properties.handset")],
    ["tracking_id", getPath(event, "body.properties.tracking_Id")],
    ["rcs", getPath(event, "body.properties.is_rcs")],
    ["parts", getPath(event, "body.properties.number_of_message_parts")],
    ["country", getPath(event, "body.properties.recipient_country_code")],
    ["bounce_class", getPath(event, "body.properties.bounce_class")],
    ["bounce_type", getPath(event, "body.properties.bounce_event_type")],
    ["unsubscribe_type", getPath(event, "body.properties.unsubscribe_event_type")],
    ["link_name", getPath(event, "body.properties.link_name")],
    ["link_url", getPath(event, "body.properties.link_url")],
    ["prefetched", getPath(event, "body.properties.is_prefetched")],
    ["mobile", getPath(event, "body.properties.is_mobile")],
    ["os", getPath(event, "body.properties.os_family")],
    ["agent", getPath(event, "body.properties.agent_family")],
    ["value", getPath(event, "body.value")],
    ["screen", getPath(event, "body.screen") || getPath(event, "body.screen_name")],
    ["region", getPath(event, "body.region_id") || getPath(event, "body.region_name")],
    ["resource", getPath(event, "body.resource")],
    ["trimmed", getPath(event, "body.trimmed")],
  ];
  return candidates.filter(([, value]) => value !== undefined && value !== null && value !== "");
}

export function formatTime(value, timezone = "Europe/Paris") {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hour12: false,
      timeZoneName: "short",
    }).format(date);
    return `UTC ${value} | ${local}`;
  } catch {
    return `UTC ${value}`;
  }
}
