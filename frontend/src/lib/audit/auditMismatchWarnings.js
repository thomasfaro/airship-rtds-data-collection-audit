/** Warnings shown in Warnings & mismatches (excludes capture-file parse/process noise). */

export const CAPTURE_FILE_DISPLAY_THRESHOLD = 10;

export const CAPTURE_QUALITY_CATEGORY = "parse_errors";

export function isCaptureQualityWarning(warning) {
  return warning?.category === CAPTURE_QUALITY_CATEGORY;
}

export function filterMismatchWarnings(warnings) {
  return (warnings ?? []).filter((warning) => !isCaptureQualityWarning(warning));
}

export function auditMismatchWarnings(report) {
  const warnings = report?.executiveSummary?.warnings ?? report?.auditWarnings ?? [];
  return filterMismatchWarnings(warnings);
}

export function buildCaptureFileInfo(meta) {
  const parseErrors = meta?.parseErrors ?? 0;
  const processErrors = meta?.processErrors ?? 0;
  const skippedLines = meta?.skippedLines ?? parseErrors + processErrors;
  const samples = meta?.lineErrorSamples ?? [];

  return {
    parseErrors,
    processErrors,
    skippedLines,
    samples,
    hasIssues: skippedLines > CAPTURE_FILE_DISPLAY_THRESHOLD,
  };
}
