const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8002";
const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL || window.location.origin;

const getWsBaseUrl = () => {
  if (API_BASE_URL.startsWith("https://")) return API_BASE_URL.replace("https://", "wss://");
  if (API_BASE_URL.startsWith("http://")) return API_BASE_URL.replace("http://", "ws://");
  return API_BASE_URL;
};

const PUBLIC_PAGE_PREFIXES = ["/login", "/u", "/requests", "/invite", "/auth/callback", "/home"];

const apiFetch = async (path, options = {}) => {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });

  // Global session-expiry handling: clear local auth state and force login.
  // Pages meant for people without an account (upload links, invites) are left alone.
  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("user");
    const here = window.location.pathname;
    const isPublicPage = PUBLIC_PAGE_PREFIXES.some((p) => here === p || here.startsWith(`${p}/`));
    if (!isPublicPage) {
      window.location.href = "/login";
    }
  }

  return response;
};

export { API_BASE_URL, CLIENT_BASE_URL, getWsBaseUrl, apiFetch };
