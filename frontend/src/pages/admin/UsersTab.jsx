import { useMemo, useState, useCallback } from "react";
import { Mail, Pencil, Shield, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { TabSkeleton } from "./StatCard";
import { AdminToolbar, BulkBar, SortButton, thClass, tdClass, rowClass } from "./AdminToolbar";
import { DEFAULT_COLUMNS, DEFAULT_SORTS, normalizeText, sortRows, responseError } from "./utils";
import InvitesTab from "./InvitesTab";
import RolesTab from "./RolesTab";

export default function UsersTab({
  user,
  users,
  setUsers,
  cases,
  supportedRoles,
  userAssignmentCounts,
  rolePermissions,
  setRolePermissions,
  rolePermissionMap,
  permissionColumns,
  invites,
  setInvites,
  inviteAccessDenied,
  withAction,
  actionKey,
  isTabLoading,
  tabLoading,
  focusedId,
  onFocusRecord,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  onClearSelection,
  setNotice,
}) {
  const [subTab, setSubTab] = useState("users");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORTS.users);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS.users);
  const [roleFilter, setRoleFilter] = useState("all");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState({ role: "client" });
  const [bulkRoleTarget, setBulkRoleTarget] = useState("");

  const sortAccessors = useMemo(() => ({
    email: (e) => e.email || "",
    name: (e) => e.name || "",
    role: (e) => e.role || "",
    links: (e) => {
      const c = userAssignmentCounts[e.id] || { personnel: 0, client: 0 };
      return c.personnel + c.client;
    },
    source: (e) => `${e.auth_provider || "local"}-${e.effective_role_source || "unknown"}`,
  }), [userAssignmentCounts]);

  const filteredUsers = useMemo(() => {
    const q = normalizeText(query);
    return sortRows(
      users.filter((e) => {
        if (roleFilter !== "all" && e.role !== roleFilter) return false;
        if (!q) return true;
        return normalizeText(`${e.name} ${e.email} ${e.role} ${e.auth_provider} ${e.effective_role_source}`).includes(q);
      }),
      sort,
      sortAccessors
    );
  }, [query, roleFilter, sort, users, sortAccessors]);

  const selectedRows = useMemo(() => {
    const sel = new Set(selectedIds);
    return filteredUsers.filter((r) => sel.has(r.id));
  }, [filteredUsers, selectedIds]);

  const handleSort = useCallback((field) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const toggleColumn = useCallback((key) => {
    setVisibleColumns((prev) => {
      if (prev.includes(key) && prev.length === 1) return prev;
      return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    });
  }, []);

  const handleUpdateUserRole = async (entry, nextRole) => {
    if (!entry || !nextRole || nextRole === entry.role) {
      setIsEditModalOpen(false);
      return;
    }
    await withAction(`save-role-${entry.id}`, "Role update", async () => {
      const res = await apiFetch(`/users/${entry.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) throw await responseError(res);
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelectedUser((prev) => (prev?.id === updated.id ? updated : prev));
      setIsEditModalOpen(false);
      return { notice: { type: "success", title: "Role updated", text: `${updated.name || updated.email} is now ${updated.role}.` } };
    });
  };

  const handleDeleteUser = async (entry) => {
    if (!entry) return;
    await withAction(`delete-user-${entry.id}`, "Delete user", async () => {
      const res = await apiFetch(`/users/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw await responseError(res);
      setUsers((prev) => prev.filter((u) => u.id !== entry.id));
      setSelectedUser(null);
      setIsDeleteModalOpen(false);
      return { notice: { type: "success", title: "User deleted", text: `Deleted ${entry.email}.` } };
    });
  };

  const handleBulkUserRoleUpdate = async () => {
    const ids = selectedRows.filter((e) => e.id !== user.id).map((e) => e.id);
    if (!bulkRoleTarget || ids.length === 0) return;
    setIsBulkConfirmOpen(false);
    await withAction("bulk-user-role", "Bulk role update", async () => {
      const updated = [];
      for (const id of ids) {
        const res = await apiFetch(`/users/${id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: bulkRoleTarget }),
        });
        if (!res.ok) throw await responseError(res);
        updated.push(await res.json());
      }
      setUsers((prev) => prev.map((u) => updated.find((u2) => u2.id === u.id) || u));
      onClearSelection();
      return { notice: { type: "success", title: "Done", text: `Updated ${updated.length} users to ${bulkRoleTarget}.` } };
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

  const exportNormalizer = (row) => {
    const c = userAssignmentCounts[row.id] || { personnel: 0, client: 0 };
    return {
      id: row.id, email: row.email, name: row.name, role: row.role,
      auth_provider: row.auth_provider || "local",
      effective_role_source: row.effective_role_source || "unknown",
      personnel_links: c.personnel, client_links: c.client,
    };
  };

  if (isTabLoading) return <TabSkeleton />;

  const cols = visibleColumns;

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Users / Invites / Roles */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="h-8 bg-muted border border-border">
          <TabsTrigger value="users" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Users className="h-3 w-3" />Users
          </TabsTrigger>
          <TabsTrigger value="invites" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Mail className="h-3 w-3" />Invites
            <span className={cn("ml-0.5 px-1.5 py-0 text-[0.625rem] h-4 inline-flex items-center rounded-full font-medium", subTab === "invites" ? "bg-muted text-foreground" : "bg-muted text-muted-foreground")}>{invites.length}</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Shield className="h-3 w-3" />Roles
          </TabsTrigger>
        </TabsList>

        {/* Users sub-tab */}
        <TabsContent value="users" className="mt-3">
          <Card className="border-border shadow-none">
            <AdminToolbar
              dataset="users"
              query={query}
              onQueryChange={setQuery}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              rows={filteredUsers}
              selectedRows={selectedRows}
              exportNormalizer={exportNormalizer}
              extraFilters={
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {supportedRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              }
            />
            <BulkBar count={selectedIds.length} onClear={onClearSelection}>
              <Select value={bulkRoleTarget} onValueChange={setBulkRoleTarget}>
                <SelectTrigger className="h-7 w-[140px] text-xs bg-card">
                  <SelectValue placeholder="Target role" />
                </SelectTrigger>
                <SelectContent>
                  {supportedRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm" className="h-7 text-xs"
                disabled={!bulkRoleTarget}
                onClick={() => setIsBulkConfirmOpen(true)}
              >
                Apply
              </Button>
            </BulkBar>
            <CardContent className="p-0">
              {filteredUsers.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No users match the current filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="w-10 px-3 py-2 bg-muted">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                            checked={filteredUsers.filter((e) => e.id !== user.id).length > 0 && filteredUsers.filter((e) => e.id !== user.id).every((e) => selectedIds.includes(e.id))}
                            onChange={() => onToggleSelectAll(filteredUsers.filter((e) => e.id !== user.id).map((e) => e.id))}
                          />
                        </th>
                        {cols.includes("email") && <th className={thClass}><SortButton field="email" label="Email" currentSort={sort} onSort={handleSort} /></th>}
                        {cols.includes("name") && <th className={thClass}><SortButton field="name" label="Name" currentSort={sort} onSort={handleSort} /></th>}
                        {cols.includes("role") && <th className={thClass}><SortButton field="role" label="Role" currentSort={sort} onSort={handleSort} /></th>}
                        {cols.includes("links") && <th className={thClass}><SortButton field="links" label="Assignments" currentSort={sort} onSort={handleSort} /></th>}
                        {cols.includes("source") && <th className={thClass}>Source</th>}
                        <th className={cn(thClass, "text-right pr-3")}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.map((entry) => {
                        const isSelf = entry.id === user.id;
                        const counts = userAssignmentCounts[entry.id] || { personnel: 0, client: 0 };
                        return (
                          <tr key={entry.id} className={rowClass(focusedId === entry.id)} onClick={() => onFocusRecord(entry.id)}>
                            <td className="w-10 px-3 py-2">
                              <input
                                type="checkbox"
                                disabled={isSelf}
                                checked={selectedIds.includes(entry.id)}
                                onChange={(e) => { e.stopPropagation(); onToggleSelection(entry.id); }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                              />
                            </td>
                            {cols.includes("email") && (
                              <td className={tdClass}>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-foreground">{entry.email}</span>
                                  {isSelf && <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">You</span>}
                                </div>
                              </td>
                            )}
                            {cols.includes("name") && <td className={tdClass}>{entry.name || <span className="text-muted-foreground">—</span>}</td>}
                            {cols.includes("role") && (
                              <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                                {isSelf ? (
                                  <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{entry.role}</span>
                                ) : (
                                  <Select value={entry.role} onValueChange={(v) => handleUpdateUserRole(entry, v)}>
                                    <SelectTrigger className="h-7 w-[130px] text-xs cursor-pointer">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {supportedRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                            )}
                            {cols.includes("links") && (
                              <td className={tdClass}>
                                <span className="tabular-nums text-xs text-muted-foreground">{counts.personnel}p / {counts.client}c</span>
                              </td>
                            )}
                            {cols.includes("source") && (
                              <td className={tdClass}>
                                <span className="text-xs text-muted-foreground">{entry.auth_provider || "local"}</span>
                              </td>
                            )}
                            <td className={cn(tdClass, "text-right")}>
                              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer" disabled={isSelf} onClick={() => openEditUserModal(entry)}>
                                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer" disabled={isSelf || actionKey === `delete-user-${entry.id}`} onClick={() => openDeleteUserModal(entry)}>
                                  <Trash2 className="h-3.5 w-3.5" />
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
            <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
              {filteredUsers.length} record{filteredUsers.length !== 1 ? "s" : ""}
            </div>
          </Card>
        </TabsContent>

        {/* Invites sub-tab */}
        <TabsContent value="invites" className="mt-3">
          <InvitesTab
            invites={invites}
            setInvites={setInvites}
            inviteAccessDenied={inviteAccessDenied}
            supportedRoles={supportedRoles}
            withAction={withAction}
            actionKey={actionKey}
            isTabLoading={tabLoading?.invites}
            focusedId={focusedId}
            onFocusRecord={onFocusRecord}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={onClearSelection}
            setNotice={setNotice}
          />
        </TabsContent>

        {/* Roles sub-tab */}
        <TabsContent value="roles" className="mt-3">
          <RolesTab
            supportedRoles={supportedRoles}
            rolePermissions={rolePermissions}
            setRolePermissions={setRolePermissions}
            rolePermissionMap={rolePermissionMap}
            permissionColumns={permissionColumns}
            withAction={withAction}
            actionKey={actionKey}
            isTabLoading={tabLoading?.roles}
            focusedId={focusedId}
            onFocusRecord={onFocusRecord}
          />
        </TabsContent>
      </Tabs>

      {/* Edit user dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update role for {selectedUser?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={selectedUser?.name || ""} disabled placeholder="Name" />
            <Input value={selectedUser?.email || ""} disabled placeholder="Email" />
            <Select value={editForm.role} onValueChange={(v) => setEditForm({ role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {supportedRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedUser && handleUpdateUserRole(selectedUser, editForm.role)} disabled={!selectedUser || actionKey === `save-role-${selectedUser?.id}`}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user dialog */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>This cannot be undone. Permanently delete <strong>{selectedUser?.email}</strong>?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedUser && handleDeleteUser(selectedUser)} disabled={!selectedUser || actionKey === `delete-user-${selectedUser?.id}`}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk role update confirmation */}
      <Dialog open={isBulkConfirmOpen} onOpenChange={setIsBulkConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Role Update</DialogTitle>
            <DialogDescription>
              Change role to <strong>{bulkRoleTarget}</strong> for {selectedRows.filter((e) => e.id !== user.id).length} user(s)?
              This action cannot be easily undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkUserRoleUpdate}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
