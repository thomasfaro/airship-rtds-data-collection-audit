export const eventRegistry = {
  ATTRIBUTE_OPERATION: { group: "Audience", label: "Attribute Operation", color: "#3b82f6" },
  CLOSE: { group: "App", label: "App Close", color: "#ef4444" },
  COMPLIANCE: { group: "Audience", label: "Compliance", color: "#c084fc" },
  CONTACT_CHANGE: { group: "Audience", label: "Contact Change", color: "#a78bfa" },
  CONTROL: { group: "Messaging", label: "Control Group", color: "#94a3b8" },
  CUSTOM: { group: "Audience", label: "Custom Event", color: "#f59e0b" },
  FEATURE_FLAG_INTERACTION: { group: "App", label: "Feature Flag Interaction", color: "#f97316" },
  FIRST_OPEN: { group: "App", label: "First Open", color: "#4ade80" },
  FIRST_OPT_IN: { group: "Messaging", label: "First Opt-In", color: "#2dd4bf" },
  IN_APP_BUTTON_TAP: { group: "In-App", label: "Button Tap", color: "#c084fc" },
  IN_APP_EXPERIENCES: { group: "In-App", label: "Experience Trigger", color: "#d946ef" },
  IN_APP_FORM_DISPLAY: { group: "In-App", label: "Form Display", color: "#e879f9" },
  IN_APP_FORM_RESULT: { group: "In-App", label: "Form Result", color: "#f0abfc" },
  IN_APP_MESSAGE_CONTROL: { group: "In-App", label: "Message Control", color: "#a855f7" },
  IN_APP_MESSAGE_DISPLAY: { group: "In-App", label: "Message Display", color: "#e879f9" },
  IN_APP_MESSAGE_EXCLUSION: { group: "In-App", label: "Message Exclusion", color: "#fb7185" },
  IN_APP_MESSAGE_EXPIRATION: { group: "In-App", label: "Message Expiration", color: "#f43f5e" },
  IN_APP_MESSAGE_RESOLUTION: { group: "In-App", label: "Message Resolution", color: "#fb7185" },
  IN_APP_PAGE_SWIPE: { group: "In-App", label: "Page Swipe", color: "#c084fc" },
  IN_APP_PAGE_VIEW: { group: "In-App", label: "Page View", color: "#c084fc" },
  IN_APP_PAGER_COMPLETED: { group: "In-App", label: "Pager Completed", color: "#d8b4fe" },
  IN_APP_PAGER_SUMMARY: { group: "In-App", label: "Pager Summary", color: "#d8b4fe" },
  LABEL_EVENT: { group: "Messaging", label: "Label Event", color: "#38bdf8" },
  LOCATION: { group: "Location", label: "Location", color: "#84cc16" },
  MOBILE_ORIGINATED: { group: "SMS", label: "Mobile Originated", color: "#06b6d4" },
  OPEN: { group: "App", label: "App Open", color: "#22c55e" },
  PUSH_BODY: { group: "Messaging", label: "Push Body", color: "#60a5fa" },
  REGION: { group: "Location", label: "Region", color: "#65a30d" },
  RICH_CONTROL: { group: "Message Center", label: "MC Control", color: "#818cf8" },
  RICH_DELETE: { group: "Message Center", label: "MC Delete", color: "#f87171" },
  RICH_DELIVERY: { group: "Message Center", label: "MC Delivery", color: "#38bdf8" },
  RICH_READ: { group: "Message Center", label: "MC Read", color: "#22c55e" },
  SCREEN_VIEWED: { group: "App", label: "Screen Viewed", color: "#14b8a6" },
  SEND: { group: "Messaging", label: "Send", color: "#22d3ee" },
  SEND_ABORTED: { group: "Messaging", label: "Send Aborted", color: "#fb923c" },
  SEND_REJECTED: { group: "Messaging", label: "Send Rejected", color: "#f97316" },
  SHORT_LINK_CLICK: { group: "SMS", label: "Short Link Click", color: "#06b6d4" },
  SUBSCRIPTION: { group: "Email", label: "Subscription", color: "#10b981" },
  SUBSCRIPTION_LIST: { group: "Audience", label: "Subscription List", color: "#34d399" },
  TAG_CHANGE: { group: "Audience", label: "Tag Change", color: "#60a5fa" },
  UNINSTALL: { group: "App", label: "Uninstall", color: "#dc2626" },
  WEB_CLICK: { group: "Web", label: "Web Click", color: "#38bdf8" },
  WEB_SESSION: { group: "Web", label: "Web Session", color: "#0ea5e9" },
};

