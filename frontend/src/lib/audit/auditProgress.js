/** Progress band endpoints (percent). Post-scan work gets most of the bar on large files. */
const BANDS = {
  analyze: [0, 45],
  finalize: [45, 52],
  enrichReleases: [52, 55],
  enrichSdk: [55, 62],
  enrichWarnings: [62, 65],
  enrichBackfill: [65, 92],
  enrichSidecars: [92, 96],
  enrichSummary: [96, 99],
  packaging: [99, 100],
};

function lerp([from, to], t) {
  const clamped = Math.min(1, Math.max(0, t));
  return from + (to - from) * clamped;
}

function analyzeFraction(progress) {
  const processed = progress.linesProcessed ?? 0;
  const total = progress.totalLines;
  if (total > 0) return processed / total;
  return Math.min(1, Math.sqrt(processed / 50_000));
}

function backfillFraction(progress) {
  const total = progress.totalLines;
  const processed = progress.linesProcessed ?? 0;
  if (total > 0) return processed / total;
  return Math.min(1, Math.sqrt(processed / 50_000));
}

/** Weighted audit progress (scan + enrichment + backfill second pass). */
export function auditProgressPercent(progress) {
  if (!progress?.phase) return 0;

  switch (progress.phase) {
    case "analyze": {
      if (progress.done) return BANDS.finalize[0];
      return Math.round(lerp(BANDS.analyze, analyzeFraction(progress)));
    }
    case "finalize":
      return BANDS.finalize[1];
    case "enrich": {
      switch (progress.step) {
        case "releases":
          return BANDS.enrichReleases[1];
        case "sdk_versions":
          return BANDS.enrichSdk[1];
        case "warnings":
          return BANDS.enrichWarnings[1];
        case "backfill":
          return Math.round(lerp(BANDS.enrichBackfill, backfillFraction(progress)));
        case "sidecars":
          return BANDS.enrichSidecars[1];
        case "summary":
          return BANDS.enrichSummary[1];
        /** @deprecated legacy step id */
        case "compute":
          return BANDS.enrichBackfill[0];
        default:
          return BANDS.enrichReleases[1];
      }
    }
    case "packaging":
      return BANDS.packaging[1];
    case "complete":
      return 100;
    default:
      return 0;
  }
}

export function auditProgressStatusText(progress) {
  if (!progress?.phase) return null;

  switch (progress.phase) {
    case "analyze":
      if (progress.done) return "Building report aggregates…";
      {
        const processed = progress.linesProcessed?.toLocaleString("en-US") ?? "0";
        const total = progress.totalLines?.toLocaleString("en-US");
        return total
          ? `Scanning capture file… ${processed} / ${total} events`
          : `Scanning capture file… ${processed} events`;
      }
    case "finalize":
      return "Aggregating metrics by device, custom events, attributes…";
    case "enrich": {
      switch (progress.step) {
        case "releases":
          return "Loading SDK release metadata…";
        case "sdk_versions":
          return "Matching SDK and app versions to release dates…";
        case "warnings":
          return "Computing audit warnings…";
        case "backfill": {
          const processed = progress.linesProcessed?.toLocaleString("en-US") ?? "0";
          const total = progress.totalLines?.toLocaleString("en-US");
          return total
            ? `Collecting warning example events… ${processed} / ${total} lines`
            : `Collecting warning example events… ${processed} lines scanned`;
        }
        case "sidecars":
          return "Writing attribute and custom-event value indexes…";
        case "summary":
          return "Building executive summary…";
        case "compute":
          return "Computing warnings and executive summary…";
        default:
          return "Enriching report…";
      }
    }
    case "packaging":
      return "Preparing report for display…";
    case "complete":
      return "Opening report…";
    default:
      return null;
  }
}

/** True when no line-based estimate exists (short indeterminate pulse). */
export function auditProgressIsIndeterminate(progress) {
  if (!progress) return false;
  if (progress.phase === "analyze" && progress.done && !progress.totalLines) return true;
  if (progress.phase === "finalize") return true;
  if (progress.phase === "enrich") {
    const stepped = ["releases", "sdk_versions", "warnings", "sidecars", "summary", "compute"];
    if (stepped.includes(progress.step)) return true;
    if (progress.step === "backfill" && !(progress.totalLines > 0)) return true;
    return false;
  }
  if (progress.phase === "packaging" || progress.phase === "complete") return true;
  return false;
}

export function auditProgressStepLabel(progress) {
  const text = auditProgressStatusText(progress);
  if (!text) return null;
  const pct = auditProgressPercent(progress);
  return `${pct}% — ${text}`;
}
