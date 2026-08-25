/** Minimal event registry mirror for audit filtering (keep in sync with frontend eventRegistry). */
export const EVENT_REGISTRY = {
  ATTRIBUTE_OPERATION: { group: "Audience", label: "Attribute Operation" },
  CLOSE: { group: "App", label: "App Close" },
  COMPLIANCE: { group: "Audience", label: "Compliance" },
  CONTACT_CHANGE: { group: "Audience", label: "Contact Change" },
  CONTROL: { group: "Messaging", label: "Control Group" },
  CUSTOM: { group: "Audience", label: "Custom Event" },
  FEATURE_FLAG_INTERACTION: { group: "App", label: "Feature Flag Interaction" },
  FIRST_OPEN: { group: "App", label: "First Open" },
  FIRST_OPT_IN: { group: "Messaging", label: "First Opt-In" },
  IN_APP_BUTTON_TAP: { group: "In-App", label: "Button Tap" },
  IN_APP_EXPERIENCES: { group: "In-App", label: "Experience Trigger" },
  IN_APP_FORM_DISPLAY: { group: "In-App", label: "Form Display" },
  IN_APP_FORM_RESULT: { group: "In-App", label: "Form Result" },
  IN_APP_MESSAGE_CONTROL: { group: "In-App", label: "Message Control" },
  IN_APP_MESSAGE_DISPLAY: { group: "In-App", label: "Message Display" },
  IN_APP_MESSAGE_EXCLUSION: { group: "In-App", label: "Message Exclusion" },
  IN_APP_MESSAGE_EXPIRATION: { group: "In-App", label: "Message Expiration" },
  IN_APP_MESSAGE_RESOLUTION: { group: "In-App", label: "Message Resolution" },
  IN_APP_PAGE_SWIPE: { group: "In-App", label: "Page Swipe" },
  IN_APP_PAGE_VIEW: { group: "In-App", label: "Page View" },
  IN_APP_PAGER_COMPLETED: { group: "In-App", label: "Pager Completed" },
  IN_APP_PAGER_SUMMARY: { group: "In-App", label: "Pager Summary" },
  LABEL_EVENT: { group: "Messaging", label: "Label Event" },
  LOCATION: { group: "Location", label: "Location" },
  MOBILE_ORIGINATED: { group: "SMS", label: "Mobile Originated" },
  OPEN: { group: "App", label: "App Open" },
  PUSH_BODY: { group: "Messaging", label: "Push Body" },
  REGION: { group: "Location", label: "Region" },
  RICH_CONTROL: { group: "Message Center", label: "MC Control" },
  RICH_DELETE: { group: "Message Center", label: "MC Delete" },
  RICH_DELIVERY: { group: "Message Center", label: "MC Delivery" },
  RICH_READ: { group: "Message Center", label: "MC Read" },
  SCREEN_VIEWED: { group: "App", label: "Screen Viewed" },
  SEND: { group: "Messaging", label: "Send" },
  SEND_ABORTED: { group: "Messaging", label: "Send Aborted" },
  SEND_REJECTED: { group: "Messaging", label: "Send Rejected" },
  SHORT_LINK_CLICK: { group: "SMS", label: "Short Link Click" },
  SUBSCRIPTION: { group: "Email", label: "Subscription" },
  SUBSCRIPTION_LIST: { group: "Audience", label: "Subscription List" },
  TAG_CHANGE: { group: "Audience", label: "Tag Change" },
  UNINSTALL: { group: "App", label: "Uninstall" },
  WEB_CLICK: { group: "Web", label: "Web Click" },
  WEB_SESSION: { group: "Web", label: "Web Session" },
};

/** Whole groups excluded from audit unless a type is listed in AUDIT_INCLUDED_TYPES. */
export const AUDIT_EXCLUDED_GROUPS = new Set([
  "Message Center",
  "SMS",
  "In-App",
  "Location",
]);

/**
 * Messaging/email types included in audit even though their group is partially excluded.
 * (Messaging group is not fully excluded — only types listed here or not in AUDIT_EXCLUDED_MESSAGING_TYPES.)
 */
export const AUDIT_INCLUDED_TYPES = new Set([
  "SUBSCRIPTION",
  "FIRST_OPT_IN",
  "CONTROL",
  "SEND_ABORTED",
  "SEND_REJECTED",
  "CONTACT_CHANGE",
  "COMPLIANCE",
]);

/** Messaging types still excluded from audit. */
export const AUDIT_EXCLUDED_MESSAGING_TYPES = new Set(["LABEL_EVENT", "PUSH_BODY", "SEND"]);

/** Always excluded from audit (even if group would allow them). */
export const AUDIT_EXCLUDED_TYPES = new Set(["REGION", "LOCATION", "CLOSE", "UNINSTALL"]);