const EXTRA_CATEGORIES_BY_TYPE = {
  // allow some events to show up in multiple marketer-friendly categories
  CUSTOM: ["App"],
  LABEL_EVENT: ["In-App"],
};

export function categoriesForType(type) {
  const key = String(type || "").toUpperCase();
  const primary = eventRegistry[key]?.group || metadataForType(key).group;
  const extra = EXTRA_CATEGORIES_BY_TYPE[key] ?? [];
  return Array.from(new Set([primary, ...extra])).filter(Boolean);
}

/**
 * Email feedback is not separate RTDS event types.
 * RTDS sends CUSTOM on EMAIL channels; this UI maps body.name (e.g. open, bounce) to EMAIL_* labels.
 */
export const customEmailRegistry = {
  bounce: { type: "EMAIL_BOUNCE", label: "Email Bounce", color: "#ef4444" },
  click: { type: "EMAIL_CLICK", label: "Email Click", color: "#d946ef" },
  delay: { type: "EMAIL_DELAY", label: "Email Delay", color: "#f97316" },
  delivery: { type: "EMAIL_DELIVERY", label: "Email Delivery", color: "#22c55e" },
  initial_open: { type: "EMAIL_INITIAL_OPEN", label: "Email Initial Open", color: "#14b8a6" },
  injection: { type: "EMAIL_INJECTION", label: "Email Injection", color: "#38bdf8" },
  open: { type: "EMAIL_OPEN", label: "Email Open", color: "#0ea5e9" },
  unsubscribe: { type: "EMAIL_UNSUBSCRIBE", label: "Email Unsubscribe", color: "#f43f5e" },
  spam_complaint: { type: "EMAIL_SPAM_COMPLAINT", label: "Email Spam Complaint", color: "#dc2626" },
};

export const emailComplianceRegistry = {
  bounce: { type: "EMAIL_COMPLIANCE_BOUNCE", label: "Email Compliance Bounce", color: "#ef4444" },
  create_and_send: { type: "EMAIL_COMPLIANCE_CREATE_AND_SEND", label: "Email Create and Send", color: "#38bdf8" },
  registration: { type: "EMAIL_COMPLIANCE_REGISTRATION", label: "Email Registration", color: "#10b981" },
};

export const customSmsRegistry = {
  read: { type: "RCS_READ", label: "RCS Read", color: "#22c55e" },
  dispatched: { type: "SMS_DISPATCHED", label: "SMS Dispatched", color: "#38bdf8" },
  aborted: { type: "SMS_ABORTED", label: "SMS Aborted", color: "#fb923c" },
  rejected: { type: "SMS_REJECTED", label: "SMS Rejected", color: "#f97316" },
  delivered: { type: "SMS_DELIVERED", label: "SMS Delivered", color: "#22c55e" },
  failed: { type: "SMS_FAILED", label: "SMS Failed", color: "#ef4444" },
  expired: { type: "SMS_EXPIRED", label: "SMS Expired", color: "#f59e0b" },
  unknown: { type: "SMS_UNKNOWN", label: "SMS Unknown", color: "#94a3b8" },
  undeliverable: { type: "SMS_UNDELIVERABLE", label: "SMS Undeliverable", color: "#f43f5e" },
  deleted: { type: "SMS_DELETED", label: "SMS Deleted", color: "#a1a1aa" },
};

