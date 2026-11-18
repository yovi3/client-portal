import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ChevronRight, Loader2, MessageSquarePlus, Search, Smartphone, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { formatPhone } from "@/lib/texting";
import { LeadTag } from "@/pages/Leads";

// New text (task 1.5). One box: type a phone number, a name or a lead number. Matching
// leads (all of them, searched on the server, by phone digits too) appear right below;
// pick one to open its conversation. A full phone number can also be texted without a
// lead (it waits in Needs assigning until linked), or added as a new lead.

const digitsOf = (text) => (text || "").replace(/\D/g, "");
// A US number the backend will accept: 10 digits, or 11 starting with 1.
const isFullNumber = (text) => {
  const d = digitsOf(text);
  return /^\+?[\d\s().-]+$/.test(text.trim()) && (d.length === 10 || (d.length === 11 && d.startsWith("1")));
};

export default function NewTextDialog({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false); // the "add as a new lead" form
  const [form, setForm] = useState({ lead_number: "", first_name: "", last_name: "" });
  const [needNumberFor, setNeedNumberFor] = useState(null); // a lead without a mobile number
  const [number, setNumber] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText(""); setResults([]); setTotal(0); setAdding(false); setNeedNumberFor(null); setNumber("");
    setForm({ lead_number: "", first_name: "", last_name: "" }); setError(null);
  }, [open]);

  // Search all leads as the person types (after a short pause).
  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    const digits = digitsOf(q);
    const looksLikeNumber = digits.length >= 3 && /^[\d\s().+-]+$/.test(q);
    if (q.length < 2 && !looksLikeNumber) { setResults([]); setTotal(0); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      // Phone numbers are matched on their digits; a leading 1 is dropped (+1 201... = 201...).
      const query = looksLikeNumber ? (digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits) : q;
      apiFetch(`/leads/page?${new URLSearchParams({ q: query, limit: "8", sort: "created", direction: "desc" })}`)
        .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
        .then((page) => { if (!cancelled) { setResults(page.items); setTotal(page.total); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text, open]);

  const fullNumber = isFullNumber(text);
  const numberLabel = fullNumber ? formatPhone(`+1${digitsOf(text).slice(-10)}`) : null;

  const start = async (body) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/conversations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : "The conversation couldn't be opened.");
        return;
      }
      if (data.note) toast.info(data.note);
      window.dispatchEvent(new Event("conversations-changed"));
      onClose();
      if (data.lead_id) navigate(`/leads?lead=${data.lead_id}`);
      else navigate(`/texts/${data.conversation.id}`);
    } catch {
      setError("The server couldn't be reached. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const pickLead = (lead) => {
    if (lead.conversation_id) {
      onClose();
      navigate(`/leads?lead=${lead.id}`);
    } else if (lead.phone) {
      start({ phone: lead.phone, lead_id: lead.id });
    } else if (fullNumber) {
      start({ phone: text, lead_id: lead.id });
    } else {
      setNeedNumberFor(lead); // ask for this lead's mobile number
    }
  };

  const hint = useMemo(() => {
    if (!text.trim()) return "Type a phone number, a name or a lead number.";
    if (searching) return "Searching…";
    if (results.length === 0) return fullNumber ? "No lead has this number." : "No leads match.";
    return total > results.length ? `Showing ${results.length} of ${total} matching leads. Type more to narrow it down.` : null;
  }, [text, searching, results, total, fullNumber]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>New text</DialogTitle>
          <DialogDescription>Find a lead by phone, name or lead number, or text any number.</DialogDescription>
        </DialogHeader>

        {needNumberFor ? (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{needNumberFor.name || `Lead ${needNumberFor.lead_number}`}</span> has no mobile number yet. Which number should get the texts?
            </p>
            <Input aria-label="Mobile number" placeholder="(201) 555-0123" value={number} onChange={(e) => setNumber(e.target.value)} autoFocus />
            {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => { setNeedNumberFor(null); setError(null); }}>Back</Button>
              <Button disabled={!isFullNumber(number) || saving} onClick={() => start({ phone: number, lead_id: needNumberFor.id })}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Text this number
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input ref={inputRef} aria-label="Number, name or lead number" placeholder="Number, name or lead number"
                value={text} onChange={(e) => { setText(e.target.value); setAdding(false); setError(null); }} className="pl-9" />
            </div>

            {/* Matching leads */}
            {results.length > 0 && (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border" aria-label="Matching leads">
                {results.map((lead) => (
                  <li key={lead.id}>
                    <button type="button" onClick={() => pickLead(lead)} disabled={saving}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{lead.name || "No name"}</span>
                          <LeadTag number={lead.lead_number} />
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {lead.phone ? formatPhone(lead.phone) : "No mobile number"}
                          {lead.lb_status ? `. ${lead.lb_status}` : ""}
                          {lead.assigned_name || lead.assigned_user?.name ? `. ${lead.assigned_user?.name || lead.assigned_name}` : ""}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hint && <p className="text-xs text-muted-foreground" aria-live="polite">{hint}</p>}

            {/* A full number: text it without a lead, or add it as a new lead */}
            {fullNumber && !adding && (
              <div className="space-y-2 border-t border-border pt-3">
                <Button variant="outline" className="w-full justify-start" disabled={saving} onClick={() => start({ phone: text, no_lead: true })}>
                  <MessageSquarePlus className="h-4 w-4" /> Text {numberLabel} without a lead
                </Button>
                <Button variant="outline" className="w-full justify-start" disabled={saving} onClick={() => setAdding(true)}>
                  <UserPlus className="h-4 w-4" /> Add {numberLabel} as a new lead
                </Button>
                <p className="text-xs text-muted-foreground">Without a lead, the conversation waits in Needs assigning until it's linked to one.</p>
              </div>
            )}
            {fullNumber && adding && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" /> New lead for {numberLabel}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nt_number">Lead number</Label>
                    <Input id="nt_number" value={form.lead_number} onChange={(e) => setForm({ ...form, lead_number: e.target.value })} autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nt_first">First name</Label>
                    <Input id="nt_first" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nt_last">Last name</Label>
                    <Input id="nt_last" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" onClick={() => setAdding(false)}>Back</Button>
                  <Button disabled={!form.lead_number.trim() || saving} onClick={() => start({ phone: text, new_lead: {
                    lead_number: form.lead_number.trim(), first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null } })}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add lead and text
                  </Button>
                </div>
              </div>
            )}
            {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
