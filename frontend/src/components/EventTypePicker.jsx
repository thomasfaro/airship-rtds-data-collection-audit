import { useMemo, useState } from "react";
import { categoriesForType, marketerHelpForType } from "../lib/eventRegistry.js";

function parseTypesCsv(csv) {
  return new Set(
    String(csv ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

function typesToCsv(set) {
  return Array.from(set).sort().join(",");
}

function normalizeLabel(label) {
  return label.replace(/\s*\([^)]+\)\s*$/, "");
}

function buildGroups(eventTypeOptions) {
  const byGroup = eventTypeOptions.reduce((acc, { type, label }) => {
    const baseLabel = normalizeLabel(label);
    for (const group of categoriesForType(type)) {
      if (!acc[group]) acc[group] = [];
      if (!acc[group].some((item) => item.type === type)) {
        acc[group].push({ type, label: baseLabel });
      }
    }
    return acc;
  }, {});

  for (const group of Object.keys(byGroup)) {
    byGroup[group].sort((a, b) => a.type.localeCompare(b.type));
  }

  return byGroup;
}

function buildUniqueItems(eventTypeOptions) {
  const seen = new Set();
  const items = [];
  for (const { type, label } of eventTypeOptions) {
    if (seen.has(type)) continue;
    seen.add(type);
    items.push({ type, label: normalizeLabel(label) });
  }
  return items.sort((a, b) => a.type.localeCompare(b.type));
}

function matchesQuery({ type, label }, query) {
  if (!query) return true;
  return (
    type.toLowerCase().includes(query) ||
    label.toLowerCase().includes(query) ||
    marketerHelpForType(type).toLowerCase().includes(query)
  );
}

function EventTypeRow({ type, label, checked, onToggle, showHelp = true }) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-airship-off-white">
        <input type="checkbox" className="mt-0.5 shrink-0" checked={checked} onChange={onToggle} />
        <span className="min-w-0 leading-snug">
          <span className="block">
            <span className="font-mono text-[11px] font-semibold text-airship-navy">{type}</span>
            {label && <span className="ml-2 text-xs text-airship-body">{label}</span>}
          </span>
          {showHelp && (
            <span className="mt-0.5 block text-[11px] leading-relaxed text-airship-muted">{marketerHelpForType(type)}</span>
          )}
        </span>
      </label>
    </li>
  );
}

