const VALID_TIMEZONES = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [],
);

export function validateTimezone(timezone, fallback = "Europe/Paris") {
  const value = String(timezone || fallback).trim();
  if (VALID_TIMEZONES.size && !VALID_TIMEZONES.has(value)) {
    throw new Error(`Unknown timezone ${value}`);
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
  } catch {
    throw new Error(`Unknown timezone ${value}`);
  }
  return value;
}
