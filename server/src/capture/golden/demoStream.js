/**
 * An invented retail app, served as the NDJSON an RTDS connection would return.
 *
 * Two callers need a capture that repeats exactly and cannot contain client data: the
 * documentation screenshots, and the golden report every refactor of the engine is
 * judged against. One invented app for both, so a screenshot and a golden always
 * describe the same fictional client.
 */

const CUSTOM_EVENTS = [
  { name: "product_viewed", weight: 24, props: { sku: "SKU-8842", category: "sneakers", price: 89.9, currency: "EUR" } },
  { name: "add_to_cart", weight: 14, props: { sku: "SKU-8842", quantity: 1, price: 89.9, currency: "EUR" } },
  { name: "search_performed", weight: 11, props: { term: "running shoes", results: 42 } },
  { name: "wishlist_added", weight: 7, props: { sku: "SKU-1190", list: "summer" } },
  { name: "checkout_started", weight: 6, props: { cart_value: 149.8, items: 2, currency: "EUR" } },
  { name: "purchase", weight: 5, props: { order_id: "ORD-77120", value: 149.8, currency: "EUR", items: 2, payment: "card", first_order: true } },
  // first_order in quotes, on purpose: shows up as a boolean sent as text, and as a
  // property typed differently from purchase's.
  { name: "promo_applied", weight: 4, props: { code: "SUMMER20", discount: 20, first_order: "true" } },
  { name: "store_locator_used", weight: 3, props: { city: "Lyon", results: 6 } },
  { name: "review_submitted", weight: 2, props: { sku: "SKU-8842", rating: 4 } },
  { name: "loyalty_card_scanned", weight: 2, props: { store_id: "FR-0142" } },
  { name: "delivery_tracked", weight: 2, props: { order_id: "ORD-77120", carrier: "colissimo" } },
  { name: "size_guide_opened", weight: 1, props: { category: "sneakers" } },
  // Android only, on purpose: shows up as a platform gap in the summary.
  { name: "android_widget_tapped", weight: 1, props: { widget: "last_order" }, platforms: ["ANDROID"] },
  // Only ever seen on an old build: shows up as potentially obsolete.
  { name: "legacy_wallet_opened", weight: 1, props: { source: "menu" }, versions: ["2.9.4"] },
];

const SCREENS = [
  ["home", 26],
  ["product_detail", 22],
  ["category_list", 16],
  ["cart", 12],
  ["checkout", 8],
  ["account", 8],
  ["store_locator", 5],
  ["order_history", 3],
];

const ATTRIBUTES = [
  ["loyalty_tier", "gold", "text", 20],
  ["city", "Lyon", "text", 16],
  ["first_name", "Camille", "text", 12],
  ["birthdate", "1991-04-18", "date", 9],
  ["favourite_category", "sneakers", "text", 9],
  ["shoe_size", 42, "number", 7],
  ["newsletter_optin", "true", "text", 6],
  ["last_order_value", 149.8, "number", 5],
  ["preferred_store", "FR-0142", "text", 4],
  // Airship's own key: the report keeps these out of the client's plan.
  ["ua_country", "FR", "text", 3],
];

const TAGS = [
  ["vip", 18],
  ["newsletter", 16],
  ["sneakers_lover", 14],
  ["cart_abandoner", 12],
  ["loyalty_member", 10],
  ["push_optin", 9],
  ["store_lyon", 7],
  ["beta_tester", 3],
];

const LISTS = [
  ["promotions", 34],
  ["new_arrivals", 26],
  ["back_in_stock", 22],
  ["store_events", 18],
];

const PLATFORMS = [
  ["IOS", 54],
  ["ANDROID", 42],
  ["WEB", 4],
];

const VERSIONS = [
  ["3.2.1", 62],
  ["3.2.0", 26],
  ["3.1.0", 10],
  ["2.9.4", 2],
];

