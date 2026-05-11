import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useUser } from "@/lib/UserContext";

const PollingContext = createContext(null);

const POLL_INTERVAL = 30_000;

export function PollingProvider({ children }) {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(null);

  const fetchPollingData = useCallback(async () => {
    if (!user?.id || !user?.role) return;
    if (document.visibilityState === "hidden") return;
    try {
      const res = await apiFetch(`/users/${user.id}/status?role=${user.role}`);
      if (res.status === 401 || res.status === 403) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        await logout();
        navigate("/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.total_unread_count || 0);
      }
    } catch (err) {
      console.error("Polling error:", err.message);
    }
  }, [user?.id, user?.role, logout, navigate]);

  useEffect(() => {
    if (!user?.id) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    fetchPollingData();
    intervalRef.current = setInterval(fetchPollingData, POLL_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchPollingData();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id, fetchPollingData]);

  return (
    <PollingContext.Provider value={{ notifications, unreadCount, refetch: fetchPollingData }}>
      {children}
    </PollingContext.Provider>
  );
}

export function usePolling() {
  const ctx = useContext(PollingContext);
  if (!ctx) throw new Error("usePolling must be used within PollingProvider");
  return ctx;
}
