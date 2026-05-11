import { useMemo, useState, useCallback } from "react";
import { Copy, Plus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { StatusBadge, TabSkeleton } from "./StatCard";
import { AdminToolbar, BulkBar, SortButton, thClass, tdClass, rowClass } from "./AdminToolbar";
import { DEFAULT_COLUMNS, DEFAULT_SORTS, normalizeText, sortRows, formatDateTime, copyText, responseError } from "./utils";

export default function InvitesTab({
  invites,
  setInvites,
  inviteAccessDenied,
  supportedRoles,
  withAction,
  actionKey,
  isTabLoading,
  focusedId,
  onFocusRecord,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  onClearSelection,
  setNotice,
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORTS.invites);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS.invites);
  const [statusFilter, setStatusFilter] = useState("all");

  const [inviteLinks, setInviteLinks] = useState({});
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    role: "client", email: "", first_name: "", last_name: "",
    phone: "", street_1: "", street_2: "", city: "", state: "", zip_code: "", country: "US",
  });

  const sortAccessors = useMemo(() => ({
    email: (e) => e.invited_email || "",
    role: (e) => e.role || "",
    status: (e) => e.status || "",
    created: (e) => e.created_at || "",
    expires: (e) => e.expires_at || "",
  }), []);

  const filteredInvites = useMemo(() => {
    const q = normalizeText(query);
    return sortRows(
      invites.filter((e) => {
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        if (!q) return true;
        return normalizeText(`${e.invited_email} ${e.role} ${e.status}`).includes(q);
      }),
      sort,
      sortAccessors
    );
  }, [invites, query, sort, sortAccessors, statusFilter]);

  const selectedRows = useMemo(() => {
    const sel = new Set(selectedIds);
    return filteredInvites.filter((r) => sel.has(r.id));
  }, [filteredInvites, selectedIds]);

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

  const handleCreateInvite = async (event) => {
    event.preventDefault();
    if (!inviteForm.email.trim()) {
      setNotice({ type: "error", title: "Create invite", text: "Email is required." });
      return;
    }
    await withAction("create-invite", "Create invite", async () => {
      const res = await apiFetch("/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: inviteForm.role,
          email: inviteForm.email.trim(),
          first_name: inviteForm.first_name.trim() || null,
          last_name: inviteForm.last_name.trim() || null,
          phone: inviteForm.phone.trim() || null,
          street_1: inviteForm.street_1.trim() || null,
          street_2: inviteForm.street_2.trim() || null,
          city: inviteForm.city.trim() || null,
          state: inviteForm.state.trim() || null,
          zip_code: inviteForm.zip_code.trim() || null,
          country: inviteForm.country.trim() || null,
        }),
      });
      if (!res.ok) throw await responseError(res);
      const data = await res.json();
      if (data?.invite?.id && data?.invite_url) {
        setInviteLinks((prev) => ({ ...prev, [data.invite.id]: data.invite_url }));
      }
      if (data?.invite) {
        setInvites((prev) => [data.invite, ...prev]);
      }
      setLastInviteUrl(data?.invite_url || "");
      setInviteForm({
        role: "client", email: "", first_name: "", last_name: "",
        phone: "", street_1: "", street_2: "", city: "", state: "", zip_code: "", country: "US",
      });
      setIsInviteDialogOpen(false);
      if (data?.invite_url) {
        copyText(data.invite_url).catch(() => {});
      }
      return { notice: { type: "success", title: "Invite created", text: data?.invite_url ? "Link copied to clipboard." : "Invite created." } };
    });
  };

  const exportNormalizer = (row) => ({
    id: row.id, invited_email: row.invited_email, role: row.role,
    status: row.status, created_at: row.created_at, expires_at: row.expires_at,
  });

  const inviteRoleOptions = supportedRoles.length > 0 ? supportedRoles : ["client"];

  if (isTabLoading) return <TabSkeleton />;

  const cols = visibleColumns;

  return (
    <div className="space-y-4">
      <Card className="border-border shadow-none">
        <AdminToolbar
          dataset="invites"
          query={query}
          onQueryChange={setQuery}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          rows={filteredInvites}
          selectedRows={selectedRows}
          exportNormalizer={exportNormalizer}
          extraFilters={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          }
          extraActions={!inviteAccessDenied ? (
            <Button size="sm" className="h-8 text-xs" onClick={() => setIsInviteDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />New invite
            </Button>
          ) : null}
        />
        <BulkBar count={selectedIds.length} onClear={onClearSelection} />
        <CardContent className="p-0">
          {inviteAccessDenied ? (
            <div className="p-6">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Permission required</AlertTitle>
                <AlertDescription>You need <code>invites:manage</code> to view invites.</AlertDescription>
              </Alert>
            </div>
          ) : filteredInvites.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No invites match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-2 bg-muted">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        checked={filteredInvites.length > 0 && filteredInvites.every((e) => selectedIds.includes(e.id))}
                        onChange={() => onToggleSelectAll(filteredInvites.map((e) => e.id))}
                      />
                    </th>
                    {cols.includes("email") && <th className={thClass}><SortButton field="email" label="Email" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("role") && <th className={thClass}><SortButton field="role" label="Role" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("status") && <th className={thClass}><SortButton field="status" label="Status" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("created") && <th className={thClass}><SortButton field="created" label="Created" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("expires") && <th className={thClass}><SortButton field="expires" label="Expires" currentSort={sort} onSort={handleSort} /></th>}
                    <th className={cn(thClass, "text-right pr-3")}>Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredInvites.map((entry) => (
                    <tr key={entry.id} className={rowClass(focusedId === entry.id)} onClick={() => onFocusRecord(entry.id)}>
                      <td className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(entry.id)}
                          onChange={(e) => { e.stopPropagation(); onToggleSelection(entry.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      {cols.includes("email") && (
                        <td className={tdClass}><span className="font-semibold text-foreground">{entry.invited_email}</span></td>
                      )}
                      {cols.includes("role") && (
                        <td className={tdClass}>
                          <span className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{entry.role}</span>
                        </td>
                      )}
                      {cols.includes("status") && <td className={tdClass}><StatusBadge status={entry.status} /></td>}
                      {cols.includes("created") && <td className={tdClass}><span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(entry.created_at)}</span></td>}
                      {cols.includes("expires") && <td className={tdClass}><span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(entry.expires_at)}</span></td>}
                      <td className={cn(tdClass, "text-right")}>
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {inviteLinks[entry.id] ? (
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:bg-primary/5 cursor-pointer"
                              onClick={async () => {
                                try {
                                  await copyText(inviteLinks[entry.id]);
                                  setNotice({ type: "success", title: "Copied", text: `Link for invite #${entry.id} copied.` });
                                } catch {
                                  setNotice({ type: "error", title: "Copy failed", text: "Could not copy link." });
                                }
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" />Copy
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60 pr-1">No link</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
          {filteredInvites.length} record{filteredInvites.length !== 1 ? "s" : ""}
        </div>
      </Card>

      {lastInviteUrl && (
        <Alert className="border-border shadow-none">
          <Copy className="h-4 w-4" />
          <AlertTitle>Last invite link</AlertTitle>
          <AlertDescription className="break-all font-mono text-xs">{lastInviteUrl}</AlertDescription>
        </Alert>
      )}

      {/* Create invite dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Create Invite</DialogTitle>
            <DialogDescription>Generate a one-time onboarding link for a new user.</DialogDescription>
          </DialogHeader>
          {inviteAccessDenied ? (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Permission required</AlertTitle>
              <AlertDescription>You need <code>invites:manage</code> to create invites.</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleCreateInvite} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((prev) => ({ ...prev, role: v }))}>
                    <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                    <SelectContent>
                      {inviteRoleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input name="email" value={inviteForm.email} onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email *" />
                <Input name="phone" value={inviteForm.phone} onChange={(e) => setInviteForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" />
                <Input name="first_name" value={inviteForm.first_name} onChange={(e) => setInviteForm((p) => ({ ...p, first_name: e.target.value }))} placeholder="First name" />
                <Input name="last_name" value={inviteForm.last_name} onChange={(e) => setInviteForm((p) => ({ ...p, last_name: e.target.value }))} placeholder="Last name" />
                <Input name="street_1" value={inviteForm.street_1} onChange={(e) => setInviteForm((p) => ({ ...p, street_1: e.target.value }))} placeholder="Street address" />
                <Input name="street_2" value={inviteForm.street_2} onChange={(e) => setInviteForm((p) => ({ ...p, street_2: e.target.value }))} placeholder="Apt / Suite" />
                <Input name="city" value={inviteForm.city} onChange={(e) => setInviteForm((p) => ({ ...p, city: e.target.value }))} placeholder="City" />
                <Input name="state" value={inviteForm.state} onChange={(e) => setInviteForm((p) => ({ ...p, state: e.target.value }))} placeholder="State" />
                <Input name="zip_code" value={inviteForm.zip_code} onChange={(e) => setInviteForm((p) => ({ ...p, zip_code: e.target.value }))} placeholder="ZIP code" />
                <Input name="country" value={inviteForm.country} onChange={(e) => setInviteForm((p) => ({ ...p, country: e.target.value }))} placeholder="Country" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={actionKey === "create-invite"}>
                  {actionKey === "create-invite" ? "Creating..." : "Create Invite"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
