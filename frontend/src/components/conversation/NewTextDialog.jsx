import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
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

// New text (task 1.5): a phone number plus the lead it's about. Opens that lead's
// conversation, ready to type. A number that already has a conversation opens that one.

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function NewTextDialog({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState("existing");
  const [leads, setLeads] = useState([]);
  const [staff, setStaff] = useState([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null);
  const [form, setForm] = useState({ lead_number: "", first_name: "", last_name: "", assigned_user_id: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone(""); setMode("existing"); setQuery(""); setChosen(null); setError(null);
    setForm({ lead_number: "", first_name: "", last_name: "", assigned_user_id: user?.id ? String(user.id) : "" });
    Promise.all([apiFetch("/leads"), apiFetch("/leads/staff")]).then(async ([l, s]) => {
      if (l.ok) setLeads((await l.json()).filter((x) => x.status === "open"));
      if (s.ok) setStaff(await s.json());
    });
  }, [open, user]);

  // Typing a number that belongs to a lead picks that lead for you.
  useEffect(() => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) return;
    const match = leads.find((l) => (l.phone || "").replace(/\D/g, "").endsWith(digits));
    if (match) { setMode("existing"); setChosen(match.id); }
  }, [phone, leads]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => !q || `${l.lead_number} ${l.name || ""} ${l.phone || ""}`.toLowerCase().includes(q)).slice(0, 6);
  }, [leads, query]);

  const setField = (f) => (e) => setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) return setError("Enter the mobile number to text.");
    if (mode === "existing" && !chosen) return setError("Choose the lead this is about, or add a new one.");
    if (mode === "new" && !form.lead_number.trim()) return setError("Enter the LeadBase lead number.");
    const body = mode === "existing"
      ? { phone, lead_id: chosen }
      : { phone, new_lead: { ...form, assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null } };
    setSaving(true);
    try {
      const res = await apiFetch("/conversations/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof data.detail === "string" ? data.detail : "That didn't work. Try again.");
      if (data.note) toast.info(data.note);
      onClose();
      if (data.lead_id) navigate(`/leads?lead=${data.lead_id}`);
      else toast.info("This number is linked to a case, which isn't shown during the intake rollout.");
      window.dispatchEvent(new Event("conversations-changed"));
    } catch {
      setError("The server couldn't be reached. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>New text</DialogTitle>
            <DialogDescription>Enter the number and choose the lead it's about. The conversation opens ready to type.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="nt_phone">Mobile number</Label>
            <Input id="nt_phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(201) 555-0123" autoComplete="off" autoFocus />
          </div>

          <div className="mt-4 inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="Which lead">
            {[["existing", "Existing lead"], ["new", "New lead"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => { setMode(key); setError(null); }}
                className={`rounded px-3 py-1.5 text-sm ${mode === key ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search leads" placeholder="Search by lead number or name" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border" role="radiogroup" aria-label="Open leads">
                {matches.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No open leads match. Add a new lead instead.</p>}
                {matches.map((l) => (
                  <label key={l.id} className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 ${chosen === l.id ? "bg-accent" : "hover:bg-muted/50"}`}>
                    <input type="radio" name="nt_lead" checked={chosen === l.id} onChange={() => setChosen(l.id)} className="accent-[var(--primary)]" />
                    <LeadTag number={l.lead_number} />
                    <span className="min-w-0 flex-1 truncate text-sm">{l.name || "No name"}</span>
                    {l.phone && <span className="text-xs text-muted-foreground tabular">{formatPhone(l.phone)}</span>}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nt_number">LeadBase lead number</Label>
                <Input id="nt_number" value={form.lead_number} onChange={setField("lead_number")} inputMode="numeric" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nt_first">First name</Label>
                  <Input id="nt_first" value={form.first_name} onChange={setField("first_name")} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nt_last">Last name</Label>
                  <Input id="nt_last" value={form.last_name} onChange={setField("last_name")} autoComplete="off" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nt_assigned">Assigned to</Label>
                <select id="nt_assigned" value={form.assigned_user_id} onChange={setField("assigned_user_id")} className={selectClass}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Open conversation</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
