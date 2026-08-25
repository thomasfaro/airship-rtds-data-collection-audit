import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import CoverageSummary from "../components/summary/CoverageSummary.jsx";
import { hydrateAuditReport } from "../lib/audit/hydrateAuditReport.js";
import {
  deleteHistoryItem,
  downloadHistoryRaw,
  fetchHistory,
  fetchHistoryReport,
} from "../services/historyApi.js";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function coverageLabel(coverage) {
  if (!coverage) return "—";
  const parts = [
    [coverage.customEvents, "events"],
    [coverage.attributes, "attributes"],
    [coverage.tags, "tags"],
    [coverage.screens, "screens"],
    [coverage.subscriptionLists, "lists"],
  ].filter(([count]) => count > 0);
  return parts.length ? parts.map(([count, label]) => `${count} ${label}`).join(" · ") : "no keys";
}

function isLiveItem(item) {
  return item?.kind === "live";
}

function HistoryRow({ item, onOpen, onDownload, onDelete, opening, downloading }) {
  const live = isLiveItem(item);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-airship-navy">{item.profile ?? item.name}</p>
        <p className="text-xs text-airship-muted">
          {formatDateTime(item.savedAt)} · {(item.totalEvents ?? 0).toLocaleString("en-US")} events
          {live
            ? ` · ${formatBytes(item.sizeBytes)}`
            : ` · ${item.processedRange?.spanLabel ?? "unknown span"}`}
        </p>
        {live ? (
          <p className="truncate font-mono text-xs text-airship-muted">{item.name}</p>
        ) : (
          <p className="text-xs text-airship-muted">{coverageLabel(item.coverage)}</p>
        )}
      </div>
      {live ? (
        <span className="badge-seafoam">Live</span>
      ) : (
        <span className="badge-blue">
          {item.stopMode === "realtime" ? (item.autoStopped ? "auto-stopped" : "real-time") : "manual"}
        </span>
      )}
      {live ? (
        <button type="button" className="btn-secondary" onClick={onDownload} disabled={downloading}>
          {downloading ? "Downloading…" : "Download"}
        </button>
      ) : (
        <button type="button" className="btn-secondary" onClick={onOpen} disabled={opening}>
          {opening ? "Opening…" : "Open"}
        </button>
      )}
      <button
        type="button"
        className="text-sm font-medium text-airship-danger hover:underline"
        onClick={onDelete}
      >
        Delete
      </button>
    </li>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingName, setOpeningName] = useState("");
  const [downloadingName, setDownloadingName] = useState("");
  const [opened, setOpened] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchHistory();
      setItems(payload.items ?? []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const open = async (item) => {
    setOpeningName(item.name);
    setError("");
    try {
      const payload = await fetchHistoryReport({ name: item.name });
      const report = await hydrateAuditReport(payload.report);
      setOpened({ report, savedAt: payload.savedAt });
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningName("");
    }
  };

  const download = async (item) => {
    setDownloadingName(item.name);
    setError("");
    try {
      await downloadHistoryRaw({ name: item.name });
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingName("");
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteHistoryItem({ name: pendingDelete.name });
      setPendingDelete(null);
      if (opened?.report?.meta?.storage?.sourceFileName === pendingDelete.name) setOpened(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (opened) {
    return (
      <CoverageSummary
        report={opened.report}
        savedAt={opened.savedAt}
        onNewCapture={() => setOpened(null)}
      />
    );
  }

  const pendingLive = isLiveItem(pendingDelete);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-airship-navy">History</h1>
        <p className="mt-1 text-sm text-airship-muted">
          Audit captures and live streams you chose to store on this machine. Reopen an audit to
          review coverage or download the tagging plan; download a live file as raw NDJSON.
        </p>
      </header>

      {error ? <p className="alert-warning">{error}</p> : null}

      <section className="card overflow-hidden">
        {loading ? (
          <p className="px-4 py-4 text-sm text-airship-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-airship-muted">
            Nothing saved yet. Run a data collection audit, or start a live stream with “Store raw
            data file” checked.
          </p>
        ) : (
          <ul className="divide-y divide-airship-border">
            {items.map((item) => (
              <HistoryRow
                key={`${item.kind ?? "audit"}:${item.name}`}
                item={item}
                opening={openingName === item.name}
                downloading={downloadingName === item.name}
                onOpen={() => open(item)}
                onDownload={() => download(item)}
                onDelete={() => setPendingDelete(item)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingLive ? "Delete live capture" : "Delete saved capture"}
        message={
          pendingLive
            ? `Delete the live NDJSON for "${pendingDelete?.profile ?? pendingDelete?.name}" saved ${formatDateTime(pendingDelete?.savedAt)}? This cannot be undone.`
            : `Delete the analysis for "${pendingDelete?.profile ?? pendingDelete?.name}" saved ${formatDateTime(pendingDelete?.savedAt)}? This cannot be undone.`
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
