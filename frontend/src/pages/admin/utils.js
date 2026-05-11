/**
 * Shared utilities for the Admin Dashboard.
 */

export const PERSONNEL_ROLES = ["lawyer", "accounting", "other", "case manager", "admin"];

export const PREDEFINED_PERMISSIONS = [
  "cases:view",
  "cases:create",
  "cases:manage",
  "documents:view",
  "documents:manage",
  "messages:view",
  "messages:send",
  "users:view",
  "users:manage",
  "roles:manage",
  "invites:manage",
];

export const DEFAULT_SORTS = {
  cases: { field: "title", direction: "asc" },
  users: { field: "email", direction: "asc" },
  documents: { field: "upload_date", direction: "desc" },
  invites: { field: "created_at", direction: "desc" },
  roles: { field: "role", direction: "asc" },
};

export const DEFAULT_COLUMNS = {
  cases: ["title", "lawbase", "clients", "team", "unread"],
  users: ["email", "name", "role", "links"],
  documents: ["name", "case", "status", "created"],
  invites: ["email", "role", "status", "created", "expires"],
  roles: ["role", "enabled", "manage", "preview"],
};

export const COLUMN_OPTIONS = {
  cases: [
    { key: "title", label: "Case" },
    { key: "lawbase", label: "Lawbase" },
    { key: "serial", label: "Serial" },
    { key: "clients", label: "Clients" },
    { key: "team", label: "DSS Team" },
    { key: "unread", label: "Unread" },
  ],
  users: [
    { key: "email", label: "Email" },
    { key: "name", label: "Name" },
    { key: "role", label: "Role" },
    { key: "links", label: "Assignments" },
    { key: "source", label: "Source" },
  ],
  documents: [
    { key: "name", label: "Document" },
    { key: "case", label: "Case" },
    { key: "status", label: "Status" },
    { key: "created", label: "Created" },
  ],
  invites: [
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
    { key: "status", label: "Status" },
    { key: "created", label: "Created" },
    { key: "expires", label: "Expires" },
  ],
  roles: [
    { key: "role", label: "Role" },
    { key: "enabled", label: "Enabled" },
    { key: "manage", label: "Manage Grants" },
    { key: "preview", label: "Preview" },
  ],
};

export function normalizeText(value) {
  return String(value || "").toLowerCase();
}

export function compareValues(left, right, direction) {
  const dir = direction === "desc" ? -1 : 1;
  const a = left ?? "";
  const b = right ?? "";
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  const dateA = typeof a === "string" ? Date.parse(a) : Number.NaN;
  const dateB = typeof b === "string" ? Date.parse(b) : Number.NaN;
  if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) return (dateA - dateB) * dir;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * dir;
}

export function sortRows(rows, sortConfig, accessorMap) {
  const accessor = accessorMap?.[sortConfig?.field];
  if (!accessor) return rows;
  return [...rows].sort((l, r) => compareValues(accessor(l), accessor(r), sortConfig.direction));
}

export function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export function copyText(text) {
  if (!text) return Promise.reject(new Error("Nothing to copy."));
  return navigator.clipboard.writeText(text);
}

export function exportContent(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function responseError(res) {
  let detail = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    detail = data.detail || detail;
  } catch {
    // noop
  }
  const err = new Error(detail);
  err.status = res.status;
  return err;
}
