import { CAMPAIGN_CATEGORY_EVENT_TYPES } from "../config.js";
import { filterConnectEventTypes } from "../rtdsConnectTypes.js";

export function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function campaignCategoryPredicate(categories) {
  if (!categories.length) return null;
  const predicates = categories.map((category) => ({
    scope: ["body", "campaigns"],
    key: "categories",
    value: {
      array_contains: {
        value: { equals: category },
      },
    },
  }));
  return predicates.length === 1 ? predicates[0] : { or: predicates };
}

function attributeKeyPredicate(attributeKey) {
  if (!attributeKey) return null;
  return {
    scope: ["body"],
    key: "attribute",
    value: { equals: attributeKey },
  };
}

function buildSharedConstraints(query) {
  const requestedTypes = splitCsv(query.types);
  const { valid: eventTypes, dropped: droppedTypes } = filterConnectEventTypes(requestedTypes);
  const campaignCategories = splitCsv(query.campaign_category);
  const deviceTypes = splitCsv(query.device_types).map((value) => value.toLowerCase());

  const shared = {};
  if (eventTypes.length) {
    shared.types = eventTypes;
  } else if (campaignCategories.length) {
    shared.types = CAMPAIGN_CATEGORY_EVENT_TYPES;
  }
  if (deviceTypes.length) {
    shared.device_types = deviceTypes;
  }
  if (query.latency) {
    shared.latency = Number.parseInt(query.latency, 10);
  }

  return { shared, droppedTypes, requestedTypes, campaignCategories };
}

/** One RTDS filter per audience value — combined with OR via multiple `filters[]` entries. */
function buildAudienceBranches(query) {
  const branches = [];

  for (const namedUserId of splitCsv(query.named_user)) {
    branches.push({ users: [{ named_user_id: namedUserId }] });
  }
  for (const channel of splitCsv(query.channel)) {
    branches.push({ devices: [{ channel }] });
  }
  for (const pushId of splitCsv(query.push_id)) {
    branches.push({ notifications: { push_id: pushId } });
  }
  for (const category of splitCsv(query.campaign_category)) {
    branches.push({ predicates: [campaignCategoryPredicate([category])] });
  }
  for (const attributeKey of splitCsv(query.attribute_key)) {
    branches.push({
      types: ["ATTRIBUTE_OPERATION"],
      predicates: [attributeKeyPredicate(attributeKey)],
    });
  }

  return branches;
}

function mergeBranch(shared, branch, { campaignCategories }) {
  const filter = { ...shared, ...branch };

  if (branch.predicates && !filter.types && campaignCategories.length) {
    filter.types = CAMPAIGN_CATEGORY_EVENT_TYPES;
  }

  return filter;
}

export function buildRtdsBody(query) {
  const { shared, droppedTypes, requestedTypes, campaignCategories } = buildSharedConstraints(query);
  const audienceBranches = buildAudienceBranches(query);

  let filters;
  if (audienceBranches.length === 0) {
    filters = Object.keys(shared).length ? [{ ...shared }] : [];
  } else {
    filters = audienceBranches.map((branch) => mergeBranch(shared, branch, { campaignCategories }));
  }

  const body = { start: query.start || "LATEST" };
  if (filters.length) {
    body.filters = filters;
  }
  return { body, droppedTypes, requestedTypes };
}
