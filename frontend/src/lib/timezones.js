/** IANA timezone helpers for audit and stream UI. */

const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
];

export function detectDeviceTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimezone(tz)) return tz;
  } catch {
    /* ignore */
  }
  return "UTC";
}

export function isValidTimezone(timezone) {
  if (!timezone) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function listTimezones() {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone").sort((a, b) => a.localeCompare(b));
  }
  return [...FALLBACK_TIMEZONES];
}

/** @returns {[string, string[]][]} region → sorted zone ids */
export function groupTimezones(timezones) {
  const groups = new Map();
  for (const tz of timezones) {
    const slash = tz.indexOf("/");
    const region = slash > 0 ? tz.slice(0, slash) : "Other";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(tz);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function formatTimezoneOffset(timezone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

export function formatTimezoneOption(timezone) {
  const offset = formatTimezoneOffset(timezone);
  const label = timezone.replace(/_/g, " ");
  return offset ? `${label} (${offset})` : label;
}