export const smsComplianceRegistry = {
  api_initiate_opt_in: { type: "SMS_API_INITIATE_OPT_IN", label: "SMS API Initiated Opt-In", color: "#38bdf8" },
  carrier_deactivation: { type: "SMS_CARRIER_DEACTIVATION", label: "SMS Carrier Deactivation", color: "#f97316" },
  create_and_send: { type: "SMS_CREATE_AND_SEND", label: "SMS Create and Send", color: "#06b6d4" },
  custom_keyword_response: { type: "SMS_CUSTOM_KEYWORD_RESPONSE", label: "SMS Custom Keyword Response", color: "#a78bfa" },
  mobile_create_channel: { type: "SMS_MOBILE_CREATE_CHANNEL", label: "SMS Mobile Create Channel", color: "#10b981" },
  mobile_keyword_matched: { type: "SMS_MOBILE_KEYWORD_MATCHED", label: "SMS Keyword Matched", color: "#84cc16" },
  mobile_keyword_unmatched: { type: "SMS_MOBILE_KEYWORD_UNMATCHED", label: "SMS Keyword Unmatched", color: "#eab308" },
  mobile_opt_in: { type: "SMS_MOBILE_OPT_IN", label: "SMS Mobile Opt-In", color: "#22c55e" },
  mobile_opt_out: { type: "SMS_MOBILE_OPT_OUT", label: "SMS Mobile Opt-Out", color: "#f43f5e" },
  mobile_terminated_message: { type: "SMS_MOBILE_TERMINATED_MESSAGE", label: "SMS Mobile Terminated Message", color: "#38bdf8" },
  opted_out: { type: "SMS_OPTED_OUT", label: "SMS Opted Out", color: "#ef4444" },
  registration: { type: "SMS_REGISTRATION", label: "SMS Registration", color: "#10b981" },
  uninstall: { type: "SMS_UNINSTALL", label: "SMS Uninstall", color: "#dc2626" },
};

export const EVENT_GROUPS = [
  "",
  "App",
  "Messaging",
  "In-App",
  "Message Center",
  "Web",
  "Email",
  "SMS",
  "Audience",
  "Automation",
  "Location",
];