/**
 * Derived / channel-specific types shown in the live stream UI (from CUSTOM / COMPLIANCE payloads).
 * Not all are valid RTDS `types[]` filter values — they are documented for coverage gaps.
 */
export const STREAM_DERIVED_EVENT_TYPES = [
  "EMAIL_BOUNCE",
  "EMAIL_CLICK",
  "EMAIL_DELAY",
  "EMAIL_DELIVERY",
  "EMAIL_INITIAL_OPEN",
  "EMAIL_INJECTION",
  "EMAIL_OPEN",
  "EMAIL_UNSUBSCRIBE",
  "EMAIL_COMPLIANCE_BOUNCE",
  "EMAIL_COMPLIANCE_CREATE_AND_SEND",
  "EMAIL_COMPLIANCE_REGISTRATION",
  "EMAIL_COMPLIANCE_UNSUBSCRIBE",
  "RCS_READ",
  "SMS_ABORTED",
  "SMS_REJECTED",
  "SMS_DISPATCHED",
  "SMS_DELIVERED",
  "SMS_FAILED",
  "SMS_EXPIRED",
  "SMS_UNKNOWN",
  "SMS_UNDELIVERABLE",
  "SMS_DELETED",
  "SMS_API_INITIATE_OPT_IN",
  "SMS_CARRIER_DEACTIVATION",
  "SMS_CREATE_AND_SEND",
  "SMS_CUSTOM_KEYWORD_RESPONSE",
  "SMS_MOBILE_CREATE_CHANNEL",
  "SMS_MOBILE_KEYWORD_MATCHED",
  "SMS_MOBILE_KEYWORD_UNMATCHED",
  "SMS_MOBILE_OPT_IN",
  "SMS_MOBILE_OPT_OUT",
  "SMS_MOBILE_TERMINATED_MESSAGE",
  "SMS_OPTED_OUT",
  "SMS_REGISTRATION",
  "SMS_UNINSTALL",
  "SMS_REGISTRATION_UPDATE",
];

/** All types known in the stream UI catalog (mirror of frontend allEventTypeOptions). */
export function knownStreamEventTypes() {
  return [...new Set([...Object.keys(EVENT_REGISTRY), ...STREAM_DERIVED_EVENT_TYPES])].sort();
}

/**
 * Tracking-only RTDS types for a "Data collection audit": exactly the client
 * data-collection signals (custom events, attributes, tags, subscription lists,
 * screens). OPEN / messaging / email / in-app are intentionally excluded.
 * App versions come from the `app_version` carried on these tracking events.
 */
export const TAGGING_PLAN_RTDS_TYPES = [
  "ATTRIBUTE_OPERATION",
  "CUSTOM",
  "SCREEN_VIEWED",
  "SUBSCRIPTION_LIST",
  "TAG_CHANGE",
];

/**
 * RTDS types sent in the audit connect request (positive list).
 * Entitlements may remove types at runtime (403 retry).
 * `trackingOnly` restricts to TAGGING_PLAN_RTDS_TYPES (Data collection audit).
 */
export function auditRtdsTypes({ trackingOnly = false } = {}) {
  if (trackingOnly) {
    return TAGGING_PLAN_RTDS_TYPES.filter((type) => EVENT_REGISTRY[type]).sort();
  }
  return Object.entries(EVENT_REGISTRY)
    .filter(([type, meta]) => {
      if (AUDIT_EXCLUDED_TYPES.has(type)) return false;
      if (AUDIT_INCLUDED_TYPES.has(type)) return true;
      if (meta.group === "Messaging") {
        return !AUDIT_EXCLUDED_MESSAGING_TYPES.has(type);
      }
      if (meta.group === "Email") {
        return AUDIT_INCLUDED_TYPES.has(type);
      }
      return !AUDIT_EXCLUDED_GROUPS.has(meta.group);
    })
    .map(([type]) => type)
    .sort();
}

/** Types in the stream catalog but not requested by auditRtdsTypes(). */
export function auditTypeCoverage({ trackingOnly = false } = {}) {
  const requested = auditRtdsTypes({ trackingOnly });
  const requestedSet = new Set(requested);
  const catalog = knownStreamEventTypes();
  const notRequested = catalog.filter((type) => !requestedSet.has(type));
  return {
    requested,
    notRequested,
    derivedNotRequested: notRequested.filter((type) => STREAM_DERIVED_EVENT_TYPES.includes(type)),
    rtdsNotRequested: notRequested.filter((type) => EVENT_REGISTRY[type]),
  };
}

export function registryMeta(type) {
  return EVENT_REGISTRY[type] ?? { group: "Other", label: type || "Unknown" };
}
