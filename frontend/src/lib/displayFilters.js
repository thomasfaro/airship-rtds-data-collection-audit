/**
 * Client-side filtering of the Live stream list: what the user typed, turned into
 * a predicate over entries. Purely local — the RTDS request filters are a separate
 * concern and live in streamRequestFilters.js.
 */

import { effectiveEventType, eventChannel, eventMeta, eventNamedUser } from "./eventRegistry.js";

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
