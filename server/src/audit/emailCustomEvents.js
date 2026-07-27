import {
  addToSetMap,
  comparePropertySetsByDevice,
  extractCustomPropertyKeys,
  setMapToArrays,
} from "./analyzeInsights.js";
import { kpiId as sampleKpiId } from "./eventSamples.js";
import {
  buildEmailFeedbackDimensions,
  trackEmailFeedbackBreakdowns,
} from "./emailFeedbackBreakdowns.js";

/** CUSTOM events on EMAIL channel — email send feedback (mirror frontend customEmailRegistry + opt_in). */
export const EMAIL_FEEDBACK_CUSTOM_NAMES = new Set([
  "injection",
  "delivery",
  "click",
  "delay",
  "open",
  "initial_open",
  "unsubscribe",
  "bounce",
  "spam_complaint",
  "opt_in",
]);

export const EMAIL_FEEDBACK_META = {
  injection: {
    label: "Injection",
    order: 1,
    category: "pipeline",
    help: "Email accepted by Airship for sending (handoff to the mail pipeline).",
  },
  delivery: {
    label: "Delivery",
    order: 2,
    category: "pipeline",
    help: "Email successfully delivered to the recipient mailbox (ESP confirmed delivery).",
  },
  delay: {
    label: "Delay",
    order: 3,
    category: "pipeline",
    help: "Delivery delayed (retry/deferral by the mailbox provider).",
  },
  initial_open: {
    label: "Initial open",
    order: 4,
    category: "engagement",
    help: "First open of this message by the recipient (unique open signal).",
  },
  open: {
    label: "Open",
    order: 5,
    category: "engagement",
    help: "Subsequent or generic open tracking pixel fired.",
  },
  click: {
    label: "Click",
    order: 6,
    category: "engagement",
    help: "Recipient clicked a tracked link in the email.",
  },
  bounce: {
    label: "Bounce",
    order: 7,
    category: "negative",
    help: "Delivery failed (hard/soft bounce) — address or content rejected.",
  },
  unsubscribe: {
    label: "Unsubscribe",
    order: 8,
    category: "negative",
    help: "Recipient unsubscribed from email communications.",
  },
  spam_complaint: {
    label: "Spam complaint",
    order: 9,
    category: "negative",
    help: "Recipient reported the message as spam (complaint feedback from the mailbox provider).",
  },
  opt_in: {
    label: "Opt-in",
    order: 10,
    category: "compliance",
    help: "Opt-in / registration signal tied to email channel compliance.",
  },
};

