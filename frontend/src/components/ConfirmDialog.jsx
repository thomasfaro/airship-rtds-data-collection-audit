/** In-app confirm dialog, so destructive actions read consistently with the rest of the UI. */
export default function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-airship-danger text-white hover:bg-red-600 focus-visible:outline-airship-danger"
      : "bg-airship-blue text-white hover:bg-airship-blue-dark focus-visible:outline-airship-blue";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Cancel"
        onClick={onCancel}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-airship-border bg-airship-surface p-5 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-airship-navy">
          {title}
        </h2>
        <p className="mt-2 text-sm text-airship-body">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`rounded-pill px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${confirmClass}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
