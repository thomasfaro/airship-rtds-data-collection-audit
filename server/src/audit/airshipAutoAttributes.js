/** Attribute keys starting with ua_ — auto-managed by Airship (locale, timezone, permissions, etc.). */

import { buildAttributeInsights, normalizeAttrKey, valueFingerprint } from "./analyzeInsights.js";
import { AIRSHIP_AUTO_TAG_PREFIX } from "./airshipAutoTags.js";
import { kpiId as sampleKpiId } from "./eventSamples.js";

export function isAirshipAutoAttributeKey(key) {
  const normalized = normalizeAttrKey(key);
  return Boolean(normalized?.startsWith(AIRSHIP_AUTO_TAG_PREFIX));
}

export function createAirshipAttributesAccumulator() {
  return { attributeKeys: {} };
}

function inc(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + amount;
}

/**
 * @param {ReturnType<typeof createAirshipAttributesAccumulator>} acc
 * @param {import("./analyzeInsights.js").AttributeOp} op
 */
export function processAirshipAttributeOp(acc, op, dt, source, event, samples) {
  if (!isAirshipAutoAttributeKey(op.key)) return;

  const normalized = normalizeAttrKey(op.key);
  if (!normalized) return;

  let row = acc.attributeKeys[normalized];
  if (!row) {
    row = {
      count: 0,
      actions: {},
      keyVariants: {},
      byDevice: {},
      sources: { API: 0, SDK: 0, UNKNOWN: 0 },
    };
    acc.attributeKeys[normalized] = row;
  }

  const variantCountBefore = Object.keys(row.keyVariants).length;
  row.count += 1;
  inc(row.actions, op.action);
  inc(row.keyVariants, op.key);
  inc(row.sources, source);

  if (!row.byDevice[dt]) {
    row.byDevice[dt] = { keyVariants: new Set(), valueFingerprints: new Set(), sampleValues: new Set() };
  }
  const dev = row.byDevice[dt];
  dev.keyVariants.add(op.key);
  const fp = valueFingerprint(op.value, op.type);
  if (op.value !== undefined && op.value !== null && dev.sampleValues.size < 4) {
    dev.sampleValues.add(String(op.value).slice(0, 80));
    dev.valueFingerprints.add(fp);
  }

  samples.add(
    sampleKpiId("airship_attrs", "key", normalized, dt),
    `Airship auto attribute: ${op.key} on ${dt}`,
    event,
    {
      description: `ATTRIBUTE_OPERATION on ua_* key "${op.key}" (normalized: ${normalized})`,
      deviceType: dt,
      illustrative: true,
    },
  );
  if (op.key !== normalized || variantCountBefore > 0) {
    samples.add(
      sampleKpiId("airship_attrs", "case", normalized),
      `Airship attribute key case variant: ${op.key}`,
      event,
      {
        note: `key="${op.key}", normalized="${normalized}", device=${dt}`,
        deviceType: dt,
        countTowardDeviceQuota: false,
      },
    );
  }
  if (op.value !== undefined && op.value !== null) {
    samples.add(
      sampleKpiId("airship_attrs", "value", normalized, dt),
      `Airship attribute value on ${dt}: ${op.key}`,
      event,
      {
        note: `fingerprint=${fp}, value=${String(op.value).slice(0, 120)}`,
        deviceType: dt,
        countTowardDeviceQuota: false,
      },
    );
  }
}

export function buildAirshipAutoAttributesReport(acc) {
  const attributeKeys = acc.attributeKeys ?? {};
  const insights = buildAttributeInsights(attributeKeys);
  const totalOperations = Object.values(attributeKeys).reduce((sum, row) => sum + row.count, 0);
  const uniqueKeys = Object.keys(attributeKeys).length;

  const summaryLines = [];
  if (!totalOperations) {
    summaryLines.push("No ua_* attribute operations in this sample.");
  } else {
    summaryLines.push(
      `${totalOperations.toLocaleString()} ua_* attribute operation(s) across ${uniqueKeys} key(s) — auto-managed by Airship.`,
    );
    const top = insights.topKeys[0];
    if (top) {
      summaryLines.push(`Most frequent key: ${top.key} (${top.count.toLocaleString()} operations).`);
    }
  }

  return {
    description:
      "Attribute keys starting with ua_ are set automatically by Airship (named-user locale, timezone, location permission, etc.). They are excluded from the audience attributes table below.",
    prefix: AIRSHIP_AUTO_TAG_PREFIX,
    totalOperations,
    uniqueKeys,
    topKeys: insights.topKeys.map((row) => ({
      ...row,
      sampleKpiId: `airship_attrs.key.${row.normalized}`,
    })),
    caseConflicts: insights.caseConflicts.map((c) => ({
      ...c,
      sampleKpiId: `airship_attrs.case.${c.normalized}`,
    })),
    valueFormatDiffs: insights.valueFormatDiffs.map((c) => ({
      ...c,
      sampleKpiIds: c.devices.map((f) => `airship_attrs.value.${c.normalized}.${f.deviceType}`),
    })),
    summaryLines,
  };
}
