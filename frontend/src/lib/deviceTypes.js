/**
 * RTDS `device_types` filter values (lowercase, as sent to the Connect API).
 * Event payloads use uppercase (IOS, ANDROID, …); the API filter expects lowercase.
 * @see https://www.airship.com/docs/developer/rest-api/connect/
 */
export const DEVICE_TYPES = [
  {
    value: "ios",
    label: "iOS",
    description: "Native iOS app channels — opens, custom events, in-app, push engagement, uninstalls.",
  },
  {
    value: "android",
    label: "Android",
    description: "Native Android app channels — same lifecycle and messaging events as iOS.",
  },
  {
    value: "amazon",
    label: "Amazon (Fire OS)",
    description: "Amazon Fire OS devices — app and push events for Fire tablets/TV.",
  },
  {
    value: "web",
    label: "Web",
    description: "Web SDK channels — web sessions, clicks, and browser-based engagement.",
  },
  {
    value: "email",
    label: "Email",
    description: "Email channels — sends, deliveries, opens, clicks, bounces, subscriptions, compliance.",
  },
  {
    value: "sms",
    label: "SMS",
    description: "SMS channels — sends, delivery reports, MO messages, opt-in/out, compliance.",
  },
  {
    value: "open",
    label: "Open channel",
    description: "Custom delivery platforms (WhatsApp, Slack, etc.) integrated via Open Channels.",
  },
];

export function parseDeviceTypesCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function deviceTypesToCsv(types) {
  return Array.from(new Set(types.map((t) => t.toLowerCase()))).join(",");
}

/** Human label for `device.device_type` on RTDS event payloads (uppercase API values). */
export function formatEventDeviceTypeLabel(deviceType) {
  if (!deviceType) return "";
  const normalized = String(deviceType).toLowerCase();
  const found = DEVICE_TYPES.find((item) => item.value === normalized);
  return found ? found.label : String(deviceType);
}
