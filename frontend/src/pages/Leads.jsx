import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, FilePlus, Filter, List, Loader2, MessagesSquare, Pencil, Plus, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import ConversationThread from "@/components/conversation/ConversationThread";
import FileRequestsPanel from "@/components/conversation/FileRequestsPanel";
import RequestDocumentsDialog from "@/components/conversation/RequestDocumentsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, getWsBaseUrl } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { formatPhone } from "@/lib/texting";

// Leads (tasks 1.2 and 1.4). The conversation view is where intake staff text leads;
// the lead list is the table for adding and editing them.

const STATUS_LABEL = { open: "Open", signed: "Signed", closed: "Closed" };
const EMPTY_FORM = { lead_number: "", first_name: "", last_name: "", phone: "", assigned_user_id: "", status: "open" };
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const asDate = (iso) => (iso ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`) : null);
const formatDate = (iso) => asDate(iso)?.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) || "";
const shortTime = (iso) => {
  const d = asDate(iso);
  if (!d) return "";
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// The tag that marks a lead everywhere in the app (funnel icon + "Lead" + number),
// so leads are never mistaken for cases.
export function LeadTag({ number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground tabular">
      <Filter className="h-3 w-3" aria-hidden />
      Lead {number}
    </span>
  );
}

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "conversations";
  const selectedId = Number(searchParams.get("lead")) || null;

  const [leads, setLeads] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = adding, lead = editing
  const [requesting, setRequesting] = useState(false);
  const [activity, setActivity] = useState({}); // conversation id -> counter, bumps on news

  const loadLeads = useCallback(async () => {
    try {
      const res = await apiFetch("/leads");
      if (!res.ok) throw new Error("Leads couldn't be loaded.");
      setLeads(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
    apiFetch("/leads/staff").then(async (r) => { if (r.ok) setStaff(await r.json()); });
  }, [loadLeads]);

  // Live: reload the list when any conversation has news (a reply, a sent text).
  const reloadTimer = useRef(null);
  useEffect(() => {
    const ws = new WebSocket(`${getWsBaseUrl()}/ws/staff/activity`);
    ws.onmessage = (event) => {
      try {
        const { conversation_id: id } = JSON.parse(event.data);
        if (id) setActivity((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
      } catch { /* ignore */ }
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(loadLeads, 400);
    };
    return () => { clearTimeout(reloadTimer.current); ws.close(); };
  }, [loadLeads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => !q || `${l.lead_number} ${l.name || ""} ${l.phone || ""}`.toLowerCase().includes(q));
  }, [leads, query]);

  const selected = leads.find((l) => l.id === selectedId) || (view === "conversations" ? filtered[0] : null);

  const select = (lead) => setSearchParams({ lead: String(lead.id) });
  const showView = (v) => setSearchParams(v === "list" ? { view: "list" } : selected ? { lead: String(selected.id) } : {});

  const onSaved = (saved, wasEditing) => {
    setEditing(undefined);
    loadLeads();
    toast.success(wasEditing ? `Lead ${saved.lead_number} updated` : `Lead ${saved.lead_number} added`);
    if (saved.phone_note) toast.warning(saved.phone_note);
    if (!wasEditing && view === "conversations") setSearchParams({ lead: String(saved.id) });
  };

  return (
    <MainLayout>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              {view === "list"
                ? "Every lead in the portal. Typed in by hand until LeadBase is connected."
                : "Text LeadBase leads. Your messages go out as texts, and replies show up here."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => showView(view === "list" ? "conversations" : "list")}>
              {view === "list" ? <><MessagesSquare className="h-4 w-4" /> Conversations</> : <><List className="h-4 w-4" /> Lead list</>}
            </Button>
            <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add lead</Button>
          </div>
        </div>

        {loadError && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {loadError}</p>}

        {view === "list" ? (
          <LeadTable leads={leads} loading={loading} onEdit={setEditing} />
        ) : (
          <div className="flex overflow-hidden rounded-lg border border-border bg-card" style={{ height: "calc(100vh - 13rem)" }}>
            {/* Left: leads, most recent conversation first */}
            <div className="flex w-80 shrink-0 flex-col border-r border-border">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Search leads" placeholder="Search by name, lead number or phone" value={query} onChange={(e) => setQuery(e.target.value)} className="border-0 bg-muted/50 pl-9" />
                </div>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Leads">
                {loading && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
                {!loading && filtered.length === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">{leads.length ? "No leads match." : "No leads yet. Add one, or use New text."}</li>
                )}
                {filtered.map((lead) => {
                  const active = selected?.id === lead.id;
                  return (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => select(lead)}
                        aria-current={active ? "true" : undefined}
                        className={`w-full border-l-2 px-4 py-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{lead.name || formatPhone(lead.phone) || "No name"}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground"><time>{shortTime(lead.last_message_at)}</time></span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <LeadTag number={lead.lead_number} />
                          {lead.status !== "open" && <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[lead.status]}</span>}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {lead.last_message
                            ? `${lead.last_message.inbound ? "" : "You: "}${lead.last_message.content}`
                            : lead.phone ? "No texts yet" : "No mobile number"}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right: the selected lead's conversation */}
            <div className="flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{selected.name || "No name"}</h2>
                        <LeadTag number={selected.lead_number} />
                        {selected.status !== "open" && <span className="text-xs text-muted-foreground">{STATUS_LABEL[selected.status]}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Assigned to {selected.assigned_user?.name || "nobody"}
                      </p>
                      {selected.phone && !selected.sms_opted_out && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Smartphone className="h-3 w-3" /> Texts go to <span className="tabular">{formatPhone(selected.phone)}</span>
                        </p>
                      )}
                      {selected.sms_opted_out && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-warning">
                          <AlertCircle className="h-3 w-3" /> Opted out of texts (replied STOP). Messages are saved but not sent.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {selected.conversation_id && (
                        <Button size="sm" onClick={() => setRequesting(true)}><FilePlus className="h-4 w-4" /> Request documents</Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setEditing(selected)}><Pencil className="h-4 w-4" /> Edit lead</Button>
                    </div>
                  </div>

                  {selected.conversation_id && (
                    <FileRequestsPanel conversationId={selected.conversation_id} refreshKey={activity[selected.conversation_id] || 0} />
                  )}
                  {selected.conversation_id ? (
                    <ConversationThread
                      key={selected.conversation_id}
                      conversationId={selected.conversation_id}
                      contactName={selected.first_name || selected.name}
                      optedOut={selected.sms_opted_out}
                    />
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                      <Smartphone className="h-8 w-8 text-muted-foreground" aria-hidden />
                      <h3 className="mt-3 text-base font-semibold">{selected.phone ? "This number can't be texted from here" : "No mobile number yet"}</h3>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        {selected.phone_note || "Add the lead's mobile number to start texting."}
                      </p>
                      {!selected.phone && <Button className="mt-4" onClick={() => setEditing(selected)}><Pencil className="h-4 w-4" /> Add a number</Button>}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  {loading ? "Loading…" : "Choose a lead to see its conversation."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <LeadFormDialog lead={editing} staff={staff} onClose={() => setEditing(undefined)} onSaved={onSaved} />
      <RequestDocumentsDialog
        open={requesting}
        conversationId={selected?.conversation_id}
        contactName={selected?.first_name || selected?.name}
        onClose={() => setRequesting(false)}
        onSent={() => setActivity((prev) => ({ ...prev, [selected.conversation_id]: (prev[selected.conversation_id] || 0) + 1 }))}
      />
    </MainLayout>
  );
}

function LeadTable({ leads, loading, onEdit }) {
  if (loading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>;
  }
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
        <Filter className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="mt-3 text-base font-semibold">No leads yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Add a lead with its LeadBase number and mobile phone, and it's ready to text.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Lead</th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Mobile</th>
            <th className="px-4 py-2.5 font-medium">Assigned to</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Added</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} onClick={() => onEdit(lead)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50">
              <td className="px-4 py-3">
                <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); onEdit(lead); }}><LeadTag number={lead.lead_number} /></button>
              </td>
              <td className="px-4 py-3 font-medium">{lead.name || <span className="text-muted-foreground">No name</span>}</td>
              <td className="px-4 py-3">
                {lead.phone ? <span className="tabular">{formatPhone(lead.phone)}</span> : <span className="text-muted-foreground">None</span>}
                {lead.phone_note && <p className="mt-0.5 flex items-center gap-1 text-xs text-warning"><AlertCircle className="h-3 w-3 shrink-0" /> {lead.phone_note}</p>}
              </td>
              <td className="px-4 py-3">{lead.assigned_user?.name || <span className="text-muted-foreground">Unassigned</span>}</td>
              <td className="px-4 py-3"><span className={lead.status === "open" ? "font-medium" : "text-muted-foreground"}>{STATUS_LABEL[lead.status] || lead.status}</span></td>
              <td className="px-4 py-3 text-muted-foreground"><time>{formatDate(lead.created_at)}</time></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Add (lead === null) or edit (lead object) a lead. Closed when lead === undefined.
function LeadFormDialog({ lead, staff, onClose, onSaved }) {
  const { user } = useUser();
  const editing = !!lead;
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead === undefined) return;
    setError(null);
    setForm(lead
      ? {
          lead_number: lead.lead_number,
          first_name: lead.first_name || "",
          last_name: lead.last_name || "",
          phone: lead.phone ? formatPhone(lead.phone) : "",
          assigned_user_id: lead.assigned_user ? String(lead.assigned_user.id) : "",
          status: lead.status,
        }
      : { ...EMPTY_FORM, assigned_user_id: user?.id ? String(user.id) : "" });
  }, [lead, user]);

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.lead_number.trim()) return setError("Enter the LeadBase lead number.");
    setSaving(true);
    setError(null);
    const body = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null,
    };
    try {
      const res = editing
        ? await apiFetch(`/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, status: form.status }) })
        : await apiFetch("/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lead_number: form.lead_number }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof data.detail === "string" ? data.detail : "Check the fields and try again.");
      onSaved(data, editing);
    } catch {
      setError("The server couldn't be reached. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={lead !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? `Lead ${lead.lead_number}` : "Add lead"}</DialogTitle>
            <DialogDescription>
              {editing ? "Change the lead's details." : "Use the lead number from LeadBase so it matches when LeadBase is connected."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lead_number">LeadBase lead number</Label>
              <Input id="lead_number" value={form.lead_number} onChange={setField("lead_number")} disabled={editing} inputMode="numeric" autoFocus={!editing} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" value={form.first_name} onChange={setField("first_name")} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" value={form.last_name} onChange={setField("last_name")} autoComplete="off" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={setField("phone")} placeholder="(201) 555-0123" autoComplete="off" />
              <p className="text-xs text-muted-foreground">Texts go to this number. Leave empty if you don't have it yet.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assigned">Assigned to</Label>
              <select id="assigned" value={form.assigned_user_id} onChange={setField("assigned_user_id")} className={selectClass}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {editing && (
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select id="status" value={form.status} onChange={setField("status")} className={selectClass}>
                  <option value="open">Open</option>
                  <option value="signed">Signed</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            )}
            {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
