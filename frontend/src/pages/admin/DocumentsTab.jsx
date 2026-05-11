import { useMemo, useState, useCallback } from "react";
import { ArrowUpDown, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { StatusBadge, TabSkeleton } from "./StatCard";
import { AdminToolbar, BulkBar, SortButton, thClass, tdClass, rowClass } from "./AdminToolbar";
import { DEFAULT_COLUMNS, DEFAULT_SORTS, normalizeText, sortRows, formatDateTime, responseError } from "./utils";

export default function DocumentsTab({
  documents,
  setDocuments,
  withAction,
  actionKey,
  isTabLoading,
  focusedId,
  onFocusRecord,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  onClearSelection,
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORTS.documents);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS.documents);
  const [statusFilter, setStatusFilter] = useState("all");
  const [bulkDocumentStatus, setBulkDocumentStatus] = useState("reviewed");
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isDeleteFileOpen, setIsDeleteFileOpen] = useState(false);
  const [deleteFileDocId, setDeleteFileDocId] = useState(null);

  const sortAccessors = useMemo(() => ({
    name: (e) => e.name || "",
    case: (e) => e.case_title || "",
    status: (e) => e.status || "",
    created: (e) => e.upload_date || "",
  }), []);

  const filteredDocuments = useMemo(() => {
    const q = normalizeText(query);
    return sortRows(
      documents.filter((e) => {
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        if (!q) return true;
        return normalizeText(`${e.name} ${e.case_title} ${e.status} ${e.file_path}`).includes(q);
      }),
      sort,
      sortAccessors
    );
  }, [documents, query, sort, sortAccessors, statusFilter]);

  const selectedRows = useMemo(() => {
    const sel = new Set(selectedIds);
    return filteredDocuments.filter((r) => sel.has(r.id));
  }, [filteredDocuments, selectedIds]);

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

  const handleUpdateDocumentStatus = async (docId, status) => {
    await withAction(`doc-status-${docId}`, "Document status", async () => {
      const res = await apiFetch(`/admin/documents/${docId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw await responseError(res);
      const updated = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      return { notice: { type: "success", title: "Status updated", text: `Document #${docId} → ${status}.` } };
    });
  };

  const handleDeleteDocumentFile = async (docId) => {
    setIsDeleteFileOpen(false);
    setDeleteFileDocId(null);
    await withAction(`doc-delete-${docId}`, "Remove file", async () => {
      const res = await apiFetch(`/admin/documents/${docId}/file`, { method: "DELETE" });
      if (!res.ok) throw await responseError(res);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, file_path: null, status: "required" } : d))
      );
      return { notice: { type: "success", title: "File removed", text: `File removed for document #${docId}.` } };
    });
  };

  const handleBulkDocumentStatusUpdate = async () => {
    const ids = selectedRows.map((e) => e.id);
    if (!bulkDocumentStatus || ids.length === 0) return;
    setIsBulkConfirmOpen(false);
    await withAction("bulk-document-status", "Bulk document update", async () => {
      const updated = [];
      for (const id of ids) {
        const res = await apiFetch(`/admin/documents/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: bulkDocumentStatus }),
        });
        if (!res.ok) throw await responseError(res);
        updated.push(await res.json());
      }
      setDocuments((prev) => prev.map((d) => updated.find((d2) => d2.id === d.id) || d));
      onClearSelection();
      return { notice: { type: "success", title: "Done", text: `Updated ${updated.length} documents to ${bulkDocumentStatus}.` } };
    });
  };

  const exportNormalizer = (row) => ({
    id: row.id, name: row.name, case_title: row.case_title, case_id: row.case_id,
    status: row.status, file_path: row.file_path, upload_date: row.upload_date,
  });

  if (isTabLoading) return <TabSkeleton />;

  const cols = visibleColumns;

  return (
    <div className="space-y-4">
      <Card className="border-border shadow-none">
        <AdminToolbar
          dataset="documents"
          query={query}
          onQueryChange={setQuery}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          rows={filteredDocuments}
          selectedRows={selectedRows}
          exportNormalizer={exportNormalizer}
          extraFilters={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="uploaded">Uploaded</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <BulkBar count={selectedIds.length} onClear={onClearSelection}>
          <Select value={bulkDocumentStatus} onValueChange={setBulkDocumentStatus}>
            <SelectTrigger className="h-7 w-[140px] text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm" className="h-7 text-xs"
            onClick={() => setIsBulkConfirmOpen(true)}
          >
            Apply
          </Button>
        </BulkBar>
        <CardContent className="p-0">
          {filteredDocuments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No documents match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-2 bg-muted">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        checked={filteredDocuments.length > 0 && filteredDocuments.every((e) => selectedIds.includes(e.id))}
                        onChange={() => onToggleSelectAll(filteredDocuments.map((e) => e.id))}
                      />
                    </th>
                    {cols.includes("name") && <th className={thClass}><SortButton field="name" label="Document" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("case") && <th className={thClass}><SortButton field="case" label="Case" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("status") && <th className={thClass}><SortButton field="status" label="Status" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("created") && <th className={thClass}><SortButton field="created" label="Created" currentSort={sort} onSort={handleSort} /></th>}
                    <th className={cn(thClass, "text-right pr-3")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDocuments.map((entry) => (
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
                      {cols.includes("name") && (
                        <td className={tdClass}>
                          <span className="font-semibold text-foreground">{entry.name}</span>
                          {entry.file_path && (
                            <p className="text-xs text-muted-foreground truncate max-w-[240px] mt-0.5 font-mono">{entry.file_path}</p>
                          )}
                        </td>
                      )}
                      {cols.includes("case") && (
                        <td className={tdClass}>
                          <span className="text-sm font-medium text-foreground">{entry.case_title || "—"}</span>
                          <p className="text-xs text-muted-foreground">Case #{entry.case_id}</p>
                        </td>
                      )}
                      {cols.includes("status") && (
                        <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={entry.status} />
                            <Select value={entry.status} onValueChange={(v) => handleUpdateDocumentStatus(entry.id, v)}>
                              <SelectTrigger className="h-6 w-7 p-0 border-0 bg-transparent cursor-pointer opacity-40 hover:opacity-100">
                                <ArrowUpDown className="h-3 w-3 mx-auto" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="required">Required</SelectItem>
                                <SelectItem value="uploaded">Uploaded</SelectItem>
                                <SelectItem value="reviewed">Reviewed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                      )}
                      {cols.includes("created") && <td className={tdClass}><span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(entry.upload_date)}</span></td>}
                      <td className={cn(tdClass, "text-right")}>
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:bg-primary/5 cursor-pointer" disabled={!entry.file_path} onClick={() => window.open(`${API_BASE_URL}/documents/${entry.id}/download`, "_blank")}>
                            <Download className="h-3.5 w-3.5 mr-1" />Download
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer" disabled={!entry.file_path || actionKey === `doc-delete-${entry.id}`} onClick={() => { setDeleteFileDocId(entry.id); setIsDeleteFileOpen(true); }}>
                            <Trash2 className="h-3.5 w-3.5" />
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
        <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
          {filteredDocuments.length} record{filteredDocuments.length !== 1 ? "s" : ""}
        </div>
      </Card>

      {/* Bulk status update confirmation */}
      <Dialog open={isBulkConfirmOpen} onOpenChange={setIsBulkConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Status Update</DialogTitle>
            <DialogDescription>
              Change status to <strong>{bulkDocumentStatus}</strong> for {selectedRows.length} document(s)?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkDocumentStatusUpdate}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete file confirmation */}
      <Dialog open={isDeleteFileOpen} onOpenChange={setIsDeleteFileOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Remove File</DialogTitle>
            <DialogDescription>
              This will permanently remove the uploaded file for document #{deleteFileDocId}. The document record will remain with status "required".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteFileOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteFileDocId && handleDeleteDocumentFile(deleteFileDocId)}>Remove File</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
