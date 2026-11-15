// Appearance (light, dark or match the computer; normal or larger text).
// Each person's choice is saved on their account; a copy is kept in this browser
// only so the page opens in the right colors before sign-in has been checked.

const KEY = "appearance";
const darkQuery = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;
let current = { theme: "system", text_size: "normal" };

function paint() {
  const root = document.documentElement;
  const dark = current.theme === "dark" || (current.theme === "system" && darkQuery?.matches);
  root.classList.toggle("dark", !!dark);
  root.dataset.textSize = current.text_size === "large" ? "large" : "normal";
}

// "Match my computer" follows Windows (or the phone) when it switches on its own.
darkQuery?.addEventListener?.("change", () => { if (current.theme === "system") paint(); });

export function applyAppearance(prefs) {
  current = {
    theme: ["light", "dark", "system"].includes(prefs?.theme) ? prefs.theme : "system",
    text_size: prefs?.text_size === "large" ? "large" : "normal",
  };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
  paint();
}

export function applyStoredAppearance() {
  try { applyAppearance(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { applyAppearance(null); }
}
