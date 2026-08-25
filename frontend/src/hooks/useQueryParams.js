import { useEffect, useRef } from "react";

export { streamParamsFromFilters } from "../lib/streamRequestFilters.js";

export function useApplyQueryParams(setState, fieldIds) {
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return;
    setState((current) => {
      const next = { ...current };
      for (const [key, value] of params.entries()) {
        if (key === "autostart" || !fieldIds.includes(key)) continue;
        next[key] = value;
      }
      if (params.get("no_limit") === "1") next.no_limit = true;
      if (params.get("store_raw") === "1") next.store_raw = true;
      return next;
    });
  }, [fieldIds, setState]);
}

export function shouldAutostart() {
  return new URLSearchParams(window.location.search).get("autostart") === "1";
}
