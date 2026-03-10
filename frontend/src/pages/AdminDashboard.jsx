"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { fetchCurrentUser, getStoredUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PERSONNEL_ROLES = ["lawyer", "accountant", "paralegal", "legal assistant", "admin"];
const PREDEFINED_PERMISSIONS = [
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
const ADMIN_TABS = ["cases", "roles", "role-manager", "documents"];
const ADMIN_LAST_TAB_KEY = "admin_dashboard_last_tab";

function MetricCard({ icon, label, value, hint }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {React.createElement(icon, { className: "h-4 w-4 text-muted-foreground" })}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(false);
  const [actionKey, setActionKey] = useState("");
  const [notice, setNotice] = useState(null);

  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [users, setUsers] = useState([]);
  const [supportedRoles, setSupportedRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteAccessDenied, setInviteAccessDenied] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
  });
  const [inviteStatusFilter, setInviteStatusFilter] = useState("all");
  const [lastInviteUrl, setLastInviteUrl] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [caseSearch, setCaseSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentStatusFilter, setDocumentStatusFilter] = useState("all");
  const [activeAdminTab, setActiveAdminTab] = useState(() => {
    if (typeof window === "undefined") return ADMIN_TABS[0];
    const saved = window.localStorage.getItem(ADMIN_LAST_TAB_KEY);
    return saved && ADMIN_TABS.includes(saved) ? saved : ADMIN_TABS[0];
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState({
    role: "client",
  });

  const canAccess = Boolean(user && PERSONNEL_ROLES.includes(user.role));
  const canManageRoles = Boolean(user && user.role === "admin");

  const getErrorDetail = useCallback(async (res) => {
    try {
      const data = await res.json();
      return data.detail || `Request failed (${res.status})`;
    } catch {
      return `Request failed (${res.status})`;
    }
  }, []);

  const withAction = async (key, action) => {
    setActionKey(key);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setNotice({ type: "error", text: err.message || "Operation failed." });
    } finally {
      setActionKey("");
    }
  };

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [casesRes, clientsRes, personnelRes] = await Promise.all([
        apiFetch("/cases"),
        apiFetch("/clients"),
        apiFetch("/available-personnel"),
      ]);

      if (!casesRes.ok) throw new Error(await getErrorDetail(casesRes));
      if (!clientsRes.ok) throw new Error(await getErrorDetail(clientsRes));
      if (!personnelRes.ok) throw new Error(await getErrorDetail(personnelRes));

      const [casesData, clientsData, personnelData] = await Promise.all([
        casesRes.json(),
        clientsRes.json(),
        personnelRes.json(),
      ]);

      setCases(Array.isArray(casesData) ? casesData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setPersonnel(Array.isArray(personnelData) ? personnelData : []);

      const invitesRes = await apiFetch("/invites?limit=200");
      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvites(Array.isArray(invitesData) ? invitesData : []);
        setInviteAccessDenied(false);
      } else if (invitesRes.status === 403) {
        setInvites([]);
        setInviteAccessDenied(true);
      } else {
        throw new Error(await getErrorDetail(invitesRes));
      }

      if (user?.role === "admin") {
        const [usersRes, rolesRes, rolePermissionsRes, docsRes] = await Promise.all([
          apiFetch("/users?limit=500"),
          apiFetch("/roles"),
          apiFetch("/roles/permissions"),
          apiFetch("/admin/documents?limit=2000"),
        ]);
        if (!usersRes.ok) throw new Error(await getErrorDetail(usersRes));
        if (!rolesRes.ok) throw new Error(await getErrorDetail(rolesRes));
        if (!rolePermissionsRes.ok) throw new Error(await getErrorDetail(rolePermissionsRes));
        if (!docsRes.ok) throw new Error(await getErrorDetail(docsRes));

        const [usersData, rolesData, rolePermissionsData, docsData] = await Promise.all([
          usersRes.json(),
          rolesRes.json(),
          rolePermissionsRes.json(),
          docsRes.json(),
        ]);
        setUsers(Array.isArray(usersData) ? usersData : []);
        setSupportedRoles(Array.isArray(rolesData) ? rolesData : []);
        setRolePermissions(Array.isArray(rolePermissionsData) ? rolePermissionsData : []);
        setDocuments(Array.isArray(docsData) ? docsData : []);
      } else {
        setUsers([]);
        setSupportedRoles([]);
        setRolePermissions([]);
        setDocuments([]);
      }
    } catch (err) {
      setNotice({ type: "error", text: err.message || "Failed to load admin data." });
    } finally {
      setIsLoading(false);
    }
  }, [getErrorDetail, user?.role]);

  useEffect(() => {
    if (user) return;
    fetchCurrentUser().then((u) => {
      if (u) setUser(u);
      else navigate("/login");
    });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    if (!PERSONNEL_ROLES.includes(user.role)) {
      navigate("/dashboard");
      return;
    }
    loadAdminData();
  }, [user, navigate, loadAdminData]);

  useEffect(() => {
    if (!canManageRoles) return;
    if (!ADMIN_TABS.includes(activeAdminTab)) {
      setActiveAdminTab(ADMIN_TABS[0]);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_LAST_TAB_KEY, activeAdminTab);
    }
  }, [activeAdminTab, canManageRoles]);

  const _assignmentsCount = useMemo(
    () =>
      cases.reduce(
        (total, entry) =>
          total + (entry.clients?.length || 0) + (entry.personnel?.length || 0),
        0
      ),
    [cases]
  );

  const userAssignmentCounts = useMemo(() => {
    const counts = {};
    for (const caseEntry of cases) {
      for (const person of caseEntry.personnel || []) {
        if (!counts[person.id]) counts[person.id] = { personnel: 0, client: 0 };
        counts[person.id].personnel += 1;
      }
      for (const client of caseEntry.clients || []) {
        if (!counts[client.id]) counts[client.id] = { personnel: 0, client: 0 };
        counts[client.id].client += 1;
      }
    }
    return counts;
  }, [cases]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users.filter((entry) => {
      if (roleFilter !== "all" && entry.role !== roleFilter) return false;
      if (!query) return true;
      const haystack = `${entry.name || ""} ${entry.email || ""} ${entry.role || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [users, userSearch, roleFilter]);

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    return documents.filter((entry) => {
      if (documentStatusFilter !== "all" && entry.status !== documentStatusFilter) return false;
      if (!query) return true;
      const haystack = `${entry.name || ""} ${entry.case_title || ""} ${entry.status || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [documents, documentSearch, documentStatusFilter]);

  const filteredInvites = useMemo(() => {
    if (inviteStatusFilter === "all") return invites;
    return invites.filter((entry) => entry.status === inviteStatusFilter);
  }, [invites, inviteStatusFilter]);

  const filteredCases = useMemo(() => {
    const query = caseSearch.trim().toLowerCase();
    return cases.filter((entry) => {
      if (!query) return true;
      const haystack =
        `${entry.title || ""} ${entry.description || ""} ${entry.case_number || ""} ${entry.case_serial || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [cases, caseSearch]);

  const rolePermissionMap = useMemo(() => {
    const map = {};
    for (const entry of rolePermissions) {
      if (!map[entry.role]) map[entry.role] = {};
      map[entry.role][entry.permission] = entry;
    }
    return map;
  }, [rolePermissions]);

  const permissionColumns = useMemo(() => {
    const existing = [...new Set(rolePermissions.map((entry) => entry.permission))];
    const extras = existing
      .filter((permissionKey) => !PREDEFINED_PERMISSIONS.includes(permissionKey))
      .sort((a, b) => a.localeCompare(b));
    return [...PREDEFINED_PERMISSIONS, ...extras];
  }, [rolePermissions]);

  const handleUpdateUserRole = async (entry) => {
    const nextRole = editForm.role;
    if (!entry || !nextRole) {
      setNotice({ type: "error", text: "Role is required." });
      return;
    }
    if (nextRole === entry.role) {
      setIsEditModalOpen(false);
      return;
    }

    await withAction(`save-role-${entry.id}`, async () => {
      const res = await apiFetch(`/users/${entry.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) throw new Error(await getErrorDetail(res));

      const updated = await res.json();
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice({
        type: "success",
        text: `Updated ${updated.name || updated.email} role to ${updated.role}.`,
      });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      await loadAdminData();
    });
  };

  const handleDeleteUser = async (entry) => {
    await withAction(`delete-user-${entry.id}`, async () => {
      const res = await apiFetch(`/users/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await getErrorDetail(res));

      setNotice({ type: "success", text: `User #${entry.id} deleted.` });
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      await loadAdminData();
    });
  };

  const openEditUserModal = (entry) => {
    setSelectedUser(entry);
    setEditForm({ role: entry.role || "client" });
    setIsEditModalOpen(true);
  };

  const openDeleteUserModal = (entry) => {
    setSelectedUser(entry);
    setIsDeleteModalOpen(true);
  };

  const handleUpdateDocumentStatus = async (docId, status) => {
    await withAction(`doc-status-${docId}`, async () => {
      const res = await apiFetch(`/admin/documents/${docId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await getErrorDetail(res));

      setNotice({ type: "success", text: `Document #${docId} updated to ${status}.` });
      await loadAdminData();
    });
  };

  const handleDeleteDocumentFile = async (docId) => {
    if (!window.confirm(`Delete uploaded file for document #${docId}?`)) return;
    await withAction(`doc-delete-${docId}`, async () => {
      const res = await apiFetch(`/admin/documents/${docId}/file`, { method: "DELETE" });
      if (!res.ok) throw new Error(await getErrorDetail(res));

      setNotice({ type: "success", text: `Document file for #${docId} removed.` });
      await loadAdminData();
    });
  };

  const handleToggleRolePermission = async (roleName, permissionKey, checked) => {
    const existing = rolePermissionMap?.[roleName]?.[permissionKey];
    if (checked) {
      if (existing) return;
      await withAction(`toggle-role-permission-${roleName}-${permissionKey}-on`, async () => {
        const res = await apiFetch("/roles/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: roleName,
            permission: permissionKey,
          }),
        });
        if (!res.ok) throw new Error(await getErrorDetail(res));
        await loadAdminData();
      });
      return;
    }

    if (!existing) return;
    await withAction(`toggle-role-permission-${roleName}-${permissionKey}-off`, async () => {
      const res = await apiFetch(`/roles/permissions/${existing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await getErrorDetail(res));
      await loadAdminData();
    });
  };

  const handleInviteInputChange = (event) => {
    const { name, value } = event.target;
    setInviteForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateInvite = async (event) => {
    event.preventDefault();
    if (!inviteForm.email.trim()) {
      setNotice({ type: "error", text: "Invite email is required." });
      return;
    }

    await withAction("create-invite", async () => {
      const res = await apiFetch("/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          first_name: inviteForm.first_name.trim() || null,
          last_name: inviteForm.last_name.trim() || null,
          phone: inviteForm.phone.trim() || null,
          address: inviteForm.address.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await getErrorDetail(res));
      const data = await res.json();
      setNotice({ type: "success", text: "Invite created." });
      setLastInviteUrl(data?.invite_url || "");
      setInviteForm({
        email: "",
        first_name: "",
        last_name: "",
        phone: "",
        address: "",
      });
      if (data?.invite_url) {
        try {
          await navigator.clipboard.writeText(data.invite_url);
          setNotice({ type: "success", text: "Invite created and link copied to clipboard." });
        } catch {
          setNotice({ type: "success", text: `Invite created: ${data.invite_url}` });
        }
      }
      await loadAdminData();
    });
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8 text-center text-muted-foreground">Authenticating...</div>
      </MainLayout>
    );
  }

  if (!canAccess) {
    return (
      <MainLayout>
        <Alert className="m-6">
          <Shield className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>This dashboard is available only for personnel roles.</AlertDescription>
        </Alert>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-6">
        <Card className="border-primary/20 bg-gradient-to-r from-background via-background to-muted/30">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="w-fit gap-1">
                <Shield className="h-3.5 w-3.5" />
                Admin Controls
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight">Advanced Admin Dashboard</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Manage clients, permissions, and case access from one place. All actions use
                the live API and enforce role checks.
              </p>
            </div>
          </CardContent>
        </Card>

        {notice && (
          <Alert variant={notice.type === "error" ? "destructive" : "default"}>
            {notice.type === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>{notice.type === "error" ? "Action failed" : "Action completed"}</AlertTitle>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Briefcase}
            label="Cases"
            value={cases.length}
            hint="Cases visible to your role"
          />
          <MetricCard
            icon={Users}
            label="Clients"
            value={clients.length}
            hint="Manage contact details and access"
          />
          <MetricCard
            icon={UserPlus}
            label="DSS Team"
            value={personnel.length}
            hint="Available staff for assignment"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite Manager</CardTitle>
            <CardDescription>
              Generate one-time invite links for client onboarding and track invite status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inviteAccessDenied ? (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Permission required</AlertTitle>
                <AlertDescription>
                  You need <code>invites:manage</code> permission to manage invites.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <form onSubmit={handleCreateInvite} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Input
                    name="email"
                    value={inviteForm.email}
                    onChange={handleInviteInputChange}
                    placeholder="client@email.com"
                  />
                  <Input
                    name="first_name"
                    value={inviteForm.first_name}
                    onChange={handleInviteInputChange}
                    placeholder="First name (optional)"
                  />
                  <Input
                    name="last_name"
                    value={inviteForm.last_name}
                    onChange={handleInviteInputChange}
                    placeholder="Last name (optional)"
                  />
                  <Input
                    name="phone"
                    value={inviteForm.phone}
                    onChange={handleInviteInputChange}
                    placeholder="Phone (optional)"
                  />
                  <Input
                    name="address"
                    value={inviteForm.address}
                    onChange={handleInviteInputChange}
                    placeholder="Address (optional)"
                  />
                  <div className="md:col-span-2 xl:col-span-5">
                    <Button type="submit" disabled={actionKey === "create-invite"}>
                      <Plus className="mr-1 h-4 w-4" />
                      {actionKey === "create-invite" ? "Creating..." : "Create Invite"}
                    </Button>
                  </div>
                </form>

                <div className="flex items-center gap-2">
                  <Select value={inviteStatusFilter} onValueChange={setInviteStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All invites</SelectItem>
                      <SelectItem value="pending">pending</SelectItem>
                      <SelectItem value="used">used</SelectItem>
                      <SelectItem value="expired">expired</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline">{filteredInvites.length} invites</Badge>
                </div>

                {lastInviteUrl ? (
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <Input value={lastInviteUrl} readOnly />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lastInviteUrl);
                          setNotice({ type: "success", text: "Invite link copied to clipboard." });
                        } catch {
                          setNotice({ type: "error", text: "Could not copy invite link." });
                        }
                      }}
                    >
                      Copy Link
                    </Button>
                  </div>
                ) : null}

                {filteredInvites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invites found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Created</th>
                          <th className="px-3 py-2 font-medium">Expires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInvites.map((entry) => (
                          <tr key={entry.id} className="border-t hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <div className="mb-1 flex items-center gap-2">
                                <Badge variant="outline">#{entry.id}</Badge>
                                <Badge variant="secondary">{entry.role}</Badge>
                              </div>
                              <div>{entry.invited_email}</div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={entry.status === "pending" ? "default" : "outline"}>
                                {entry.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {entry.created_at ? new Date(entry.created_at).toLocaleString() : "N/A"}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {entry.expires_at ? new Date(entry.expires_at).toLocaleString() : "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeAdminTab} onValueChange={setActiveAdminTab} className="gap-4">
          {canManageRoles ? (
            <>
              <TabsList className="flex h-auto w-full flex-wrap">
                <TabsTrigger value="cases" className="min-w-[150px] flex-1">
                  Case Manager
                </TabsTrigger>
                <TabsTrigger value="roles" className="min-w-[150px] flex-1">
                  Users Manager
                </TabsTrigger>
                <TabsTrigger value="role-manager" className="min-w-[150px] flex-1">
                  Role Manager
                </TabsTrigger>
                <TabsTrigger value="documents" className="min-w-[150px] flex-1">
                  Documents Manager
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cases">
                <Card>
                  <CardHeader>
                    <CardTitle>Case Manager</CardTitle>
                    <CardDescription>
                      Browse all cases and quickly open case details or messages.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <Input
                        placeholder="Search by case title, description, case number, or serial"
                        value={caseSearch}
                        onChange={(e) => setCaseSearch(e.target.value)}
                        className="md:max-w-md"
                      />
                      <Badge variant="outline">{filteredCases.length} cases</Badge>
                    </div>

                    {isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading cases...</p>
                    ) : filteredCases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No cases found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/50 text-left">
                            <tr>
                              <th className="px-3 py-2 font-medium">Case</th>
                              <th className="px-3 py-2 font-medium">Case Number</th>
                              <th className="px-3 py-2 font-medium">Case Serial</th>
                              <th className="px-3 py-2 font-medium">Clients</th>
                              <th className="px-3 py-2 font-medium">DSS Team</th>
                              <th className="px-3 py-2 font-medium text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCases.map((entry) => (
                              <tr key={entry.id} className="border-t align-top hover:bg-muted/20">
                                <td className="px-3 py-2">
                                  <div className="mb-1 flex items-center gap-2">
                                    <Badge variant="outline">#{entry.id}</Badge>
                                  </div>
                                  <div className="font-medium">{entry.title || "Untitled case"}</div>
                                  {entry.description ? (
                                    <div className="max-w-[420px] truncate text-xs text-muted-foreground">
                                      {entry.description}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="secondary">{entry.case_number || "N/A"}</Badge>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline">{entry.case_serial || "N/A"}</Badge>
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {(entry.clients || []).length}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {(entry.personnel || []).length}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => navigate(`/cases/${entry.id}`)}
                                    >
                                      <ExternalLink className="mr-1 h-4 w-4" />
                                      Open Case
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => navigate(`/messages?case_id=${entry.id}`)}
                                    >
                                      <ExternalLink className="mr-1 h-4 w-4" />
                                      Open Messages
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="roles">
                <Card>
                  <CardHeader>
                    <CardTitle>Users Manager</CardTitle>
                    <CardDescription>
                      Manage all users: search, change role, and delete accounts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <Input
                        placeholder="Search by name, email, or role"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="md:max-w-md"
                      />
                      <div className="flex items-center gap-2">
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            {supportedRoles.map((roleName) => (
                              <SelectItem key={roleName} value={roleName}>
                                {roleName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge variant="outline">{filteredUsers.length} users</Badge>
                      </div>
                    </div>

                    {isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading users...</p>
                    ) : filteredUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/50 text-left">
                            <tr>
                              <th className="px-3 py-2 font-medium">Email</th>
                              <th className="px-3 py-2 font-medium">Name</th>
                              <th className="px-3 py-2 font-medium">Role</th>
                              <th className="px-3 py-2 font-medium">Links</th>
                              <th className="px-3 py-2 font-medium">Source</th>
                              <th className="px-3 py-2 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUsers.map((entry) => {
                              const isSelf = entry.id === user.id;
                              const assignmentCount = userAssignmentCounts[entry.id] || {
                                personnel: 0,
                                client: 0,
                              };

                              return (
                                <tr key={entry.id} className="border-t align-top hover:bg-muted/20">
                                  <td className="px-3 py-2">
                                    <div className="mb-1 flex items-center gap-2">
                                      <Badge variant="outline">#{entry.id}</Badge>
                                      {isSelf ? <Badge>Current User</Badge> : null}
                                    </div>
                                    <div className="font-medium">{entry.email}</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-medium">{entry.name || "N/A"}</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <Badge variant="outline">{entry.role}</Badge>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {assignmentCount.personnel} personnel, {assignmentCount.client} client
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground">
                                    <div>{entry.auth_provider || "local"}</div>
                                    <div>{entry.effective_role_source || "unknown"}</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openEditUserModal(entry)}
                                        disabled={isSelf}
                                      >
                                        <Pencil className="mr-1 h-4 w-4" />
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => openDeleteUserModal(entry)}
                                        disabled={isSelf || actionKey === `delete-user-${entry.id}`}
                                      >
                                        <Trash2 className="mr-1 h-4 w-4" />
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="role-manager">
                <Card>
                  <CardHeader>
                    <CardTitle>Role Manager</CardTitle>
                    <CardDescription>
                      Roles on the left, predefined permissions on top, checkbox matrix below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-x-auto rounded-md border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted/50 text-left">
                          <tr>
                            <th className="px-3 py-2 font-medium">Role</th>
                            {permissionColumns.map((permissionKey) => (
                              <th key={permissionKey} className="px-3 py-2 text-center font-medium">
                                <code className="text-[11px]">{permissionKey}</code>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {supportedRoles.map((roleName) => (
                            <tr key={roleName} className="border-t hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <Badge variant="outline">{roleName}</Badge>
                              </td>
                              {permissionColumns.map((permissionKey) => {
                                const exists = Boolean(rolePermissionMap?.[roleName]?.[permissionKey]);
                                const toggleKey = `toggle-role-permission-${roleName}-${permissionKey}`;
                                const busy =
                                  actionKey === `${toggleKey}-on` || actionKey === `${toggleKey}-off`;
                                return (
                                  <td key={`${roleName}-${permissionKey}`} className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 cursor-pointer align-middle"
                                      checked={exists}
                                      disabled={busy}
                                      onChange={(event) =>
                                        handleToggleRolePermission(
                                          roleName,
                                          permissionKey,
                                          event.target.checked
                                        )
                                      }
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documents">
                <Card>
                  <CardHeader>
                    <CardTitle>Documents Manager</CardTitle>
                    <CardDescription>Manage all documents across all cases.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <Input
                        placeholder="Search by document name, case title or status"
                        value={documentSearch}
                        onChange={(e) => setDocumentSearch(e.target.value)}
                        className="md:max-w-md"
                      />
                      <div className="flex items-center gap-2">
                        <Select value={documentStatusFilter} onValueChange={setDocumentStatusFilter}>
                          <SelectTrigger className="w-[190px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="required">required</SelectItem>
                            <SelectItem value="uploaded">uploaded</SelectItem>
                            <SelectItem value="reviewed">reviewed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Badge variant="outline">{filteredDocuments.length} documents</Badge>
                      </div>
                    </div>

                    {isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading documents...</p>
                    ) : filteredDocuments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No documents found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-muted/50 text-left">
                            <tr>
                              <th className="px-3 py-2 font-medium">Document</th>
                              <th className="px-3 py-2 font-medium">Case</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium">Created</th>
                              <th className="px-3 py-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDocuments.map((entry) => (
                              <tr key={entry.id} className="border-t align-top hover:bg-muted/20">
                                <td className="px-3 py-2">
                                  <div className="mb-1 flex items-center gap-2">
                                    <Badge variant="outline">#{entry.id}</Badge>
                                    <Badge variant="secondary">{entry.status}</Badge>
                                  </div>
                                  <div className="font-medium">{entry.name}</div>
                                  <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                                    {entry.file_path || "No file path"}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-medium">{entry.case_title || "N/A"}</div>
                                  <div className="text-xs text-muted-foreground">Case #{entry.case_id}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant={entry.status === "required" ? "default" : "outline"}
                                      disabled={
                                        entry.status === "required" ||
                                        actionKey === `doc-status-${entry.id}`
                                      }
                                      onClick={() => handleUpdateDocumentStatus(entry.id, "required")}
                                    >
                                      required
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={entry.status === "uploaded" ? "default" : "outline"}
                                      disabled={
                                        entry.status === "uploaded" ||
                                        actionKey === `doc-status-${entry.id}`
                                      }
                                      onClick={() => handleUpdateDocumentStatus(entry.id, "uploaded")}
                                    >
                                      uploaded
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={entry.status === "reviewed" ? "default" : "outline"}
                                      disabled={
                                        entry.status === "reviewed" ||
                                        actionKey === `doc-status-${entry.id}`
                                      }
                                      onClick={() => handleUpdateDocumentStatus(entry.id, "reviewed")}
                                    >
                                      reviewed
                                    </Button>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {entry.upload_date ? new Date(entry.upload_date).toLocaleString() : "N/A"}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!entry.file_path}
                                      onClick={() =>
                                        window.open(
                                          `${API_BASE_URL}/documents/${entry.id}/download`,
                                          "_blank"
                                        )
                                      }
                                    >
                                      <Download className="mr-1 h-4 w-4" />
                                      Download
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={!entry.file_path || actionKey === `doc-delete-${entry.id}`}
                                      onClick={() => handleDeleteDocumentFile(entry.id)}
                                    >
                                      <Trash2 className="mr-1 h-4 w-4" />
                                      Remove File
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          ) : (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Admin role required</AlertTitle>
              <AlertDescription>Only admins can manage users and documents.</AlertDescription>
            </Alert>
          )}
        </Tabs>

        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update role for {selectedUser?.email || "selected user"}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <Input value={selectedUser?.name || ""} disabled />
              <Input value={selectedUser?.email || ""} disabled />
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedRoles.map((roleName) => (
                    <SelectItem key={roleName} value={roleName}>
                      {roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedUser && handleUpdateUserRole(selectedUser)}
                disabled={!selectedUser || actionKey === `save-role-${selectedUser?.id}`}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                This action cannot be undone. Delete {selectedUser?.email || "this user"}?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedUser && handleDeleteUser(selectedUser)}
                disabled={!selectedUser || actionKey === `delete-user-${selectedUser?.id}`}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