const MARKETER_HELP_BY_TYPE = {
  OPEN: "Triggered when a user opens the app. Useful to measure active users and to start journeys after app opens.",
  CLOSE: "Triggered when a user closes the app. Useful for session analysis and drop-off timing.",
  FIRST_OPEN: "Triggered the first time the app is opened after install. Useful for onboarding performance.",
  UNINSTALL: "Indicates an uninstall event. Useful to understand churn and suppress messaging to uninstalled devices.",
  SCREEN_VIEWED: "Triggered when a screen/page is viewed. Useful to measure content discovery and build screen-based segments.",
  CUSTOM:
    "RTDS CUSTOM event. In-app custom events (purchase, etc.) and email/SMS feedback on those channels (body.name such as open, bounce, delivery). Subscribe to CUSTOM in the stream filter to receive email events shown as EMAIL_* in this UI.",

  SEND: "Messaging send event (a message was attempted). Useful to verify automation execution and targeting.",
  SEND_ABORTED: "Send was aborted before delivery. Useful to diagnose automation rules and message eligibility.",
  SEND_REJECTED: "Send was rejected. Useful for troubleshooting configuration or audience eligibility issues.",
  PUSH_BODY: "Payload/body for a push send. Useful to audit content and metadata used for the message.",
  CONTROL: "Control group assignment for experiments. Useful to validate A/B test setup and exclusions.",
  FIRST_OPT_IN: "First time the device opted in to messaging. Useful to track permission acquisition.",

  IN_APP_MESSAGE_DISPLAY: "In-app message was shown to the user. Useful to measure exposure and view-through impact.",
  IN_APP_MESSAGE_RESOLUTION: "In-app message interaction outcome (clicked, dismissed, timed out). Useful to measure engagement.",
  IN_APP_MESSAGE_EXCLUSION: "In-app message was excluded (frequency caps, constraints, etc.). Useful to diagnose delivery gaps.",
  IN_APP_MESSAGE_EXPIRATION: "In-app message expired before display. Useful to validate timing windows.",
  IN_APP_BUTTON_TAP: "User tapped a button in an in-app experience. Useful for CTA performance.",
  IN_APP_PAGE_VIEW: "User viewed a page in an in-app pager/experience. Useful for step-by-step funnel analysis.",
  IN_APP_PAGE_SWIPE: "User swiped between pages in an in-app pager/experience. Useful for navigation behavior.",
  IN_APP_FORM_DISPLAY: "An in-app form was displayed. Useful to measure form reach/exposure.",
  IN_APP_FORM_RESULT: "An in-app form was submitted or closed with a result. Useful for lead capture and survey responses.",

  RICH_DELIVERY: "A Message Center item was delivered. Useful to validate inbox delivery and eligibility.",
  RICH_READ: "A Message Center item was read/opened. Useful to measure inbox engagement.",
  RICH_DELETE: "A Message Center item was deleted. Useful to track message lifecycle.",

  WEB_SESSION: "A web session event (web channel activity). Useful for web engagement tracking.",
  WEB_CLICK: "A click event on web. Useful to measure interaction and conversion intent.",

  COMPLIANCE:
    "Compliance and registration events (email opt-in/opt-out, SMS keyword flows, carrier deactivation, etc.). Subscribe to COMPLIANCE in the stream filter; channel-specific variants appear as EMAIL_COMPLIANCE_* / SMS_* derived labels in this UI.",
  SUBSCRIPTION: "Email subscription status event. Useful to track opt-in/out and subscription state changes.",
  EMAIL_DELIVERY: "Display label for CUSTOM on EMAIL when body.name is delivery — not an RTDS filter type.",
  EMAIL_OPEN: "Display label for CUSTOM on EMAIL when body.name is open — not an RTDS filter type.",
  EMAIL_CLICK: "Display label for CUSTOM on EMAIL when body.name is click — not an RTDS filter type.",
  EMAIL_BOUNCE: "Display label for CUSTOM on EMAIL when body.name is bounce — not an RTDS filter type.",
  EMAIL_UNSUBSCRIBE: "Display label for CUSTOM on EMAIL when body.name is unsubscribe — not an RTDS filter type.",
  EMAIL_SPAM_COMPLAINT:
    "Display label for CUSTOM on EMAIL when body.name is spam_complaint — not an RTDS filter type.",
  EMAIL_COMPLIANCE_REGISTRATION:
    "Display label for COMPLIANCE on EMAIL when body.event_type is registration — not an RTDS filter type.",
  EMAIL_COMPLIANCE_BOUNCE: "Display label for COMPLIANCE on EMAIL when body.event_type is bounce — not an RTDS filter type.",
  EMAIL_COMPLIANCE_CREATE_AND_SEND:
    "Display label for COMPLIANCE on EMAIL when body.event_type is create_and_send — not an RTDS filter type.",
  EMAIL_COMPLIANCE_UNSUBSCRIBE:
    "Display label for COMPLIANCE unsubscribe on EMAIL — not an RTDS filter type.",

  SMS_DELIVERED: "Display label for CUSTOM SMS delivery_report when body.name is delivered — not an RTDS filter type.",
  SMS_FAILED: "Display label for CUSTOM SMS delivery_report when body.name is failed — not an RTDS filter type.",
  SMS_UNDELIVERABLE: "Display label for CUSTOM SMS delivery_report when body.name is undeliverable — not an RTDS filter type.",
  SMS_EXPIRED: "Display label for CUSTOM SMS delivery_report when body.name is expired — not an RTDS filter type.",
  SMS_DISPATCHED: "Display label for CUSTOM SMS delivery_report when body.name is dispatched — not an RTDS filter type.",
  SMS_ABORTED: "Display label for CUSTOM SMS delivery_report when body.name is aborted — not an RTDS filter type.",
  SMS_REJECTED: "Display label for CUSTOM SMS delivery_report when body.name is rejected — not an RTDS filter type.",
  SMS_DELETED: "Display label for CUSTOM SMS delivery_report when body.name is deleted — not an RTDS filter type.",
  SMS_UNKNOWN: "Display label for CUSTOM SMS delivery_report when body.name is unknown — not an RTDS filter type.",
  RCS_READ: "Display label for CUSTOM SMS delivery_report when body.name is read — not an RTDS filter type.",
  MOBILE_ORIGINATED: "Inbound mobile-originated message. Useful for two-way SMS and keyword flows.",
  SHORT_LINK_CLICK: "Short link click tracked for SMS. Useful to measure engagement and conversions.",
  SMS_REGISTRATION: "Display label for COMPLIANCE SMS when body.event_type is registration — not an RTDS filter type.",
  SMS_REGISTRATION_UPDATE: "Display label for COMPLIANCE SMS registration update — not an RTDS filter type.",
  SMS_OPTED_OUT: "Display label for COMPLIANCE SMS when body.event_type is opted_out — not an RTDS filter type.",
  SMS_MOBILE_OPT_IN: "Display label for COMPLIANCE SMS when body.event_type is mobile_opt_in — not an RTDS filter type.",
  SMS_MOBILE_OPT_OUT: "Display label for COMPLIANCE SMS when body.event_type is mobile_opt_out — not an RTDS filter type.",
  SMS_MOBILE_KEYWORD_MATCHED:
    "Display label for COMPLIANCE SMS when body.event_type is mobile_keyword_matched — not an RTDS filter type.",
  SMS_MOBILE_KEYWORD_UNMATCHED:
    "Display label for COMPLIANCE SMS when body.event_type is mobile_keyword_unmatched — not an RTDS filter type.",
  SMS_API_INITIATE_OPT_IN:
    "Display label for COMPLIANCE SMS when body.event_type is api_initiate_opt_in — not an RTDS filter type.",
  SMS_CARRIER_DEACTIVATION:
    "Display label for COMPLIANCE SMS when body.event_type is carrier_deactivation — not an RTDS filter type.",
  SMS_CREATE_AND_SEND:
    "Display label for COMPLIANCE SMS when body.event_type is create_and_send — not an RTDS filter type.",
};

