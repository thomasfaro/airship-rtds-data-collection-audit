import fs from "node:fs";
import path from "node:path";
import { safeJsonStringify, shrinkAuditReportForTransport } from "./reportJson.js";

export function storedAuditReportPath(ndjsonPath) {
  if (!ndjsonPath) return null;
  const base = String(ndjsonPath);
  if (base.endsWith(".ndjson")) {
    return `${base.slice(0, -".ndjson".length)}.audit-report.json`;
  }
  return `${base}.audit-report.json`;
}

export function storedAuditReportExists(ndjsonPath) {
  const reportPath = storedAuditReportPath(ndjsonPath);
  if (!reportPath) return false;
  try {
    return fs.statSync(reportPath).isFile();
  } catch {
    return false;
  }
}

export function storedAuditReportStat(ndjsonPath) {
  const reportPath = storedAuditReportPath(ndjsonPath);
  if (!reportPath) return null;
  try {
    const stat = fs.statSync(reportPath);
    if (!stat.isFile()) return null;
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

/** Attach NDJSON basename + file stats so the UI can load attribute/custom-property sidecars. */
export function applyNdjsonSourceMeta(report, ndjsonPath) {
  if (!report || !ndjsonPath) return report;
  const sourceName = path.basename(ndjsonPath);
  let sourceStat = null;
  try {
    sourceStat = fs.statSync(ndjsonPath);
  } catch {
    // ignore
  }
  report.meta = {
    ...(report.meta ?? {}),
    storage: {
      ...(report.meta?.storage ?? {}),
      sourceFileName: sourceName,
      sourceFileMtimeMs: sourceStat?.mtimeMs ?? null,
      sourceFileBytes: sourceStat?.size ?? report.meta?.storage?.sourceFileBytes ?? null,
    },
  };
  return report;
}

function enrichReportForStorage(report, ndjsonPath) {
  const reportPath = storedAuditReportPath(ndjsonPath);
  applyNdjsonSourceMeta(report, ndjsonPath);
  report.meta.storage = {
    ...(report.meta.storage ?? {}),
    storedReportFile: reportPath ? path.basename(reportPath) : null,
  };
  return report;
}

/** Persist audit report JSON next to the NDJSON capture. */
export function persistStoredAuditReport(ndjsonPath, report) {
  const reportPath = storedAuditReportPath(ndjsonPath);
  if (!reportPath || !report) return null;

  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    report: enrichReportForStorage(report, ndjsonPath),
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tmpPath = `${reportPath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, safeJsonStringify(payload), "utf8");
  } catch (error) {
    if (error?.code !== "REPORT_TOO_LARGE") throw error;
    const shrunkReport = shrinkAuditReportForTransport(payload.report);
    const shrunkPayload = {
      ...payload,
      report: {
        ...shrunkReport,
        meta: {
          ...(shrunkReport.meta ?? {}),
          storage: {
            ...(shrunkReport.meta?.storage ?? {}),
            reportShrunkOnPersist: true,
          },
        },
      },
    };
    fs.writeFileSync(tmpPath, safeJsonStringify(shrunkPayload), "utf8");
  }
  fs.renameSync(tmpPath, reportPath);
  return path.basename(reportPath);
}

export function isStoredAuditReportStale(ndjsonPath, savedReport) {
  try {
    const current = fs.statSync(ndjsonPath);
    const savedMtime = savedReport?.meta?.storage?.sourceFileMtimeMs;
    if (savedMtime == null) return false;
    return current.mtimeMs !== savedMtime || current.size !== savedReport?.meta?.storage?.sourceFileBytes;
  } catch {
    return true;
  }
}

/** Load persisted report; returns null if missing or invalid. */
export function loadStoredAuditReport(ndjsonPath) {
  const reportPath = storedAuditReportPath(ndjsonPath);
  if (!reportPath || !fs.existsSync(reportPath)) return null;

  const raw = fs.readFileSync(reportPath, "utf8");
  const parsed = JSON.parse(raw);
  const report = parsed?.report ?? parsed;
  if (!report || typeof report !== "object") return null;

  const stale = isStoredAuditReportStale(ndjsonPath, report);
  return {
    report,
    savedAt: parsed.savedAt ?? null,
    stale,
  };
}

export function removeStoredAuditReport(ndjsonPath) {
  const reportPath = storedAuditReportPath(ndjsonPath);
  if (!reportPath) return;
  try {
    fs.unlinkSync(reportPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    fs.unlinkSync(`${reportPath}.tmp`);
  } catch {
    // ignore
  }
}
