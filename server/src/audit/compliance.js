import { inferEventSource } from "./analyzeInsights.js";
import { kpiId as sampleKpiId } from "./eventSamples.js";

export const COMPLIANCE_DESCRIPTION =
  "Compliance and registration events: email/SMS opt-in and opt-out, registrations, keyword flows, and related channel compliance signals (body.event_type).";

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

export const EMAIL_OPT_OUT_DESCRIPTION =
  "Email opt-out and registration signals from COMPLIANCE events on EMAIL channels (body.event_type=registration), split by registration_type (unsubscribe, open_tracking_opt_out, opt_out, opt_in, ...) and message_type (commercial vs transactional).";

/** Registration types that represent an opt-out (vs opt-in / other registration changes). */
function isOptOutRegistrationType(registrationType) {
  return /opt_out|unsubscribe/.test(String(registrationType ?? ""));
}

export function createComplianceAccumulator() {
  return {
    total: 0,
    byEventType: {},
    byDevice: {},
    sources: { SDK: 0, API: 0, UNKNOWN: 0 },
    emailOptOut: {
      total: 0,
      byRegistrationType: {},
      byMessageType: {},
      matrix: {},
    },
  };
}

export function normalizeComplianceEventType(body) {
  const raw = body?.event_type ?? "(unknown)";
  return String(raw).trim().toLowerCase() || "(unknown)";
}

/** COMPLIANCE registration event on an EMAIL channel — carries the opt-out signals. */
export function isEmailRegistrationEvent(deviceType, body) {
  return deviceType === "EMAIL" && normalizeComplianceEventType(body) === "registration";
}

function normalizeOptOutValue(raw) {
  return String(raw ?? "(unknown)").trim().toLowerCase() || "(unknown)";
}

export function processComplianceEvent(acc, event, deviceType, body, samples) {
  const compliance = acc.compliance;
  compliance.total += 1;

  const eventType = normalizeComplianceEventType(body);
  inc(compliance.byEventType, eventType);

  if (!compliance.byDevice[deviceType]) {
    compliance.byDevice[deviceType] = { count: 0, byEventType: {} };
  }
  const deviceRow = compliance.byDevice[deviceType];
  deviceRow.count += 1;
  inc(deviceRow.byEventType, eventType);

  const source = inferEventSource("COMPLIANCE", body, event);
  inc(compliance.sources, source);
  samples.add(
    sampleKpiId("sources", "compliance", source),
    `COMPLIANCE from ${source}`,
    event,
    {
      note: `event_type=${eventType}, device_type=${deviceType}`,
      deviceType,
      countTowardDeviceQuota: false,
    },
  );

  samples.add(
    sampleKpiId("compliance", deviceType, eventType),
    `COMPLIANCE ${eventType} on ${deviceType}`,
    event,
    { deviceType, description: COMPLIANCE_DESCRIPTION, illustrative: true },
  );

  if (isEmailRegistrationEvent(deviceType, body)) {
    const emailOptOut = compliance.emailOptOut;
    const regType = normalizeOptOutValue(body?.properties?.registration_type);
    const msgType = normalizeOptOutValue(body?.properties?.message_type);

    emailOptOut.total += 1;
    inc(emailOptOut.byRegistrationType, regType);
    inc(emailOptOut.byMessageType, msgType);
    if (!emailOptOut.matrix[regType]) emailOptOut.matrix[regType] = {};
    inc(emailOptOut.matrix[regType], msgType);

    samples.add(
      sampleKpiId("compliance", "email-optout", regType),
      `EMAIL registration ${regType} (${msgType})`,
      event,
      { deviceType, description: EMAIL_OPT_OUT_DESCRIPTION, illustrative: true },
    );
  }
}

function buildEmailOptOutReport(emailOptOut) {
  const total = emailOptOut?.total ?? 0;
  if (!total) {
    return {
      total: 0,
      optOutTotal: 0,
      description: EMAIL_OPT_OUT_DESCRIPTION,
      byRegistrationType: [],
      byMessageType: [],
      matrix: [],
    };
  }

  const byRegistrationType = topRows(emailOptOut.byRegistrationType, 25).map((row) => ({
    registrationType: row.key,
    count: row.count,
    pct: Math.round((row.count / total) * 1000) / 10,
    isOptOut: isOptOutRegistrationType(row.key),
    sampleKpiId: sampleKpiId("compliance", "email-optout", row.key),
  }));

  const byMessageType = topRows(emailOptOut.byMessageType, 25).map((row) => ({
    messageType: row.key,
    count: row.count,
    pct: Math.round((row.count / total) * 1000) / 10,
  }));

  const optOutTotal = byRegistrationType
    .filter((row) => row.isOptOut)
    .reduce((sum, row) => sum + row.count, 0);

  const matrix = [];
  for (const [registrationType, byMsg] of Object.entries(emailOptOut.matrix ?? {})) {
    for (const [messageType, count] of Object.entries(byMsg)) {
      matrix.push({ registrationType, messageType, count });
    }
  }
  matrix.sort((a, b) => b.count - a.count);

  return {
    total,
    optOutTotal,
    description: EMAIL_OPT_OUT_DESCRIPTION,
    byRegistrationType,
    byMessageType,
    matrix,
  };
}

export function buildComplianceReport(compliance) {
  const total = compliance?.total ?? 0;
  const emailOptOut = buildEmailOptOutReport(compliance?.emailOptOut);
  if (!total) {
    return {
      total: 0,
      description: COMPLIANCE_DESCRIPTION,
      byEventType: [],
      byDeviceType: [],
      sources: { total: 0, breakdown: [] },
      emailOptOut,
    };
  }

  const sourceTotal = Object.values(compliance.sources ?? {}).reduce((a, b) => a + b, 0);
  const byEventType = topRows(compliance.byEventType, 25).map((row) => ({
    eventType: row.key,
    count: row.count,
    pct: Math.round((row.count / total) * 1000) / 10,
    sampleKpiId: sampleKpiId("compliance", "event", row.key),
  }));

  const byDeviceType = topRows(
    Object.fromEntries(
      Object.entries(compliance.byDevice ?? {}).map(([dt, row]) => [dt, row.count ?? 0]),
    ),
    25,
  ).map((row) => {
    const deviceRow = compliance.byDevice[row.key];
    const deviceTotal = deviceRow?.count ?? row.count;
    const eventTypes = topRows(deviceRow?.byEventType ?? {}, 15).map((et) => ({
      eventType: et.key,
      count: et.count,
      pct: deviceTotal ? Math.round((et.count / deviceTotal) * 1000) / 10 : 0,
      sampleKpiId: sampleKpiId("compliance", row.key, et.key),
    }));
    return {
      deviceType: row.key,
      count: deviceTotal,
      pct: Math.round((deviceTotal / total) * 1000) / 10,
      eventTypes,
      sampleKpiId: sampleKpiId("compliance", row.key),
    };
  });

  return {
    total,
    description: COMPLIANCE_DESCRIPTION,
    byEventType,
    byDeviceType,
    sources: {
      total: sourceTotal,
      breakdown: Object.entries(compliance.sources ?? {})
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([source, count]) => ({
          source,
          count,
          pct: sourceTotal ? Math.round((count / sourceTotal) * 1000) / 10 : 0,
          sampleKpiId: sampleKpiId("sources", "compliance", source),
        })),
    },
    emailOptOut,
  };
}
