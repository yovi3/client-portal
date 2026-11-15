import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, ExternalLink, Inbox, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CaseInboxPanel } from "../CaseInbox";

export default function CasesTab({
  cases,
  setCases,
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
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORTS.cases);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS.cases);

  const [isCaseEditOpen, setIsCaseEditOpen] = useState(false);
  const [isCaseDeleteOpen, setIsCaseDeleteOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseEditForm, setCaseEditForm] = useState({ title: "", description: "", lawbase_case_number: "", case_type: "" });
  const [subTab, setSubTab] = useState("cases");

  const sortAccessors = useMemo(() => ({
    title: (e) => e.title || "",
    lawbase: (e) => e.lawbase_case_number || "",
    serial: (e) => e.case_serial || "",
    clients: (e) => (e.clients || []).length,
    team: (e) => (e.personnel || []).length,
    unread: (e) => e.unread_count || 0,
  }), []);

  const filteredCases = useMemo(() => {
    const q = normalizeText(query);
    return sortRows(
      cases.filter((e) => {
        if (!q) return true;
        return normalizeText(`${e.title} ${e.description} ${e.lawbase_case_number} ${e.case_serial}`).includes(q);
      }),
      sort,
      sortAccessors
    );
  }, [cases, query, sort, sortAccessors]);

  const selectedRows = useMemo(() => {
    const sel = new Set(selectedIds);
    return filteredCases.filter((r) => sel.has(r.id));
  }, [filteredCases, selectedIds]);

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

  const openEditCaseModal = (entry) => {
    setSelectedCase(entry);
    setCaseEditForm({
      title: entry.title || "",
      description: entry.description || "",
      lawbase_case_number: entry.lawbase_case_number || "",
      case_type: entry.case_type || entry.category || "",
    });
    setIsCaseEditOpen(true);
  };

  const openDeleteCaseModal = (entry) => {
    setSelectedCase(entry);
    setIsCaseDeleteOpen(true);
  };

  const handleUpdateCase = async () => {
    if (!selectedCase) return;
    await withAction(`case-edit-${selectedCase.id}`, "Case update", async () => {
      const res = await apiFetch(`/cases/${selectedCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseEditForm.title.trim() || selectedCase.title,
          description: caseEditForm.description.trim() || null,
          lawbase_case_number: caseEditForm.lawbase_case_number.trim() || selectedCase.lawbase_case_number,
          case_type: caseEditForm.case_type.trim() || selectedCase.case_type || "General",
        }),
      });
      if (!res.ok) throw await responseError(res);
      const updated = await res.json();
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCase(updated);
      setIsCaseEditOpen(false);
      return { notice: { type: "success", title: "Case updated", text: `Case #${updated.id} saved.` } };
    });
  };

  const handleDeleteCase = async () => {
    if (!selectedCase) return;
    await withAction(`case-delete-${selectedCase.id}`, "Case delete", async () => {
      const res = await apiFetch(`/cases/${selectedCase.id}`, { method: "DELETE" });
      if (!res.ok) throw await responseError(res);
      setCases((prev) => prev.filter((c) => c.id !== selectedCase.id));
      setIsCaseDeleteOpen(false);
      setSelectedCase(null);
      return { notice: { type: "success", title: "Case deleted", text: `Case #${selectedCase.id} removed.` } };
    });
  };

  const exportNormalizer = (row) => ({
    id: row.id,
    title: row.title,
    lawbase_case_number: row.lawbase_case_number,
    case_serial: row.case_serial,
    clients: (row.clients || []).length,
    personnel: (row.personnel || []).length,
    unread_count: row.unread_count || 0,
  });

  if (isTabLoading) return <TabSkeleton />;

  const cols = visibleColumns;

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="h-8 bg-muted border border-border">
          <TabsTrigger value="cases" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Briefcase className="h-3 w-3" />Cases
          </TabsTrigger>
          <TabsTrigger value="inbox" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Inbox className="h-3 w-3" />SMS Inbox
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="mt-3">
      <Card className="border-border shadow-none">
        <AdminToolbar
          dataset="cases"
          query={query}
          onQueryChange={setQuery}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          rows={filteredCases}
          selectedRows={selectedRows}
          exportNormalizer={exportNormalizer}
          extraActions={
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("/createcase")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Create case
            </Button>
          }
        />
        <BulkBar count={selectedIds.length} onClear={onClearSelection} />
        <CardContent className="p-0">
          {filteredCases.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No cases match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-2 bg-muted">
                      <input
                        type="checkbox"
                        aria-label="Select all cases"
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        checked={filteredCases.length > 0 && filteredCases.every((e) => selectedIds.includes(e.id))}
                        onChange={() => onToggleSelectAll(filteredCases.map((e) => e.id))}
                      />
                    </th>
                    {cols.includes("title") && <th className={thClass}><SortButton field="title" label="Case" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("lawbase") && <th className={thClass}><SortButton field="lawbase" label="Lawbase" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("serial") && <th className={thClass}><SortButton field="serial" label="Serial" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("clients") && <th className={thClass}><SortButton field="clients" label="Clients" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("team") && <th className={thClass}><SortButton field="team" label="Team" currentSort={sort} onSort={handleSort} /></th>}
                    {cols.includes("unread") && <th className={thClass}><SortButton field="unread" label="Unread" currentSort={sort} onSort={handleSort} /></th>}
                    <th className={cn(thClass, "text-right pr-3")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCases.map((entry) => (
                    <tr key={entry.id} className={rowClass(focusedId === entry.id)} onClick={() => onFocusRecord(entry.id)}>
                      <td className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select case: ${entry.title || "Untitled"}`}
                          checked={selectedIds.includes(entry.id)}
                          onChange={(e) => { e.stopPropagation(); onToggleSelection(entry.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      {cols.includes("title") && (
                        <td className={tdClass}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{entry.title || "Untitled"}</span>
                            {(entry.unread_count || 0) > 0 && (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0 text-[0.625rem] font-semibold text-red-700">{entry.unread_count} new</span>
                            )}
                          </div>
                          {entry.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[280px] mt-0.5">{entry.description}</p>
                          )}
                        </td>
                      )}
                      {cols.includes("lawbase") && (
                        <td className={tdClass}><span className="font-mono text-xs text-muted-foreground">{entry.lawbase_case_number || "—"}</span></td>
                      )}
                      {cols.includes("serial") && (
                        <td className={tdClass}><span className="font-mono text-xs text-muted-foreground">{entry.case_serial || "—"}</span></td>
                      )}
                      {cols.includes("clients") && <td className={tdClass}><span className="text-foreground tabular-nums">{(entry.clients || []).length}</span></td>}
                      {cols.includes("team") && <td className={tdClass}><span className="text-foreground tabular-nums">{(entry.personnel || []).length}</span></td>}
                      {cols.includes("unread") && <td className={tdClass}><span className={cn("tabular-nums", (entry.unread_count || 0) > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>{entry.unread_count || 0}</span></td>}
                      <td className={cn(tdClass, "text-right")}>
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer" onClick={() => openEditCaseModal(entry)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:bg-primary/5 cursor-pointer" onClick={() => navigate(`/cases/${entry.id}`)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />Open
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            onClick={() => openDeleteCaseModal(entry)}
                            disabled={actionKey === `case-delete-${entry.id}`}
                          >
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
          {filteredCases.length} record{filteredCases.length !== 1 ? "s" : ""}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="inbox" className="mt-3">
          <CaseInboxPanel />
        </TabsContent>
      </Tabs>

      {/* Edit case dialog */}
      <Dialog open={isCaseEditOpen} onOpenChange={setIsCaseEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Case</DialogTitle>
            <DialogDescription>Update metadata for case #{selectedCase?.id}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={caseEditForm.title} onChange={(e) => setCaseEditForm((p) => ({ ...p, title: e.target.value }))} placeholder="Case title" />
            <Input value={caseEditForm.lawbase_case_number} onChange={(e) => setCaseEditForm((p) => ({ ...p, lawbase_case_number: e.target.value }))} placeholder="Lawbase case number" />
            <Input value={caseEditForm.case_type} onChange={(e) => setCaseEditForm((p) => ({ ...p, case_type: e.target.value }))} placeholder="Case type" />
            <Input value={caseEditForm.description} onChange={(e) => setCaseEditForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCaseEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateCase} disabled={!selectedCase || actionKey === `case-edit-${selectedCase?.id}`}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete case dialog */}
      <Dialog open={isCaseDeleteOpen} onOpenChange={setIsCaseDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Case</DialogTitle>
            <DialogDescription>This cannot be undone. Delete case #{selectedCase?.id}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCaseDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCase} disabled={!selectedCase || actionKey === `case-delete-${selectedCase?.id}`}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
