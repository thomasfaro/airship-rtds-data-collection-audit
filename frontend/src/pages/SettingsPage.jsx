import { useMemo, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ProfileForm from "../components/ProfileForm.jsx";
import { useProfiles } from "../contexts/ProfilesContext.jsx";

export default function SettingsPage() {
  const { profiles, configPathLabel, decryptFailures, loading, error, saveProfile, removeProfile } =
    useProfiles();

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");

  const isEdit = Boolean(editing?.name && profiles.some((item) => item.name === editing.name));
  const existing = profiles.find((item) => item.name === editing?.name);
  // ProfileForm resets itself whenever `initial` changes identity, so keep it stable.
  const formInitial = useMemo(() => editing ?? { name: "", token: "", region: "eu" }, [editing]);

  const handleSave = async (form) => {
    setSaving(true);
    setActionError("");
    try {
      await saveProfile(form, { isEdit });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setActionError("");
    try {
      await removeProfile(pendingDelete);
      setPendingDelete(null);
      if (editing?.name === pendingDelete) setEditing(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-airship-navy">RTDS projects</h1>
        <p className="mt-1 text-sm text-airship-muted">
          Tokens are stored encrypted on this machine only, in{" "}
          <code>{configPathLabel || "config/rtds-profiles.json"}</code>. They are never sent
          anywhere except to the Airship RTDS endpoint.
        </p>
      </header>

      {error ? <p className="alert-warning">{error}</p> : null}
      {actionError ? <p className="alert-warning">{actionError}</p> : null}
      {decryptFailures > 0 ? (
        <p className="alert-warning">
          {decryptFailures} token{decryptFailures > 1 ? "s" : ""} could not be decrypted — they were
          most likely encrypted on another machine. Re-enter them below.
        </p>
      ) : null}

      <section className="card-padded">
        <h2 className="section-title">Configured projects</h2>
        {loading ? (
          <p className="mt-3 text-sm text-airship-muted">Loading…</p>
        ) : profiles.length === 0 ? (
          <p className="mt-3 text-sm text-airship-muted">
            No project yet. Add one below to start capturing.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-airship-border">
            {profiles.map((profile) => (
              <li key={profile.name} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-airship-navy">
                  {profile.name}
                </span>
                <span className="badge-blue">{profile.region?.toUpperCase() ?? "EU"}</span>
                {profile.decrypt_failed ? (
                  <span className="badge-amber">token unreadable</span>
                ) : profile.has_token ? (
                  <span className="text-xs text-airship-muted">token set</span>
                ) : (
                  <span className="badge-amber">no token</span>
                )}
                <button
                  type="button"
                  className="link-nav"
                  onClick={() => setEditing({ name: profile.name, token: "", region: profile.region })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-airship-danger hover:underline"
                  onClick={() => setPendingDelete(profile.name)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-padded">
        <h2 className="section-title">{isEdit ? `Edit ${editing.name}` : "Add a project"}</h2>
        <div className="mt-3">
          <ProfileForm
            initial={formInitial}
            hasExistingToken={Boolean(existing?.has_token) && !existing?.decrypt_failed}
            isSaving={saving}
            onSave={handleSave}
            onCancel={isEdit ? () => setEditing(null) : null}
          />
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete project"
        message={`Remove "${pendingDelete}" and its stored token? Saved audits are kept.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
