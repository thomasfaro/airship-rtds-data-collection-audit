/**
 * Value histograms for the plan, read from the paginated /api/values endpoints.
 *
 * The fetchers are injected rather than imported: the same code then serves the
 * app, the tests and the golden harness. Two budgets bound the work — a per-key
 * cap and a global row budget — because a large capture has more values than a
 * workbook can usefully carry.
 */

const VALUE_TRUNCATE = 200;

/** Values go into a spreadsheet cell, so an unbounded one is trimmed and says so. */
export function truncateValue(value) {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= VALUE_TRUNCATE) return s;
  return `${s.slice(0, VALUE_TRUNCATE)}… (+${s.length - VALUE_TRUNCATE})`;
}

async function runPool(tasks, concurrency, worker, onProgress) {
  let index = 0;
  let done = 0;
  const total = tasks.length;
  const runners = Array.from({ length: Math.min(concurrency, total || 1) }, async () => {
    while (index < tasks.length) {
      const current = tasks[index];
      index += 1;
      await worker(current);
      done += 1;
      onProgress?.({ done, total });
    }
  });
  await Promise.all(runners);
}

async function paginateValues(fetchPage, baseArgs, { perKeyCap, limit, scopeId, remaining }) {
  const collected = [];
  let offset = 0;
  let capped = false;
  let total = 0;
  while (offset < perKeyCap && collected.length < remaining()) {
    let page;
    try {
      page = await fetchPage({ ...baseArgs, offset, limit, scopeId });
    } catch {
      break;
    }
    total = page.total ?? total;
    capped = capped || Boolean(page.capped);
    const values = page.values ?? [];
    for (const v of values) {
      if (collected.length >= remaining()) break;
      collected.push(v);
    }
    if (values.length < limit) break;
    offset += limit;
    if (offset >= total) break;
  }
  return { values: collected, total, capped };
}

/**
 * Collect value histograms for attributes and custom-event properties.
 * Fetchers are injected so this is testable without the browser API client.
 */
export async function collectValueExtracts({
  report,
  ndjsonFileName = null,
  scopeId = "baseline",
  fetchAttributeValues = null,
  fetchCustomPropertyValues = null,
  onProgress = null,
  perKeyCap = 200,
  concurrency = 5,
  maxValueRows = 20000,
  limit = 100,
} = {}) {
  const attributeValues = [];
  const customValues = [];

  const canFetch = Boolean(ndjsonFileName && fetchAttributeValues && fetchCustomPropertyValues);

  if (!canFetch) {
    // Fallback: whatever the report itself carries (custom event sample values).
    for (const section of [report.customEvents?.sdk?.top, report.customEvents?.api?.top]) {
      for (const ev of section ?? []) {
        for (const value of ev.sampleValues ?? []) {
          customValues.push({
            event: ev.name,
            source: ev.source ?? "",
            property: "value",
            value: truncateValue(value),
            count: null,
            deviceTypes: "",
          });
        }
      }
    }
    return { available: false, usedFallback: true, truncated: false, attributeValues, customValues };
  }

  const totalBudget = () => maxValueRows - attributeValues.length - customValues.length;

  const attrTasks = (report.attributes?.topKeys ?? [])
    .filter((k) => (k.trackedValueCount ?? 0) > 0)
    .map((k) => ({ kind: "attr", key: k.normalized ?? k.key, label: k.key }));

  const customTasks = [];
  for (const section of ["sdk", "api", "unknown"]) {
    for (const ev of report.customEvents?.[section]?.top ?? []) {
      for (const stat of ev.propertyValueStats ?? []) {
        if ((stat.trackedValueCount ?? 0) > 0) {
          customTasks.push({
            kind: "custom",
            event: ev.name,
            source: ev.source ?? section.toUpperCase(),
            property: stat.property,
          });
        }
      }
    }
  }

  const tasks = [...attrTasks, ...customTasks];
  let truncated = false;

  await runPool(
    tasks,
    concurrency,
    async (task) => {
      if (totalBudget() <= 0) {
        truncated = true;
        return;
      }
      if (task.kind === "attr") {
        const { values, capped } = await paginateValues(
          fetchAttributeValues,
          { name: ndjsonFileName, key: task.key },
          { perKeyCap, limit, scopeId, remaining: totalBudget },
        );
        for (const v of values) {
          attributeValues.push({
            key: task.label,
            value: truncateValue(v.value),
            count: v.count ?? 0,
            deviceTypes: (v.deviceTypes ?? []).map((d) => `${d.deviceType}: ${d.count}`).join(", "),
            capped: capped ? "100+" : "",
          });
        }
      } else {
        const { values, capped } = await paginateValues(
          fetchCustomPropertyValues,
          { name: ndjsonFileName, source: task.source, event: task.event, property: task.property },
          { perKeyCap, limit, scopeId, remaining: totalBudget },
        );
        for (const v of values) {
          customValues.push({
            event: task.event,
            source: task.source,
            property: task.property,
            value: truncateValue(v.value),
            count: v.count ?? 0,
            deviceTypes: (v.deviceTypes ?? []).map((d) => `${d.deviceType}: ${d.count}`).join(", "),
            capped: capped ? "100+" : "",
          });
        }
      }
      if (totalBudget() <= 0) truncated = true;
    },
    onProgress,
  );

  attributeValues.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  customValues.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  return { available: true, usedFallback: false, truncated, attributeValues, customValues };
}
