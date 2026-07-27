import { inferEventSource } from "./analyzeInsights.js";
import { kpiId as sampleKpiId } from "./eventSamples.js";

export const CONTACT_CHANGE_DESCRIPTION =
  "Contact lifecycle events: ASSOCIATION (channel or named user linked to a contact), DISSOCIATION (unlinked), or UNINSTALL.";

function inc(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + amount;
}

function topRows(map, limit = 20) {
  return Object.entries(map ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function createContactChangeAccumulator() {
  return {
    total: 0,
    byChangeType: {},
    byDevice: {},
    sources: { SDK: 0, API: 0, UNKNOWN: 0 },
  };
}

export function normalizeContactChangeType(body) {
  const raw = body?.change_type ?? body?.changeType ?? "(unknown)";
  return String(raw).trim().toUpperCase() || "(UNKNOWN)";
}

export function processContactChangeEvent(acc, event, deviceType, body, samples) {
  const contact = acc.contactChange;
  contact.total += 1;

  const changeType = normalizeContactChangeType(body);
  inc(contact.byChangeType, changeType);

  if (!contact.byDevice[deviceType]) {
    contact.byDevice[deviceType] = { count: 0, byChangeType: {} };
  }
  const deviceRow = contact.byDevice[deviceType];
  deviceRow.count += 1;
  inc(deviceRow.byChangeType, changeType);

  const source = inferEventSource("CONTACT_CHANGE", body, event);
  inc(contact.sources, source);
  samples.add(
    sampleKpiId("sources", "contact", source),
    `CONTACT_CHANGE from ${source}`,
    event,
    {
      note: `change_type=${changeType}, device_type=${deviceType}`,
      deviceType,
      countTowardDeviceQuota: false,
    },
  );

  samples.add(
    sampleKpiId("contact", deviceType, changeType),
    `CONTACT_CHANGE ${changeType} on ${deviceType}`,
    event,
    { deviceType, description: CONTACT_CHANGE_DESCRIPTION, illustrative: true },
  );
}

export function buildContactChangeReport(contactChange) {
  const total = contactChange?.total ?? 0;
  if (!total) {
    return {
      total: 0,
      description: CONTACT_CHANGE_DESCRIPTION,
      byChangeType: [],
      byDeviceType: [],
      sources: { total: 0, breakdown: [] },
    };
  }

  const sourceTotal = Object.values(contactChange.sources ?? {}).reduce((a, b) => a + b, 0);
  const byChangeType = topRows(contactChange.byChangeType, 25).map((row) => ({
    changeType: row.key,
    count: row.count,
    pct: Math.round((row.count / total) * 1000) / 10,
    sampleKpiId: sampleKpiId("contact", "change", row.key),
  }));

  const byDeviceType = topRows(
    Object.fromEntries(
      Object.entries(contactChange.byDevice ?? {}).map(([dt, row]) => [dt, row.count ?? 0]),
    ),
    25,
  ).map((row) => {
    const deviceRow = contactChange.byDevice[row.key];
    const deviceTotal = deviceRow?.count ?? row.count;
    const changeTypes = topRows(deviceRow?.byChangeType ?? {}, 15).map((ct) => ({
      changeType: ct.key,
      count: ct.count,
      pct: deviceTotal ? Math.round((ct.count / deviceTotal) * 1000) / 10 : 0,
      sampleKpiId: sampleKpiId("contact", row.key, ct.key),
    }));
    return {
      deviceType: row.key,
      count: deviceTotal,
      pct: Math.round((deviceTotal / total) * 1000) / 10,
      changeTypes,
      sampleKpiId: sampleKpiId("contact", row.key),
    };
  });

  return {
    total,
    description: CONTACT_CHANGE_DESCRIPTION,
    byChangeType,
    byDeviceType,
    sources: {
      total: sourceTotal,
      breakdown: Object.entries(contactChange.sources ?? {})
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([source, count]) => ({
          source,
          count,
          pct: sourceTotal ? Math.round((count / sourceTotal) * 1000) / 10 : 0,
          sampleKpiId: sampleKpiId("sources", "contact", source),
        })),
    },
  };
}
