import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Briefcase, ChevronDown, ChevronUp, Filter, Inbox, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
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
import { apiFetch } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { formatPhone } from "@/lib/texting";
import { LeadTag } from "@/pages/Leads";

// Tasks 1.3 and 1.6: texts from numbers that aren't linked to a lead or a case yet.
// Staff link each number to a lead (existing or new) or a case, or mark it not related.

const REFRESH_MS = 20_000;
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const asDate = (iso) => (iso ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`) : null);
const timeAgo = (iso) => {
  const d = asDate(iso);
  if (!d) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const timeOf = (iso) => asDate(iso)?.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) || "";

// Tell the sidebar its "Needs assigning" count changed.
const announceChange = () => window.dispatchEvent(new Event("conversations-changed"));

async function postJson(path, body) {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "That didn't work. Try again.");
  return data;
}

export default function NeedsAssigning() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState({}); // conversation id -> messages
  const [linkLeadFor, setLinkLeadFor] = useState(null);
  const [linkCaseFor, setLinkCaseFor] = useState(null);
  const [dismissFor, setDismissFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/conversations?kind=unassigned");
      if (!res.ok) throw new Error("Texts couldn't be loaded.");
      setItems(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const toggleTexts = async (conv) => {
    if (expanded[conv.id]) {
      setExpanded(({ [conv.id]: _, ...rest }) => rest);
      return;
    }
    const res = await apiFetch(`/conversations/${conv.id}/messages`);
    const messages = res.ok ? await res.json() : [];
    setExpanded((prev) => ({ ...prev, [conv.id]: messages }));
  };

  const removeRow = (id, message) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    announceChange();
    toast.success(message);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Needs assigning</h1>
          <p className="text-sm text-muted-foreground">
            Texts from numbers that aren't linked to a lead or a case yet. Link each one so its texts are logged in the right place.
          </p>
        </div>

        {loading && (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
          </div>
        )}
        {loadError && (
          <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {loadError}</p>
        )}

        {!loading && !loadError && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Nothing needs assigning</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              When a number the firm doesn't know yet texts in, it shows up here.
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {items.map((conv) => (
            <li key={conv.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold tabular">{formatPhone(conv.phone)}</p>
                  <p className="text-sm text-muted-foreground">
                    {conv.contact_name ? `${conv.contact_name}. ` : ""}
                    {conv.message_count} {conv.message_count === 1 ? "text" : "texts"}, latest {timeAgo(conv.last_message_at)}
                    {conv.sms_opted_out && <span className="text-warning"> Opted out of texts.</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setLinkLeadFor(conv)}><Filter className="h-4 w-4" /> Link to lead</Button>
                  <Button size="sm" variant="outline" onClick={() => setLinkCaseFor(conv)}><Briefcase className="h-4 w-4" /> Link to case</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDismissFor(conv)}>Not related</Button>
                </div>
              </div>

              {conv.last_message && !expanded[conv.id] && (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap break-words">{conv.last_message.content}</p>
              )}

              {Array.isArray(expanded[conv.id]) && (
                <ol className="mt-3 space-y-2">
                  {expanded[conv.id].map((m) => (
                    <li key={m.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground"><time>{timeOf(m.timestamp)}</time></p>
                    </li>
                  ))}
                </ol>
              )}

              {conv.message_count > 1 && (
                <button
                  type="button"
                  onClick={() => toggleTexts(conv)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  aria-expanded={!!expanded[conv.id]}
                >
                  {expanded[conv.id] ? <>Show latest only <ChevronUp className="h-3 w-3" /></> : <>Show all {conv.message_count} texts <ChevronDown className="h-3 w-3" /></>}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <LinkLeadDialog
        conv={linkLeadFor}
        onClose={() => setLinkLeadFor(null)}
        onLinked={(conv, result) => removeRow(conv.id, `Linked to Lead ${result.lead.lead_number}`)}
      />
      <LinkCaseDialog
        conv={linkCaseFor}
        onClose={() => setLinkCaseFor(null)}
        onLinked={(conv, result) => removeRow(conv.id, `Linked to ${result.case?.title || "the case"}`)}
      />
      <DismissDialog
        conv={dismissFor}
        onClose={() => setDismissFor(null)}
        onDone={(conv) => removeRow(conv.id, `${formatPhone(conv.phone)} marked not related`)}
      />
    </MainLayout>
  );
}

function LinkLeadDialog({ conv, onClose, onLinked }) {
  const { user } = useUser();
  const [mode, setMode] = useState("existing");
  const [leads, setLeads] = useState([]);
  const [staff, setStaff] = useState([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null);
  const [form, setForm] = useState({ lead_number: "", first_name: "", last_name: "", assigned_user_id: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!conv) return;
    setMode("existing"); setQuery(""); setChosen(null); setError(null);
    const [first, ...rest] = (conv.contact_name || "").split(" ");
    setForm({ lead_number: "", first_name: first || "", last_name: rest.join(" "), assigned_user_id: user?.id ? String(user.id) : "" });
    Promise.all([apiFetch("/leads"), apiFetch("/leads/staff")]).then(async ([l, s]) => {
      if (l.ok) setLeads((await l.json()).filter((x) => x.status === "open"));
      if (s.ok) setStaff(await s.json());
    });
  }, [conv, user]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => !q || `${l.lead_number} ${l.name || ""} ${l.phone || ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [leads, query]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    let body;
    if (mode === "existing") {
      if (!chosen) return setError("Choose a lead from the list.");
      body = { lead_id: chosen };
    } else {
      if (!form.lead_number.trim()) return setError("Enter the LeadBase lead number.");
      body = { new_lead: { ...form, assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null } };
    }
    setSaving(true);
    try {
      const result = await postJson(`/conversations/${conv.id}/link`, body);
      onLinked(conv, result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (f) => (e) => setForm((prev) => ({ ...prev, [f]: e.target.value }));

  return (
    <Dialog open={!!conv} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Link {conv ? formatPhone(conv.phone) : ""} to a lead</DialogTitle>
            <DialogDescription>Its texts, past and future, are logged on the lead.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 inline-flex rounded-md border border-border p-0.5" role="tablist">
            {[["existing", "Existing lead"], ["new", "New lead"]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => { setMode(key); setError(null); }}
                className={`rounded px-3 py-1.5 text-sm ${mode === key ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="mt-4 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search leads" placeholder="Search by lead number, name or phone" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" autoFocus />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border" role="radiogroup" aria-label="Open leads">
                {matches.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No open leads match. Add it as a new lead instead.</p>}
                {matches.map((l) => (
                  <label key={l.id} className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 ${chosen === l.id ? "bg-accent" : "hover:bg-muted/50"}`}>
                    <input type="radio" name="lead" checked={chosen === l.id} onChange={() => setChosen(l.id)} className="accent-[var(--primary)]" />
                    <LeadTag number={l.lead_number} />
                    <span className="min-w-0 flex-1 truncate text-sm">{l.name || "No name"}</span>
                    {l.phone && <span className="text-xs text-muted-foreground tabular">{formatPhone(l.phone)}</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">A lead without a phone number gets this one.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nl_number">LeadBase lead number</Label>
                <Input id="nl_number" value={form.lead_number} onChange={setField("lead_number")} inputMode="numeric" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nl_first">First name</Label>
                  <Input id="nl_first" value={form.first_name} onChange={setField("first_name")} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nl_last">Last name</Label>
                  <Input id="nl_last" value={form.last_name} onChange={setField("last_name")} autoComplete="off" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl_assigned">Assigned to</Label>
                <select id="nl_assigned" value={form.assigned_user_id} onChange={setField("assigned_user_id")} className={selectClass}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">Mobile phone: {conv ? formatPhone(conv.phone) : ""}</p>
            </div>
          )}

          {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "existing" ? "Link to lead" : "Add lead and link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkCaseDialog({ conv, onClose, onLinked }) {
  const [cases, setCases] = useState([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!conv) return;
    setQuery(""); setChosen(null); setError(null);
    apiFetch("/cases").then(async (r) => { if (r.ok) setCases(await r.json()); });
  }, [conv]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      const text = `${c.title || ""} ${c.lawbase_case_number || ""} ${(c.clients || []).map((x) => x.name).join(" ")}`;
      return !q || text.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [cases, query]);

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen) return setError("Choose a case from the list.");
    setSaving(true);
    setError(null);
    try {
      const result = await postJson(`/conversations/${conv.id}/link`, { case_id: chosen });
      onLinked(conv, result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!conv} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Link {conv ? formatPhone(conv.phone) : ""} to a case</DialogTitle>
            <DialogDescription>Its texts, past and future, are logged on the case.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search cases" placeholder="Search by client, case or LawBase number" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" autoFocus />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border" role="radiogroup" aria-label="Cases">
              {matches.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No cases match.</p>}
              {matches.map((c) => (
                <label key={c.id} className={`flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2 last:border-0 ${chosen === c.id ? "bg-accent" : "hover:bg-muted/50"}`}>
                  <input type="radio" name="case" checked={chosen === c.id} onChange={() => setChosen(c.id)} className="mt-1 accent-[var(--primary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{(c.clients || []).map((x) => x.name).join(", ") || "No client"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.title}{c.lawbase_case_number ? `, ${c.lawbase_case_number}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Link to case</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({ conv, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setError(null); }, [conv]);

  const confirm = async () => {
    setSaving(true);
    try {
      await postJson(`/conversations/${conv.id}/dismiss`);
      onDone(conv);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!conv} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark {conv ? formatPhone(conv.phone) : ""} not related?</DialogTitle>
          <DialogDescription>
            For wrong numbers and spam. It leaves this list, and comes back if the number texts again.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Not related</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