/** UI-only labels parsed from CUSTOM / COMPLIANCE payloads (not valid RTDS `types[]` filters). */
export const DERIVED_DISPLAY_EVENT_TYPES = new Set([
  ...Object.values(customEmailRegistry).map((metadata) => metadata.type),
  ...Object.values(emailComplianceRegistry).map((metadata) => metadata.type),
  ...Object.values(customSmsRegistry).map((metadata) => metadata.type),
  ...Object.values(smsComplianceRegistry).map((metadata) => metadata.type),
  "EMAIL_COMPLIANCE_UNSUBSCRIBE",
  "SMS_REGISTRATION_UPDATE",
]);

export function isDerivedDisplayEventType(type) {
  return DERIVED_DISPLAY_EVENT_TYPES.has(String(type || "").toUpperCase());
}

/** How a derived display label maps back to the RTDS payload (for help text and event cards). */
export function derivedEventSourceDescription(type) {
  const key = String(type || "").toUpperCase();

  const emailCustom = Object.entries(customEmailRegistry).find(([, metadata]) => metadata.type === key);
  if (emailCustom) {
    return {
      rtdsType: "CUSTOM",
      deviceType: "EMAIL",
      field: "body.name",
      value: emailCustom[0],
    };
  }

  const smsCustom = Object.entries(customSmsRegistry).find(([, metadata]) => metadata.type === key);
  if (smsCustom) {
    return {
      rtdsType: "CUSTOM",
      deviceType: "SMS",
      field: "body.name",
      value: smsCustom[0],
      note: "interaction_type delivery_report",
    };
  }

  const emailCompliance = Object.entries(emailComplianceRegistry).find(([, metadata]) => metadata.type === key);
  if (emailCompliance) {
    return {
      rtdsType: "COMPLIANCE",
      deviceType: "EMAIL",
      field: "body.event_type",
      value: emailCompliance[0],
    };
  }

  if (key === "EMAIL_COMPLIANCE_UNSUBSCRIBE") {
    return {
      rtdsType: "COMPLIANCE",
      deviceType: "EMAIL",
      field: "body.properties.registration_type",
      value: "unsubscribe",
    };
  }

  const smsCompliance = Object.entries(smsComplianceRegistry).find(([, metadata]) => metadata.type === key);
  if (smsCompliance) {
    return {
      rtdsType: "COMPLIANCE",
      deviceType: "SMS",
      field: "body.event_type",
      value: smsCompliance[0],
    };
  }

  if (key === "SMS_REGISTRATION_UPDATE") {
    return {
      rtdsType: "COMPLIANCE",
      deviceType: "SMS",
      field: "body.properties.registration_type",
      value: "update",
    };
  }

  return null;
}

