import { AUDIT_API_NAMED_USER_DEVICE_TYPE } from "./auditDeviceTypes.js";

const PLATFORM_VISUAL = {
  ios: {
    label: "iOS",
    shortLabel: "iOS",
    chartColor: "#111827",
    accent: "bg-slate-900",
    surface: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    icon: "mobile",
  },
  android: {
    label: "Android",
    shortLabel: "Android",
    chartColor: "#3DDC84",
    accent: "bg-emerald-500",
    surface: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-950",
    icon: "mobile",
  },
  amazon: {
    label: "Amazon",
    shortLabel: "Amazon",
    chartColor: "#FF9900",
    accent: "bg-orange-500",
    surface: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-950",
    icon: "mobile",
  },
  web: {
    label: "Web",
    shortLabel: "Web",
    chartColor: "#056DFF",
    accent: "bg-sky-500",
    surface: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-950",
    icon: "desktop",
  },
  email: {
    label: "Email",
    shortLabel: "Email",
    chartColor: "#FF3976",
    accent: "bg-rose-500",
    surface: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-950",
    icon: "email",
  },
  sms: {
    label: "SMS",
    shortLabel: "SMS",
    chartColor: "#04BF7B",
    accent: "bg-teal-500",
    surface: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-950",
    icon: "sms",
  },
  open: {
    label: "Open channel",
    shortLabel: "Open",
    chartColor: "#7C3AED",
    accent: "bg-violet-500",
    surface: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-950",
    icon: "open",
  },
  api: {
    label: "API named user events",
    shortLabel: "API",
    chartColor: "#11DBC0",
    accent: "bg-cyan-500",
    surface: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-950",
    icon: "server",
  },
  unknown: {
    label: "Unknown",
    shortLabel: "Unknown",
    chartColor: "#717680",
    accent: "bg-slate-400",
    surface: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    icon: "unknown",
  },
  generic: {
    label: "Other",
    shortLabel: "Other",
    chartColor: "#535862",
    accent: "bg-slate-500",
    surface: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-800",
    icon: "generic",
  },
};

export function normalizeAuditPlatformKey(deviceType) {
  const raw = String(deviceType ?? "").trim();
  const dt = raw.toUpperCase();

  if (dt === "IOS" || dt === "IPHONE" || dt === "IPAD" || dt === "TVOS") return "ios";
  if (raw.toLowerCase() === "ios") return "ios";
  if (dt === "ANDROID") return "android";
  if (raw.toLowerCase() === "android") return "android";
  if (dt === "AMAZON") return "amazon";
  if (dt === "WEB" || dt === "WEB_PUSH") return "web";
  if (dt === "EMAIL") return "email";
  if (dt === "SMS") return "sms";
  if (dt === "OPEN") return "open";
  if (dt === AUDIT_API_NAMED_USER_DEVICE_TYPE) return "api";
  if (dt === "UNKNOWN") return "unknown";

  return "generic";
}

export function getAuditPlatformVisual(deviceType) {
  const key = normalizeAuditPlatformKey(deviceType);
  const visual = PLATFORM_VISUAL[key] ?? PLATFORM_VISUAL.generic;
  const fallbackLabel = String(deviceType ?? "").trim();

  return {
    key,
    ...visual,
    label: key === "generic" && fallbackLabel ? fallbackLabel : visual.label,
    shortLabel: key === "generic" && fallbackLabel ? fallbackLabel : visual.shortLabel,
  };
}

export function auditPlatformChartColor(deviceType, index = 0) {
  const visual = getAuditPlatformVisual(deviceType);
  if (visual.key !== "generic") return visual.chartColor;
  const fallback = ["#056DFF", "#11DBC0", "#E6F55A", "#7ABFFF", "#04BF7B", "#FF3976"];
  return fallback[index % fallback.length];
}
