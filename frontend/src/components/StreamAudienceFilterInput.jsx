import { useState } from "react";

const inputClass = "input-field min-w-0 flex-1";

export default function StreamAudienceFilterInput({
  label,
  placeholder,
  values = [],
  onAdd,
  onRemove,
  hint = null,
  disabled = false,
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const value = draft.trim();
    if (!value || disabled) return;
    onAdd(value);
    setDraft("");
  };

  return (
    <div className="block text-xs text-airship-muted">
      <span>{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          className={inputClass}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
        <button type="button" className="btn-secondary shrink-0 px-3 text-xs" onClick={submit} disabled={disabled}>
          Add
        </button>
      </div>

      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${label} filters`}>
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] text-teal-900"
            >
              <span className="truncate font-mono">{value}</span>
              <button
                type="button"
                className="shrink-0 rounded-full px-1 leading-none text-teal-700 hover:bg-teal-100 hover:text-teal-950"
                aria-label={`Remove ${label} ${value}`}
                onClick={() => onRemove(value)}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {hint}
    </div>
  );
}