export function normalizeEmailCustomName(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function isEmailFeedbackCustomEvent(event) {
  if (String(event?.type ?? "").toUpperCase() !== "CUSTOM") return false;
  if (String(event?.device?.device_type ?? "").toUpperCase() !== "EMAIL") return false;
  return EMAIL_FEEDBACK_CUSTOM_NAMES.has(normalizeEmailCustomName(event?.body?.name));
}

export function createEmailFeedbackAccumulator() {
  return { byName: {} };
}

function inc(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + amount;
}

function trackEmailProperties(bucket, body) {
  const props = body?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return;
  if (!bucket.propertyStats) bucket.propertyStats = {};
  for (const [key, value] of Object.entries(props)) {
    if (!bucket.propertyStats[key]) {
      bucket.propertyStats[key] = { count: 0, sampleValues: new Set() };
    }
    const row = bucket.propertyStats[key];
    row.count += 1;
    if (row.sampleValues.size < 5 && value != null && value !== "") {
      row.sampleValues.add(String(value).slice(0, 120));
    }
  }
}

/**
 * Process one email-feedback CUSTOM event (call only when isEmailFeedbackCustomEvent).
 */
export function processEmailFeedbackCustomEvent(acc, event, dt) {
  const name = normalizeEmailCustomName(event.body?.name);
  const body = event.body ?? {};

  if (!acc.byName[name]) {
    acc.byName[name] = {
      count: 0,
      byDevice: {},
      propertiesByDevice: {},
      propertyStats: {},
      messageTypes: {},
      sources: {},
    };
  }
  const bucket = acc.byName[name];
  bucket.count += 1;
  inc(bucket.byDevice, dt);
  trackEmailProperties(bucket, body);

  const msgType = body.properties?.message_type ?? body.properties?.sent_as;
  if (msgType != null && msgType !== "") inc(bucket.messageTypes, String(msgType));

  for (const prop of extractCustomPropertyKeys(body)) {
    addToSetMap(bucket.propertiesByDevice, dt, prop);
  }

  trackEmailFeedbackBreakdowns(bucket, name, body);
}

function funnelRate(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function buildEmailFeedbackReport(emailAcc) {
  const rows = [...EMAIL_FEEDBACK_CUSTOM_NAMES]
    .map((name) => {
      const data = emailAcc.byName[name];
      const meta = EMAIL_FEEDBACK_META[name];
      if (!data) {
        return {
          name,
          label: meta.label,
          order: meta.order,
          category: meta.category,
          help: meta.help,
          count: 0,
          present: false,
        };
      }

      const propertiesByDevice = setMapToArrays(data.propertiesByDevice ?? {});
      const propertyDiffs = comparePropertySetsByDevice(propertiesByDevice);

      const topProperties = Object.entries(data.propertyStats ?? {})
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 12)
        .map(([key, row]) => ({
          key,
          count: row.count,
          sampleValues: [...row.sampleValues],
        }));

      const messageTypes = Object.entries(data.messageTypes ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count }));

      const byDeviceBreakdown = Object.entries(data.byDevice ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([deviceType, count]) => ({
          deviceType,
          count,
          sampleKpiId: sampleKpiId("email_custom", name, deviceType),
        }));
      const sampleKpiIds = byDeviceBreakdown.map((d) => d.sampleKpiId).filter(Boolean);
      const dimensions = buildEmailFeedbackDimensions(name, data, data.count);

      return {
        name,
        label: meta.label,
        order: meta.order,
        category: meta.category,
        help: meta.help,
        count: data.count,
        present: true,
        byDevice: data.byDevice,
        byDeviceBreakdown,
        propertiesByDevice,
        propertyDiffs,
        topProperties,
        messageTypes,
        dimensions,
        sampleKpiIds,
        sampleKpiId: sampleKpiIds[0] ?? sampleKpiId("email_custom", name, "EMAIL"),
      };
    })
    .sort((a, b) => a.order - b.order);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const withPct = rows.map((row) => ({
    ...row,
    pctOfEmailFeedback: total ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));

  const count = (name) => emailAcc.byName[name]?.count ?? 0;
  const injection = count("injection");
  const delivery = count("delivery");
  const initialOpens = count("initial_open");
  const clicks = count("click");
  const bounces = count("bounce");
  const unsubs = count("unsubscribe");
  const spamComplaints = count("spam_complaint");

  const byCategory = {
    pipeline: withPct.filter((r) => r.category === "pipeline"),
    engagement: withPct.filter((r) => r.category === "engagement"),
    negative: withPct.filter((r) => r.category === "negative"),
    compliance: withPct.filter((r) => r.category === "compliance"),
  };

  const metrics = {
    deliveryPerInjectionPct: funnelRate(delivery, injection),
    initialOpenPerDeliveryPct: funnelRate(initialOpens, delivery),
    clickPerInitialOpenPct: funnelRate(clicks, initialOpens),
    bouncePerInjectionPct: funnelRate(bounces, injection),
    unsubscribePerDeliveryPct: funnelRate(unsubs, delivery),
  };

  return {
    description:
      "Email send feedback reported as CUSTOM events on the EMAIL channel (post-send lifecycle: injection → delivery → engagement → bounces/unsubs).",
    total,
    eventsPresent: withPct.filter((r) => r.present && r.count > 0).length,
    funnel: withPct,
    byCategory,
    metrics,
    summaryLines: buildEmailSummaryLines({
      total,
      injection,
      delivery,
      initialOpens,
      clicks,
      bounces,
      unsubs,
      spamComplaints,
      metrics,
    }),
  };
}

function buildEmailSummaryLines({
  total,
  injection,
  delivery,
  initialOpens,
  clicks,
  bounces,
  unsubs,
  spamComplaints,
  metrics,
}) {
  if (!total) return ["No email send-feedback custom events in this sample."];
  const lines = [`${total.toLocaleString()} email feedback custom event(s) on EMAIL channel.`];
  if (injection) lines.push(`Pipeline: ${injection.toLocaleString()} injection → ${delivery.toLocaleString()} delivery${metrics.deliveryPerInjectionPct != null ? ` (${metrics.deliveryPerInjectionPct}% delivery/injection)` : ""}.`);
  if (delivery && initialOpens) {
    lines.push(
      `Engagement: ${initialOpens.toLocaleString()} initial open(s)${metrics.initialOpenPerDeliveryPct != null ? ` (${metrics.initialOpenPerDeliveryPct}% of deliveries)` : ""}, ${clicks.toLocaleString()} click(s)${metrics.clickPerInitialOpenPct != null ? ` (${metrics.clickPerInitialOpenPct}% of initial opens)` : ""}.`,
    );
  }
  if (bounces || unsubs || spamComplaints) {
    const parts = [];
    if (bounces) parts.push(`${bounces.toLocaleString()} bounce(s)`);
    if (unsubs) parts.push(`${unsubs.toLocaleString()} unsubscribe(s)`);
    if (spamComplaints) parts.push(`${spamComplaints.toLocaleString()} spam complaint(s)`);
    lines.push(`Negative: ${parts.join(", ")}.`);
  }
  return lines;
}
