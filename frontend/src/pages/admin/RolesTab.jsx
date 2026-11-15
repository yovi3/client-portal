import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { TabSkeleton } from "./StatCard";
import { AdminToolbar, SortButton, thClass, tdClass, rowClass } from "./AdminToolbar";
import { DEFAULT_COLUMNS, DEFAULT_SORTS, PREDEFINED_PERMISSIONS, normalizeText, sortRows, responseError } from "./utils";

export default function RolesTab({
  supportedRoles,
  rolePermissions,
  setRolePermissions,
  rolePermissionMap,
  permissionColumns,
  withAction,
  actionKey,
  isTabLoading,
  focusedId,
  onFocusRecord,
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORTS.roles);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS.roles);

  const roleRows = useMemo(() => {
    return supportedRoles.map((roleName) => {
      const permissions = permissionColumns.filter((k) => rolePermissionMap?.[roleName]?.[k]);
      return {
        id: roleName,
        role: roleName,
        enabled: permissions.length,
        manageCount: permissions.filter((k) => k.includes("manage")).length,
        permissions,
      };
    });
  }, [permissionColumns, rolePermissionMap, supportedRoles]);

  const sortAccessors = useMemo(() => ({
    role: (e) => e.role,
    enabled: (e) => e.enabled,
    manage: (e) => e.manageCount,
    preview: (e) => e.permissions.join(" "),
  }), []);

  const filteredRoles = useMemo(() => {
    const q = normalizeText(query);
    return sortRows(
      roleRows.filter((e) => {
        if (!q) return true;
        return normalizeText(`${e.role} ${e.permissions.join(" ")}`).includes(q);
      }),
      sort,
      sortAccessors
    );
  }, [query, roleRows, sort, sortAccessors]);

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

  const handleToggleRolePermission = async (roleName, permissionKey, checked) => {
    const existing = rolePermissionMap?.[roleName]?.[permissionKey];
    if (checked && existing) return;
    if (!checked && !existing) return;

    if (checked) {
      await withAction(`perm-on-${roleName}-${permissionKey}`, "Permission grant", async () => {
        const res = await apiFetch("/roles/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: roleName, permission: permissionKey }),
        });
        if (!res.ok) throw await responseError(res);
        const created = await res.json();
        setRolePermissions((prev) => [...prev, created]);
        return { notice: { type: "success", title: "Permission granted", text: `${permissionKey} enabled for ${roleName}.` } };
      });
      return;
    }

    await withAction(`perm-off-${roleName}-${permissionKey}`, "Permission revoke", async () => {
      const res = await apiFetch(`/roles/permissions/${existing.id}`, { method: "DELETE" });
      if (!res.ok) throw await responseError(res);
      setRolePermissions((prev) => prev.filter((e) => e.id !== existing.id));
      return { notice: { type: "success", title: "Permission revoked", text: `${permissionKey} disabled for ${roleName}.` } };
    });
  };

  const exportNormalizer = (row) => ({
    role: row.role,
    enabled_permissions: row.enabled,
    manage_permissions: row.manageCount,
    permissions: row.permissions.join(" | "),
  });

  if (isTabLoading) return <TabSkeleton />;

  const cols = visibleColumns;

  return (
    <div className="space-y-4">
      <Card className="border-border shadow-none">
        <AdminToolbar
          dataset="roles"
          query={query}
          onQueryChange={setQuery}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          rows={filteredRoles}
          selectedRows={[]}
          exportNormalizer={exportNormalizer}
        />
        <CardContent className="p-0">
          {filteredRoles.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No roles found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border">
                    {cols.includes("role") && <th className={thClass}><SortButton field="role" label="Role" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("enabled") && <th className={thClass}><SortButton field="enabled" label="Permissions" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("manage") && <th className={thClass}><SortButton field="manage" label="Manage grants" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("preview") && <th className={thClass}>Preview</th>}
                    <th className={cn(thClass, "text-right pr-3")}>Edit permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRoles.map((entry) => (
                    <tr key={entry.role} className={rowClass(focusedId === entry.role)} onClick={() => onFocusRecord(entry.role)}>
                      {cols.includes("role") && (
                        <td className={tdClass}><span className="font-semibold text-foreground">{entry.role}</span></td>
                      )}
                      {cols.includes("enabled") && <td className={tdClass}><span className="tabular-nums font-medium text-primary">{entry.enabled}</span></td>}
                      {cols.includes("manage") && <td className={tdClass}><span className={cn("tabular-nums", entry.manageCount > 0 ? "text-amber-700 font-medium" : "text-muted-foreground")}>{entry.manageCount}</span></td>}
                      {cols.includes("preview") && (
                        <td className={tdClass}>
                          <div className="flex flex-wrap gap-1">
                            {entry.permissions.slice(0, 3).map((k) => (
                              <span key={k} className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">{k}</span>
                            ))}
                            {entry.permissions.length > 3 && (
                              <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">+{entry.permissions.length - 3}</span>
                            )}
                          </div>
                        </td>
                      )}
                      <td className={cn(tdClass, "text-right")}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:bg-primary/5 cursor-pointer" onClick={(e) => { e.stopPropagation(); onFocusRecord(entry.role); }}>
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
          {filteredRoles.length} role{filteredRoles.length !== 1 ? "s" : ""} · Click a row to manage permissions
        </div>
      </Card>
    </div>
  );
}
