/** Highlight field names and values inside audit warning messages. */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quotedStrings(text) {
  const out = [];
  for (const match of String(text ?? "").matchAll(/"([^"]+)"/g)) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

const SDK_VERSION_RE = /\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/g;

/**
 * Collect substrings that should render bold in a warning card.
 * @param {string | object} warning
 * @returns {string[]}
 */
export function warningMessageHighlights(warning) {
  if (!warning) return [];
  if (typeof warning === "string") return quotedStrings(warning);

  const highlights = new Set();
  const add = (value) => {
    if (value == null) return;
    const text = String(value).trim();
    if (text) highlights.add(text);
  };

  const message = warning.message ?? "";

  add(warning.name);
  add(warning.screen);
  add(warning.key);
  add(warning.normalized);
  add(warning.label);
  add(warning.iosVersion);
  add(warning.androidVersion);
  add(warning.version);
  add(warning.deviceType);
  (warning.onlyOnA ?? []).forEach(add);
  (warning.onlyOnB ?? []).forEach(add);

  quotedStrings(message).forEach((segment) => highlights.add(segment));

  if (warning.category?.startsWith("sdk_") || warning.category === "sdk_major_cross_platform") {
    for (const match of message.matchAll(SDK_VERSION_RE)) {
      add(match[0]);
    }
    for (const match of message.matchAll(/\(major (\d+)\)/g)) {
      add(match[1]);
    }
  }

  return [...highlights].sort((a, b) => b.length - a.length);
}

/**
 * Split a message into plain and bold segments.
 * @param {string} message
 * @param {string[]} highlights
 * @returns {{ text: string, bold: boolean }[]}
 */
export function splitMessageWithHighlights(message, highlights) {
  const text = String(message ?? "");
  const terms = [...new Set((highlights ?? []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!text || !terms.length) return [{ text, bold: false }];

  const re = new RegExp(terms.map(escapeRegExp).join("|"), "g");
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(re)) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[0], bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }

  return parts.length ? parts : [{ text, bold: false }];
}
