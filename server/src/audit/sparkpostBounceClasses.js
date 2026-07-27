/** SparkPost bounce classification codes — https://support.sparkpost.com/docs/deliverability/bounce-classification-codes */
export const SPARKPOST_BOUNCE_CLASSES = {
  1: {
    name: "Undetermined",
    category: "Undetermined",
    description: "The response text could not be identified.",
  },
  10: {
    name: "Invalid Recipient",
    category: "Hard",
    description: "The recipient is invalid.",
  },
  20: {
    name: "Soft Bounce",
    category: "Soft",
    description: "The message soft bounced.",
  },
  21: {
    name: "DNS Failure",
    category: "Soft",
    description: "The message bounced due to a DNS failure.",
  },
  22: {
    name: "Mailbox Full",
    category: "Soft",
    description: "The message bounced due to the remote mailbox being over quota.",
  },
  23: {
    name: "Too Large",
    category: "Soft",
    description: "The message bounced because it was too large for the recipient.",
  },
  24: {
    name: "Timeout",
    category: "Soft",
    description: "The message timed out.",
  },
  25: {
    name: "Admin Failure",
    category: "Admin",
    description: "The message was failed by SparkPost's configured policies.",
  },
  30: {
    name: "Generic Bounce: No RCPT",
    category: "Hard",
    description: "No recipient could be determined for the message.",
  },
  40: {
    name: "Generic Bounce",
    category: "Soft",
    description: "The message failed for unspecified reasons.",
  },
  50: {
    name: "Mail Block",
    category: "Block",
    description: "The message was blocked by the receiver.",
  },
  51: {
    name: "Spam Block",
    category: "Block",
    description: "The message was blocked by the receiver as coming from a known spam source.",
  },
  52: {
    name: "Spam Content",
    category: "Block",
    description: "The message was blocked by the receiver as spam.",
  },
  53: {
    name: "Prohibited Attachment",
    category: "Block",
    description: "The message was blocked by the receiver because it contained an attachment.",
  },
  54: {
    name: "Relaying Denied",
    category: "Block",
    description: "The message was blocked by the receiver because relaying is not allowed.",
  },
  60: {
    name: "Auto-Reply",
    category: "Soft",
    description: "The message is an auto-reply/vacation mail.",
  },
  70: {
    name: "Transient Failure",
    category: "Soft",
    description: "Message transmission has been temporarily delayed.",
  },
  80: {
    name: "Subscribe",
    category: "Admin",
    description: "The message is a subscribe request.",
  },
  90: {
    name: "Unsubscribe",
    category: "Hard",
    description: "The message is an unsubscribe request.",
  },
  100: {
    name: "Challenge-Response",
    category: "Soft",
    description: "The message is a challenge-response probe.",
  },
};

export function getSparkpostBounceClassMeta(codeKey) {
  const code = Number.parseInt(String(codeKey), 10);
  if (!Number.isFinite(code)) return null;
  return SPARKPOST_BOUNCE_CLASSES[code] ?? null;
}

export function formatSparkpostBounceClassLabel(codeKey) {
  const meta = getSparkpostBounceClassMeta(codeKey);
  if (!meta) return String(codeKey ?? "(missing)");
  const code = Number.parseInt(String(codeKey), 10);
  return `${code} — ${meta.name} (${meta.category})`;
}

export function getSparkpostBounceClassDetail(codeKey) {
  const meta = getSparkpostBounceClassMeta(codeKey);
  if (!meta?.description) return null;
  return `${meta.description} Category: ${meta.category}.`;
}
