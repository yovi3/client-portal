import { useNavigate } from "react-router-dom";
import { Copy, Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { copyText, formatDateTime, responseError } from "./utils";

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right break-all">{value || "—"}</span>
    </div>
  );
}

export default function RecordInspector({
  activeDataset,
  selectedRecord,
  user,
  supportedRoles,
  userAssignmentCounts,
  rolePermissionMap,
  permissionColumns,
  actionKey,
  withAction,
  setUsers,
  setDocuments,
  setCases,
  setRolePermissions,
  setNotice,
  inviteLinks,
}) {
  const navigate = useNavigate();

  if (!selectedRecord) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Click a row to inspect details and actions.
      </div>
    );
  }

  if (activeDataset === "cases") {
    return (
      <div className="space-y-4 p-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Case #{selectedRecord.id}</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{selectedRecord.title || "Untitled"}</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {(selectedRecord.unread_count || 0) > 0 && (
            <Badge variant="destructive">{selectedRecord.unread_count} unread</Badge>
          )}
          {selectedRecord.case_type && <Badge variant="secondary">{selectedRecord.case_type}</Badge>}
        </div>

        <div className="rounded-lg border border-border p-3 space-y-0">
          <InfoRow label="Description" value={selectedRecord.description || "No description"} />
          <InfoRow label="Lawbase #" value={selectedRecord.lawbase_case_number} />
          <InfoRow label="Serial" value={selectedRecord.case_serial} />
          <InfoRow label="Type" value={selectedRecord.case_type || selectedRecord.category} />
          <InfoRow label="Clients" value={(selectedRecord.clients || []).length} />
          <InfoRow label="DSS Team" value={(selectedRecord.personnel || []).length} />
          <InfoRow label="Unread messages" value={selectedRecord.unread_count || 0} />
        </div>

        {(selectedRecord.clients || []).length + (selectedRecord.personnel || []).length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Participants</p>
            <div className="flex flex-wrap gap-1">
              {(selectedRecord.clients || []).map((c) => (
                <Badge key={`cl-${c.id}`} variant="outline" className="text-xs">{c.name || c.email}</Badge>
              ))}
              {(selectedRecord.personnel || []).map((p) => (
                <Badge key={`pe-${p.id}`} variant="secondary" className="text-xs">{p.name || p.email}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" onClick={() => navigate(`/cases/${selectedRecord.id}`)}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open case
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/messages?case_id=${selectedRecord.id}`)}>
            Messages
          </Button>
        </div>
      </div>
    );
  }

  if (activeDataset === "users") {
    const counts = userAssignmentCounts[selectedRecord.id] || { personnel: 0, client: 0 };
    const isSelf = selectedRecord.id === user.id;

    const handleUpdateUserRole = async (nextRole) => {
      if (!nextRole || nextRole === selectedRecord.role) return;
      await withAction(`save-role-${selectedRecord.id}`, "Role update", async () => {
        const res = await apiFetch(`/users/${selectedRecord.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        });
        if (!res.ok) throw await responseError(res);
        const updated = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        return { notice: { type: "success", title: "Role updated", text: `${updated.name || updated.email} is now ${updated.role}.` } };
      });
    };

    return (
      <div className="space-y-4 p-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">User #{selectedRecord.id}</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{selectedRecord.name || selectedRecord.email}</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{selectedRecord.role}</Badge>
          <Badge variant="secondary">{selectedRecord.auth_provider || "local"}</Badge>
          {isSelf && <Badge className="bg-primary/10 text-primary border-primary/20">You</Badge>}
        </div>

        <div className="rounded-lg border border-border p-3 space-y-0">
          <InfoRow label="Email" value={selectedRecord.email} />
          <InfoRow label="Name" value={selectedRecord.name} />
          <InfoRow label="Role" value={selectedRecord.role} />
          <InfoRow label="Auth provider" value={selectedRecord.auth_provider || "local"} />
          <InfoRow label="Role source" value={selectedRecord.effective_role_source || "unknown"} />
          <InfoRow label="Personnel links" value={counts.personnel} />
          <InfoRow label="Client links" value={counts.client} />
        </div>

        {!isSelf && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Change role</p>
            <Select value={selectedRecord.role} onValueChange={handleUpdateUserRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {supportedRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  }

  if (activeDataset === "documents") {
    const handleUpdateStatus = async (status) => {
      await withAction(`doc-status-${selectedRecord.id}`, "Document status", async () => {
        const res = await apiFetch(`/admin/documents/${selectedRecord.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw await responseError(res);
        const updated = await res.json();
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        return { notice: { type: "success", title: "Status updated", text: `Document #${selectedRecord.id} → ${status}.` } };
      });
    };

    return (
      <div className="space-y-4 p-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Document #{selectedRecord.id}</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{selectedRecord.name}</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{selectedRecord.status}</Badge>
          <Badge variant="secondary">{selectedRecord.file_path ? "File uploaded" : "No file"}</Badge>
        </div>

        <div className="rounded-lg border border-border p-3 space-y-0">
          <InfoRow label="Case" value={selectedRecord.case_title} />
          <InfoRow label="Case ID" value={selectedRecord.case_id} />
          <InfoRow label="Status" value={selectedRecord.status} />
          <InfoRow label="Upload date" value={formatDateTime(selectedRecord.upload_date)} />
          <InfoRow label="File path" value={selectedRecord.file_path} />
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Change status</p>
          <Select value={selectedRecord.status} onValueChange={handleUpdateStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" disabled={!selectedRecord.file_path} onClick={() => window.open(`${API_BASE_URL}/documents/${selectedRecord.id}/download`, "_blank")}>
            <Download className="mr-1.5 h-3.5 w-3.5" />Download
          </Button>
          {selectedRecord.case_id && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/cases/${selectedRecord.case_id}`)}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open case
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (activeDataset === "invites") {
    return (
      <div className="space-y-4 p-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invite #{selectedRecord.id}</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{selectedRecord.invited_email}</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={selectedRecord.status === "pending" ? "default" : "secondary"}>{selectedRecord.status}</Badge>
          <Badge variant="outline">{selectedRecord.role}</Badge>
        </div>

        <div className="rounded-lg border border-border p-3 space-y-0">
          <InfoRow label="Email" value={selectedRecord.invited_email} />
          <InfoRow label="Role" value={selectedRecord.role} />
          <InfoRow label="Status" value={selectedRecord.status} />
          <InfoRow label="Created" value={formatDateTime(selectedRecord.created_at)} />
          <InfoRow label="Expires" value={formatDateTime(selectedRecord.expires_at)} />
        </div>

        {inviteLinks?.[selectedRecord.id] && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Invite link</p>
            <p className="text-xs text-muted-foreground break-all font-mono">{inviteLinks[selectedRecord.id]}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {inviteLinks?.[selectedRecord.id] ? (
            <Button
              size="sm" variant="outline"
              onClick={async () => {
                try {
                  await copyText(inviteLinks[selectedRecord.id]);
                  setNotice({ type: "success", title: "Copied", text: "Invite link copied." });
                } catch {
                  setNotice({ type: "error", title: "Copy failed", text: "Could not copy link." });
                }
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />Copy link
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Link not cached (create a new invite to get a link)</p>
          )}
        </div>
      </div>
    );
  }

  // Roles inspector
  const handleTogglePermission = async (permissionKey, checked) => {
    const existing = rolePermissionMap?.[selectedRecord.role]?.[permissionKey];
    if (checked && existing) return;
    if (!checked && !existing) return;

    if (checked) {
      await withAction(`perm-on-${selectedRecord.role}-${permissionKey}`, "Permission grant", async () => {
        const res = await apiFetch("/roles/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: selectedRecord.role, permission: permissionKey }),
        });
        if (!res.ok) throw await responseError(res);
        const created = await res.json();
        setRolePermissions((prev) => [...prev, created]);
        return { notice: { type: "success", title: "Permission granted", text: `${permissionKey} enabled for ${selectedRecord.role}.` } };
      });
      return;
    }

    await withAction(`perm-off-${selectedRecord.role}-${permissionKey}`, "Permission revoke", async () => {
      const res = await apiFetch(`/roles/permissions/${existing.id}`, { method: "DELETE" });
      if (!res.ok) throw await responseError(res);
      setRolePermissions((prev) => prev.filter((e) => e.id !== existing.id));
      return { notice: { type: "success", title: "Permission revoked", text: `${permissionKey} disabled for ${selectedRecord.role}.` } };
    });
  };

  return (
    <div className="space-y-3 p-1">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{selectedRecord.role}</h3>
        <p className="text-sm text-muted-foreground">{selectedRecord.enabled} permissions enabled</p>
      </div>
      <div className="space-y-1.5">
        {permissionColumns.map((perm) => {
          const enabled = Boolean(rolePermissionMap?.[selectedRecord.role]?.[perm]);
          const busyKey = `perm-${enabled ? "off" : "on"}-${selectedRecord.role}-${perm}`;
          return (
            <label
              key={perm}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted/50"
            >
              <code className="text-xs text-muted-foreground">{perm}</code>
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer accent-slate-900"
                checked={enabled}
                disabled={actionKey === busyKey}
                onChange={(e) => handleTogglePermission(perm, e.target.checked)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
