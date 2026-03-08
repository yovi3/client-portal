import { apiFetch } from "@/lib/api";

const USER_KEY = "user";

export const getStoredUser = () => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setStoredUser = (user) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearStoredUser = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
};

export const fetchCurrentUser = async () => {
  try {
    const res = await apiFetch("/auth/me");
    if (!res.ok) return null;
    const data = await res.json();
    setStoredUser(data);
    return data;
  } catch {
    return null;
  }
};
