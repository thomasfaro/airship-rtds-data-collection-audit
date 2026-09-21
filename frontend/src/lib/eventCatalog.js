/**
 * The RTDS event catalogue: every type the Live stream can subscribe to, the
 * display-only labels derived from CUSTOM / COMPLIANCE payloads, and the help text
 * shown next to each one.
 *
 * Data, not rules. It stays complete even though a capture only requests five
 * types: rtdsConnectTypes.js validates a Live request against this list, so
 * trimming it would silently narrow what a user can watch.
 */

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
