import { useCallback, useState } from "react";
import {
  downloadTaggingPlanJson,
  generateTaggingPlanXlsx,
} from "../../lib/audit/taggingPlanExport.js";
import {
  fetchAttributeValuesPage,
  fetchCustomPropertyValuesPage,
} from "../../services/valuesApi.js";

function progressLabel(progress) {
  if (!progress) return "";
  if (progress.phase === "values") {
    const { done = 0, total = 0 } = progress;
    return total > 0 ? `Collecting values ${done}/${total}…` : "Collecting values…";
  }
  if (progress.phase === "build") return "Building the file…";
  return "Working…";
}

/**
 * The two primary actions of the summary screen. Both formats come from the same
 * exporter, so the .json download carries exactly what the workbook shows.
 */
export default function TaggingPlanDownloads({ report }) {
  const [busyFormat, setBusyFormat] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [lastFile, setLastFile] = useState("");

  const run = useCallback(
    async (format) => {
      setBusyFormat(format);
      setProgress(null);
      setError("");
      setLastFile("");

      const exporter = format === "xlsx" ? generateTaggingPlanXlsx : downloadTaggingPlanJson;
      try {
        const { fileName } = await exporter(report, {
          profileName: report?.meta?.profile ?? null,
          ndjsonFileName: report?.meta?.storage?.sourceFileName ?? null,
          fetchAttributeValues: fetchAttributeValuesPage,
          fetchCustomPropertyValues: fetchCustomPropertyValuesPage,
          onProgress: setProgress,
        });
        setLastFile(fileName);
      } catch (err) {
        setError(err.message || "The export failed");
      } finally {
        setBusyFormat(null);
        setProgress(null);
      }
    },
    [report],
  );

  const busy = Boolean(busyFormat);

  return (
    <section className="card px-4 py-4">
      <h3 className="text-sm font-semibold text-airship-navy">Tagging plan</h3>
      <p className="mt-1 text-xs text-airship-muted">
        Both formats contain the same data: every tracked item with its source, platforms, version
        scope and value histograms.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => run("xlsx")}>
          {busyFormat === "xlsx" ? progressLabel(progress) || "Preparing…" : "Download .xlsx"}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => run("json")}>
          {busyFormat === "json" ? progressLabel(progress) || "Preparing…" : "Download .json"}
        </button>
      </div>

      {lastFile ? (
        <p className="mt-2 text-xs text-teal-700">Saved {lastFile}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </section>
  );
}
