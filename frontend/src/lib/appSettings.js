import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// What the screens should show, from the backend (CASES_ENABLED in backend/.env).
// Cases stay hidden for the intake-team rollout. Fetched once per page load.
let cached = null;
let pending = null;

export function useAppSettings() {
  const [settings, setSettings] = useState(cached || { cases_enabled: false, loaded: false });
  useEffect(() => {
    if (cached) return;
    pending = pending || apiFetch("/app-settings")
      .then((res) => (res.ok ? res.json() : { cases_enabled: false }))
      .catch(() => ({ cases_enabled: false }))
      .then((data) => (cached = { ...data, loaded: true }));
    pending.then((data) => setSettings(data));
  }, []);
  return settings;
}