const TYPES = [
  ["CUSTOM", 46],
  ["SCREEN_VIEWED", 30],
  ["ATTRIBUTE_OPERATION", 12],
  ["TAG_CHANGE", 8],
  ["SUBSCRIPTION_LIST", 4],
];

/**
 * Enough events for the real-time stop to fire on its own, which is what the summary
 * screenshot then reports. Every key is introduced inside the discovery slice; after
 * it coverage plateaus, which is the state the real-time stop waits for.
 */
export const DEMO_STREAM_DEFAULTS = {
  totalEvents: 1_250_000,
  discoveryEvents: 90_000,
  seed: 20260729,
  spanMs: 4 * 60 * 60 * 1_000,
  startMs: Date.parse("2026-07-28T06:00:00.000Z"),
};

export function createDemoNdjsonStream(options = {}) {
  const { totalEvents, discoveryEvents, seed, spanMs, startMs } = {
    ...DEMO_STREAM_DEFAULTS,
    ...options,
  };

  let state = seed;
  function random() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  }

  function pickWeighted(entries) {
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let target = random() * total;
    for (const entry of entries) {
      target -= entry[1];
      if (target <= 0) return entry[0];
    }
    return entries[entries.length - 1][0];
  }

  function deviceFor(platform, version, index, type) {
    // A CRM pushing profile data through the API is the common mixed-source case, so
    // only attribute writes arrive without a channel — that is what the report reads as
    // API-fed, and what puts both badges on the attribute rows.
    const apiFed = type === "ATTRIBUTE_OPERATION" && index % 3 === 0;
    const device = {
      device_type: platform,
      attributes: { app_version: version },
    };
    if (apiFed) {
      device.named_user_id = `named-${index % 5_000}`;
    } else {
      device.channel = `channel-${index % 20_000}`;
    }
    return device;
  }

  function bodyFor(type, index, discovering) {
    if (type === "CUSTOM") {
      const pool = discovering ? CUSTOM_EVENTS : CUSTOM_EVENTS.slice(0, 12);
      const event = pickWeighted(pool.map((entry) => [entry, entry.weight]));
      return { event, body: { name: event.name, properties: event.props } };
    }
    if (type === "SCREEN_VIEWED") {
      return { body: { viewed_screen: pickWeighted(SCREENS) } };
    }
    if (type === "ATTRIBUTE_OPERATION") {
      const row = ATTRIBUTES[Math.floor(random() * (discovering ? ATTRIBUTES.length : 9))];
      return { body: { set: [{ key: row[0], value: row[1], type: row[2] }] } };
    }
    if (type === "TAG_CHANGE") {
      const tag = pickWeighted(TAGS);
      return random() < 0.8
        ? { body: { add: { device: [tag] } } }
        : { body: { remove: { device: [tag] } } };
    }
    const list = pickWeighted(LISTS);
    return random() < 0.85
      ? { body: { enrolled: [list], scope: "APP" } }
      : { body: { canceled: [list], scope: "APP" } };
  }

  function eventLine(index) {
    const discovering = index < discoveryEvents;
    const type = pickWeighted(TYPES);
    const { event: custom, body } = bodyFor(type, index, discovering);

    let platform = pickWeighted(PLATFORMS);
    let version = pickWeighted(VERSIONS);
    if (custom?.platforms) platform = custom.platforms[0];
    if (custom?.versions) version = custom.versions[0];

    const processed = startMs + Math.floor((index / totalEvents) * spanMs);
    return JSON.stringify({
      id: `demo-${index}`,
      offset: String(index + 1),
      type,
      occurred: new Date(processed - 1_500).toISOString(),
      processed: new Date(processed).toISOString(),
      device: deviceFor(platform, version, index, type),
      body,
    });
  }

  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= totalEvents) {
        controller.close();
        return;
      }
      const lines = [];
      const end = Math.min(index + 5_000, totalEvents);
      for (; index < end; index += 1) {
        lines.push(eventLine(index));
      }
      controller.enqueue(new TextEncoder().encode(`${lines.join("\n")}\n`));
    },
  });
}
