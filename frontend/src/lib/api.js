const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8002";
const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL || window.location.origin;

const getWsBaseUrl = () => {
  if (API_BASE_URL.startsWith("https://")) return API_BASE_URL.replace("https://", "wss://");
  if (API_BASE_URL.startsWith("http://")) return API_BASE_URL.replace("http://", "ws://");
  return API_BASE_URL;
};

const apiFetch = (path, options = {}) => {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  return fetch(url, {
    credentials: "include",
    ...options,
  });
};

export { API_BASE_URL, CLIENT_BASE_URL, getWsBaseUrl, apiFetch };
