import { useEffect, useRef, useState } from "react";

const inputClass = "input-field";

const EMPTY = {
  name: "",
  token: "",
  region: "eu",
};

export default function ProfileForm({ initial, hasExistingToken = false, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState(initial ?? EMPTY);
  const [error, setError] = useState("");
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const regionRef = useRef(null);
  const tokenRef = useRef(null);

  useEffect(() => {
    setForm(initial ?? EMPTY);
    setError("");
  }, [initial]);

  useEffect(() => {
    if (initial == null) return;

    const isEdit = Boolean(initial?.name);
    const focusTarget = isEdit ? regionRef.current : nameRef.current;

    const frame = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      focusTarget?.focus({ preventScroll: true });
      if (!isEdit && nameRef.current) {
        nameRef.current.select();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [initial]);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    }
  };

  const isEdit = Boolean(initial?.name);

  return (
    <form ref={formRef} className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
      <label className="block text-xs text-airship-muted md:col-span-2">
        Project name
        <input
          ref={nameRef}
          className={inputClass}
          value={form.name}
          onChange={set("name")}
          required
          disabled={isEdit}
          placeholder="My Project"
        />
      </label>

      <label className="block text-xs text-airship-muted">
        Region
        <select ref={regionRef} className={inputClass} value={form.region} onChange={set("region")}>
          <option value="eu">EU</option>
          <option value="us">US</option>
        </select>
      </label>

      <label className="block text-xs text-airship-muted md:col-span-2">
        RTDS bearer token
        <input
          ref={tokenRef}
          className={inputClass}
          type="password"
          value={form.token}
          onChange={set("token")}
          required={!hasExistingToken}
          autoComplete="off"
          placeholder={hasExistingToken ? "Leave blank to keep the current token" : "Bearer …"}
        />
        <span className="mt-1 block text-[11px] text-airship-muted">
          The Airship app key is included in the token — no need to enter it separately.
        </span>
      </label>

      {error && <p className="text-sm text-airship-danger md:col-span-2">{error}</p>}

      <div className="flex gap-2 md:col-span-2">
        <button
          type="submit"
          className="btn-primary"
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : isEdit ? "Update project" : "Add project"}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
