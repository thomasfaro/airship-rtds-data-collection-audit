import fs from "node:fs";
import path from "node:path";
import { storedFilesDir } from "../appPaths.js";
import { loadStoredAuditReport, removeStoredAuditReport } from "../audit/storedAuditReport.js";
import { removeAttributeValuesSidecar } from "../audit/attributeValues.js";
import { removeCustomPropertyValuesSidecar } from "../audit/customEventPropertyValues.js";
import { removeEventSamplesSidecar } from "../audit/eventSamplesSidecar.js";
import { resolveCapturePath } from "../storage/resolveCapturePath.js";

const REPORT_SUFFIX = ".audit-report.json";

/** Capture stem (`…​.ndjson`) for a saved report file name. */
function captureNameFromReportFile(reportFileName) {
  return `${reportFileName.slice(0, -REPORT_SUFFIX.length)}.ndjson`;
}

function summarizeReport(report) {
  const rowCount = (rows) => (Array.isArray(rows) ? rows.length : 0);
  const customNames = new Set();
  for (const section of ["sdk", "api", "unknown"]) {
    for (const row of report?.customEvents?.[section]?.top ?? []) {
      if (row?.name) customNames.add(row.name);
    }
  }
  const tagKeys = new Set(
    [...(report?.tags?.topAdded ?? []), ...(report?.tags?.topRemoved ?? [])]
      .map((row) => row?.key)
      .filter(Boolean),
  );
  return {
    customEvents: customNames.size,
    attributes: rowCount(report?.attributes?.topKeys),
    tags: tagKeys.size,
    screens: rowCount(report?.screenViewed?.top),
    subscriptionLists: rowCount(report?.subscriptionLists?.byList),
  };
}

/** List saved analyses, newest first. */
export function listHistoryHandler(_req, res) {
  const dir = storedFilesDir();
  if (!fs.existsSync(dir)) {
    res.json({ ok: true, items: [] });
    return;
  }

  const items = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(REPORT_SUFFIX)) continue;
    const reportPath = path.join(dir, entry.name);
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    } catch {
      continue;
    }
    const report = payload?.report ?? payload;
    if (!report?.meta) continue;

    const stat = fs.statSync(reportPath);
    items.push({
      name: captureNameFromReportFile(entry.name),
      profile: report.meta.profile ?? null,
      savedAt: payload.savedAt ?? new Date(stat.mtimeMs).toISOString(),
      generatedAt: report.meta.generatedAt ?? null,
      timezone: report.meta.timezone ?? null,
      totalEvents: report.meta.totalEvents ?? 0,
      stopMode: report.meta.stopMode ?? (report.meta.realTime ? "realtime" : "manual"),
      startPosition: report.meta.startPosition ?? null,
      autoStopped: Boolean(report.meta.autoStopped),
      processedRange:
        report.meta.downloadHours?.processedRange ??
        report.meta.queryContext?.processedRange ??
        null,
      coverage: summarizeReport(report),
      sizeBytes: stat.size,
    });
  }

  items.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  res.json({ ok: true, items, storageDir: dir });
}

/** Reopen one saved analysis. */
export function getHistoryReportHandler(req, res) {
  const name = String(req.query.name ?? "").trim();
  if (!name) {
    res.status(400).json({ ok: false, error: "name query param is required" });
    return;
  }

  try {
    const { filePath } = resolveCapturePath(name);
    const stored = loadStoredAuditReport(filePath);
    if (!stored) {
      res.status(404).json({ ok: false, error: "Saved analysis not found" });
      return;
    }
    res.json({ ok: true, report: stored.report, savedAt: stored.savedAt });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Failed to open the analysis" });
  }
}

/** Delete one saved analysis and every sidecar keyed on the same stem. */
export function deleteHistoryItemHandler(req, res) {
  const name = String(req.query.name ?? req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ ok: false, error: "name is required" });
    return;
  }

  try {
    const { filePath } = resolveCapturePath(name);
    removeStoredAuditReport(filePath);
    removeAttributeValuesSidecar(filePath);
    removeCustomPropertyValuesSidecar(filePath);
    removeEventSamplesSidecar(filePath);
    res.json({ ok: true, deleted: name });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Failed to delete the analysis" });
  }
}
