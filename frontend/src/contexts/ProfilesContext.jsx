import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createProfile,
  deleteProfile,
  fetchProfiles,
  updateProfile,
} from "../services/profilesApi.js";

const ProfilesContext = createContext(null);

const LAST_PROFILE_KEY = "rtds-dca-last-profile";

export function ProfilesProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [names, setNames] = useState([]);
  const [configPathLabel, setConfigPathLabel] = useState("");
  const [decryptFailures, setDecryptFailures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchProfiles();
      setProfiles(payload.profiles ?? []);
      setNames(payload.names ?? []);
      setConfigPathLabel(payload.configPathLabel ?? "");
      setDecryptFailures(payload.decryptFailures ?? 0);
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

  const value = useMemo(
    () => ({
      profiles,
      names,
      configPathLabel,
      decryptFailures,
      loading,
      error,
      reload,
      saveProfile: async ({ name, token, region }, { isEdit } = {}) => {
        if (isEdit) await updateProfile({ name, token, region });
        else await createProfile({ name, token, region });
        await reload();
      },
      removeProfile: async (name) => {
        await deleteProfile({ name });
        await reload();
      },
    }),
    [profiles, names, configPathLabel, decryptFailures, loading, error, reload],
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles() {
  const context = useContext(ProfilesContext);
  if (!context) throw new Error("useProfiles must be used inside a ProfilesProvider");
  return context;
}

/** Remember the last project used so the capture form is pre-filled on return. */
export function readLastProfile() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(LAST_PROFILE_KEY) ?? "";
}

export function writeLastProfile(profile) {
  if (typeof localStorage === "undefined") return;
  if (profile) localStorage.setItem(LAST_PROFILE_KEY, profile);
}
