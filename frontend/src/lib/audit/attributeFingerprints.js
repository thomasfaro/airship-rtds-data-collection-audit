/** Human-readable labels for server value fingerprints (audit attribute value diff). */
export function fingerprintLabel(fp) {
  const labels = {
    empty: "empty",
    number: "number",
    "numeric-string": "numeric (string)",
    numeric: "numeric",
    text: "text",
    "lowercase-text": "text",
    "mixed-case-text": "text",
    "uppercase-text": "text",
  };
  return labels[fp] ?? fp;
}

export function formatCompareFingerprints(compareFingerprints, rawFingerprints) {
  const list = compareFingerprints?.length ? compareFingerprints : rawFingerprints;
  if (!list?.length) return "—";
  return [...new Set(list.map(fingerprintLabel))].join(", ");
}
