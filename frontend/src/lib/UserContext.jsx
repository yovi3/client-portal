import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser, setStoredUser, clearStoredUser } from "@/lib/auth";
import { applyAppearance } from "@/lib/appearance";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(!getStoredUser());

  useEffect(() => {
    const validate = async () => {
      setLoading(true);
      try {
        const res = await apiFetch("/auth/me");
        if (res.ok) {
          const data = await res.json();
          setStoredUser(data);
          setUser(data);
        } else {
          clearStoredUser();
          setUser(null);
        }
      } catch {
        clearStoredUser();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, []);

  // Whoever is signed in sees their own colors and text size.
  useEffect(() => {
    if (user) applyAppearance({ theme: user.theme, text_size: user.text_size });
  }, [user?.theme, user?.text_size]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Best-effort logout
    }
    clearStoredUser();
    setUser(null);
  }, []);

  const updateUser = useCallback((newUser) => {
    setStoredUser(newUser);
    setUser(newUser);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, logout, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