export function marketerHelpForType(type) {
  const key = String(type || "").toUpperCase();
  const derived = derivedEventSourceDescription(key);
  if (derived) {
    const note = derived.note ? ` (${derived.note})` : "";
    return `Not an RTDS event type — display label only. Stream filter: ${derived.rtdsType}. Arrives on ${derived.deviceType} when ${derived.field}="${derived.value}"${note}.`;
  }
  return (
    MARKETER_HELP_BY_TYPE[key] ||
    "Use this event to validate your messaging and user behavior tracking. Combine it with audience fields (named user, channel, push id) for QA."
  );
}

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

export function metadataForType(type) {
  if (eventRegistry[type]) return eventRegistry[type];
  const customEmailMetadata = Object.values(customEmailRegistry).find((metadata) => metadata.type === type);
  if (customEmailMetadata) return { group: "Email", label: customEmailMetadata.label, color: customEmailMetadata.color };
  const emailComplianceMetadata = Object.values(emailComplianceRegistry).find((metadata) => metadata.type === type);
  if (emailComplianceMetadata) return { group: "Email", label: emailComplianceMetadata.label, color: emailComplianceMetadata.color };
  const customSmsMetadata = Object.values(customSmsRegistry).find((metadata) => metadata.type === type);
  if (customSmsMetadata) return { group: "SMS", label: customSmsMetadata.label, color: customSmsMetadata.color };
  const smsComplianceMetadata = Object.values(smsComplianceRegistry).find((metadata) => metadata.type === type);
  if (smsComplianceMetadata) return { group: "SMS", label: smsComplianceMetadata.label, color: smsComplianceMetadata.color };
  if (type === "EMAIL_COMPLIANCE_UNSUBSCRIBE") return { group: "Email", label: "Email Compliance Unsubscribe", color: "#f43f5e" };
  if (type === "SMS_REGISTRATION_UPDATE") return { group: "SMS", label: "SMS Registration Update", color: "#14b8a6" };
  return { group: "Other", label: type || "Unknown", color: "#e5e7eb" };
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

export function csvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  );
}

export function matchesDisplayFilters(entry, filters) {
  if (entry.kind !== "event") return true;
  const event = entry.event;
  const type = effectiveEventType(event).toUpperCase();
  const meta = eventMeta(event);
  const namedUser = eventNamedUser(event).toLowerCase();
  const channel = eventChannel(event).toLowerCase();
  const search = JSON.stringify(event).toLowerCase();

  if (filters.types.size && !filters.types.has(type)) return false;
  if (filters.group && meta.group !== filters.group) return false;
  if (filters.namedUser && !namedUser.includes(filters.namedUser)) return false;
  if (filters.channel && !channel.includes(filters.channel)) return false;
  if (filters.text && !search.includes(filters.text)) return false;
  return true;
}

export const EMPTY_DISPLAY_FILTERS = {
  types: "",
  group: "",
  namedUser: "",
  channel: "",
  text: "",
};

export function displayFiltersFromState(state) {
  return {
    types: csvSet(state.types),
    group: state.group,
    namedUser: state.namedUser.trim().toLowerCase(),
    channel: state.channel.trim().toLowerCase(),
    text: state.text.trim().toLowerCase(),
  };
}
