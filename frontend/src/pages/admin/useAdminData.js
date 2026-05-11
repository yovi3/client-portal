import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { PERSONNEL_ROLES, responseError } from "./utils";

/**
 * Central data-fetching hook for the Admin Dashboard.
 * Returns all datasets, loading states, and a reload function.
 */
export function useAdminData() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [isLoading, setIsLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState({});
  const [actionKey, setActionKey] = useState("");
  const [notice, setNotice] = useState(null);

  const [cases, setCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [supportedRoles, setSupportedRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [docPage, setDocPage] = useState(1);
  const [docMeta, setDocMeta] = useState({ total: 0, total_pages: 1 });
  const [invites, setInvites] = useState([]);
  const [inviteAccessDenied, setInviteAccessDenied] = useState(false);

  const canAccess = Boolean(user && PERSONNEL_ROLES.includes(user.role));
  const canManageRoles = Boolean(user && user.role === "admin");

  const withAction = useCallback(async (key, title, action) => {
    setActionKey(key);
    setNotice(null);
    try {
      const result = await action();
      if (result?.notice) setNotice(result.notice);
      return result;
    } catch (err) {
      setNotice({
        type: "error",
        title,
        text: err.message || "Operation failed.",
        status: err.status || null,
      });
      return null;
    } finally {
      setActionKey("");
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    setTabLoading({ cases: true, users: true, documents: true, invites: true, roles: true });
    try {
      const casesRes = await apiFetch("/cases");
      if (!casesRes.ok) throw await responseError(casesRes);
      const casesData = await casesRes.json();
      setCases(Array.isArray(casesData) ? casesData : []);
      setTabLoading((prev) => ({ ...prev, cases: false }));

      const invitesRes = await apiFetch("/invites?limit=200");
      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvites(Array.isArray(invitesData) ? invitesData : []);
        setInviteAccessDenied(false);
      } else if (invitesRes.status === 403) {
        setInvites([]);
        setInviteAccessDenied(true);
      } else {
        throw await responseError(invitesRes);
      }
      setTabLoading((prev) => ({ ...prev, invites: false }));

      if (user?.role === "admin") {
        const [usersRes, rolesRes, rolePermissionsRes, docsRes] = await Promise.all([
          apiFetch("/users?limit=500"),
          apiFetch("/roles"),
          apiFetch("/roles/permissions"),
          apiFetch(`/admin/documents?page=${docPage}&page_size=50`),
        ]);

        if (!usersRes.ok) throw await responseError(usersRes);
        if (!rolesRes.ok) throw await responseError(rolesRes);
        if (!rolePermissionsRes.ok) throw await responseError(rolePermissionsRes);
        if (!docsRes.ok) throw await responseError(docsRes);

        const [usersData, rolesData, rolePermissionsData, docsData] = await Promise.all([
          usersRes.json(),
          rolesRes.json(),
          rolePermissionsRes.json(),
          docsRes.json(),
        ]);

        setUsers(Array.isArray(usersData) ? usersData : []);
        setSupportedRoles(Array.isArray(rolesData) ? rolesData : []);
        setRolePermissions(Array.isArray(rolePermissionsData) ? rolePermissionsData : []);
        setDocuments(docsData.items || []);
        setDocMeta({ total: docsData.total, total_pages: docsData.total_pages });
      } else {
        setUsers([]);
        setSupportedRoles([]);
        setRolePermissions([]);
        setDocuments([]);
      }
    } catch (err) {
      setNotice({
        type: "error",
        title: "Load failed",
        text: err.message || "Failed to load admin data.",
        status: err.status || null,
      });
    } finally {
      setIsLoading(false);
      setTabLoading({});
    }
  }, [user?.role, docPage]);

  useEffect(() => {
    if (!user) return;
    if (!PERSONNEL_ROLES.includes(user.role)) {
      navigate("/dashboard");
      return;
    }
    loadAdminData();
  }, [loadAdminData, navigate, user]);

  const userAssignmentCounts = useMemo(() => {
    const counts = {};
    for (const c of cases) {
      for (const p of c.personnel || []) {
        if (!counts[p.id]) counts[p.id] = { personnel: 0, client: 0 };
        counts[p.id].personnel += 1;
      }
      for (const cl of c.clients || []) {
        if (!counts[cl.id]) counts[cl.id] = { personnel: 0, client: 0 };
        counts[cl.id].client += 1;
      }
    }
    return counts;
  }, [cases]);

  const rolePermissionMap = useMemo(() => {
    const map = {};
    for (const entry of rolePermissions) {
      if (!map[entry.role]) map[entry.role] = {};
      map[entry.role][entry.permission] = entry;
    }
    return map;
  }, [rolePermissions]);

  const permissionColumns = useMemo(() => {
    const existing = [...new Set(rolePermissions.map((e) => e.permission))];
    const extras = existing
      .filter((k) => !PERSONNEL_ROLES.includes(k))
      .sort((a, b) => a.localeCompare(b));
    return [
      ...new Set([
        "cases:view", "cases:create", "cases:manage",
        "documents:view", "documents:manage",
        "messages:view", "messages:send",
        "users:view", "users:manage",
        "roles:manage", "invites:manage",
        ...extras,
      ]),
    ];
  }, [rolePermissions]);

  return {
    user,
    isLoading,
    tabLoading,
    actionKey,
    notice,
    setNotice,
    cases,
    setCases,
    users,
    setUsers,
    supportedRoles,
    rolePermissions,
    setRolePermissions,
    documents,
    setDocuments,
    docPage,
    setDocPage,
    docMeta,
    invites,
    setInvites,
    inviteAccessDenied,
    canAccess,
    canManageRoles,
    withAction,
    loadAdminData,
    userAssignmentCounts,
    rolePermissionMap,
    permissionColumns,
  };
}