export default function EventTypePicker({
  value = "",
  onChange,
  eventTypeOptions = [],
  title = "Event types",
  hint,
  emptyMeansAll = true,
  emptyMeansAllVerb = "streamed",
  dense = false,
  showHelp = true,
}) {
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("");

  const selectedTypes = useMemo(() => parseTypesCsv(value), [value]);
  const byGroup = useMemo(() => buildGroups(eventTypeOptions), [eventTypeOptions]);
  const allItems = useMemo(() => buildUniqueItems(eventTypeOptions), [eventTypeOptions]);
  const orderedGroups = useMemo(() => Object.keys(byGroup).sort((a, b) => a.localeCompare(b)), [byGroup]);

  const query = search.trim().toLowerCase();

  const filteredFlat = useMemo(
    () => allItems.filter((item) => matchesQuery(item, query)),
    [allItems, query],
  );

  const filteredByGroup = useMemo(() => {
    const result = {};
    for (const group of orderedGroups) {
      if (activeGroup && group !== activeGroup) continue;
      const items = (byGroup[group] ?? []).filter((item) => matchesQuery(item, query));
      if (items.length) result[group] = items;
    }
    return result;
  }, [activeGroup, byGroup, orderedGroups, query]);

  const visibleTypes = useMemo(() => {
    if (!activeGroup) return filteredFlat.map((item) => item.type);
    const types = [];
    for (const items of Object.values(filteredByGroup)) {
      for (const item of items) types.push(item.type);
    }
    return types;
  }, [activeGroup, filteredByGroup, filteredFlat]);

  const allTypesInScope = useMemo(() => {
    if (!activeGroup) return allItems.map((item) => item.type);
    return (byGroup[activeGroup] ?? []).map((item) => item.type);
  }, [activeGroup, allItems, byGroup]);

  const setTypes = (next) => onChange(typesToCsv(next));

  const toggleType = (type) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setTypes(next);
  };

  const setGroup = (group, checked) => {
    const next = new Set(selectedTypes);
    for (const { type } of byGroup[group] ?? []) {
      if (checked) next.add(type);
      else next.delete(type);
    }
    setTypes(next);
  };

  const selectVisible = () => {
    const next = new Set(selectedTypes);
    for (const type of visibleTypes) next.add(type);
    setTypes(next);
  };

  const selectAll = () => {
    const next = new Set(selectedTypes);
    for (const type of allTypesInScope) next.add(type);
    setTypes(next);
  };

  const clearAll = () => setTypes(new Set());

  const selectedList = Array.from(selectedTypes).sort();
  const flatView = !activeGroup;

  const listMaxHeight = dense ? "max-h-40" : "max-h-80";

  return (
    <div className={`rounded-lg border border-airship-border bg-airship-off-white ${dense ? "p-2" : "p-3"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {title ? <p className="text-xs font-semibold uppercase tracking-wide text-airship-muted">{title}</p> : null}
          {hint ? <p className={`text-xs text-airship-muted ${title ? "mt-1" : ""}`}>{hint}</p> : null}
        </div>
        <span className={selectedList.length === 0 && emptyMeansAll ? "badge-seafoam" : "badge-blue"}>
          {selectedList.length === 0 && emptyMeansAll
            ? "All types (default)"
            : `${selectedList.length} selected`}
        </span>
      </div>

      {selectedList.length === 0 && emptyMeansAll && (
        <p className="mt-2 rounded-airship border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
          No event types selected — <strong>all types</strong> will be {emptyMeansAllVerb} by default.
        </p>
      )}

      {selectedList.length > 0 && (
        <div className="mt-3 max-h-24 overflow-y-auto rounded-airship border border-airship-border bg-airship-surface p-2">
          <div className="flex flex-wrap gap-1.5">
            {selectedList.map((type) => (
              <button
                key={type}
                type="button"
                className="inline-flex items-center gap-1 rounded-pill bg-airship-blue-light px-2 py-0.5 text-[11px] font-medium text-airship-blue-dark hover:bg-airship-blue/15"
                onClick={() => toggleType(type)}
                title="Remove"
              >
                <span className="font-mono">{type}</span>
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`flex flex-wrap gap-2 ${dense ? "mt-2" : "mt-3"}`}>
        <input
          type="search"
          className={`input-field min-w-[12rem] flex-1 ${dense ? "!py-1.5 text-sm" : ""}`}
          placeholder="Search event types…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={selectAll}>
          Select all
        </button>
        <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={selectVisible} disabled={visibleTypes.length === 0}>
          Select visible
        </button>
        <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={clearAll} disabled={selectedList.length === 0}>
          Clear all
        </button>
      </div>

      <div className={`flex gap-1.5 overflow-x-auto pb-1 ${dense ? "mt-2" : "mt-3"}`}>
        <button
          type="button"
          className={`shrink-0 rounded-pill px-3 py-1 text-xs font-medium transition ${
            flatView ? "bg-airship-blue text-white" : "bg-airship-surface-muted text-airship-body hover:bg-airship-blue-light/60"
          }`}
          onClick={() => setActiveGroup("")}
        >
          All categories
        </button>
        {orderedGroups.map((group) => {
          const count = byGroup[group]?.length ?? 0;
          const selectedInGroup = (byGroup[group] ?? []).filter((item) => selectedTypes.has(item.type)).length;
          return (
            <button
              key={group}
              type="button"
              className={`shrink-0 rounded-pill px-3 py-1 text-xs font-medium transition ${
                activeGroup === group
                  ? "bg-airship-blue text-white"
                  : "bg-airship-surface-muted text-airship-body hover:bg-airship-blue-light/60"
              }`}
              onClick={() => setActiveGroup(group)}
            >
              {group}
              <span className="ml-1 opacity-80">
                {selectedInGroup}/{count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className={`${dense ? "mt-2" : "mt-3"} ${listMaxHeight} overflow-y-auto overscroll-contain rounded-airship border border-airship-border bg-airship-surface`}
      >
        {flatView ? (
          filteredFlat.length === 0 ? (
            <p className="p-4 text-center text-sm text-airship-muted">No event types match your search.</p>
          ) : (
            <ul className="grid gap-1 p-2 sm:grid-cols-2">
              {filteredFlat.map(({ type, label }) => (
                <EventTypeRow
                  key={type}
                  type={type}
                  label={label}
                  showHelp={showHelp}
                  checked={selectedTypes.has(type)}
                  onToggle={() => toggleType(type)}
                />
              ))}
            </ul>
          )
        ) : Object.keys(filteredByGroup).length === 0 ? (
          <p className="p-4 text-center text-sm text-airship-muted">No event types match your search.</p>
        ) : (
          Object.entries(filteredByGroup).map(([group, items]) => {
            const selectedCount = items.reduce((n, item) => n + (selectedTypes.has(item.type) ? 1 : 0), 0);
            const allSelected = items.length > 0 && selectedCount === items.length;
            const someSelected = selectedCount > 0 && selectedCount < items.length;

            return (
              <section key={group} className="border-b border-airship-border last:border-b-0">
                <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-airship-border bg-airship-surface-muted/95 px-3 py-2 backdrop-blur-sm">
                  <input
                    type="checkbox"
                    className="shrink-0"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => setGroup(group, e.target.checked)}
                  />
                  <span className="text-sm font-semibold text-airship-navy">{group}</span>
                  <span className="text-xs text-airship-muted">
                    {selectedCount}/{items.length}
                  </span>
                </div>

                <ul className="grid gap-1 p-2 sm:grid-cols-2">
                  {items.map(({ type, label }) => (
                    <EventTypeRow
                      key={`${group}-${type}`}
                      type={type}
                      label={label}
                      showHelp={showHelp}
                      checked={selectedTypes.has(type)}
                      onToggle={() => toggleType(type)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
