import { useEffect, useState } from "react";
import { AlertCircle, Filter, Loader2, Plus } from "lucide-react";
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

// Task 1.2: staff type in LeadBase leads by hand until robo fills them from LeadBase.
// Conversations with leads come next (task 1.4); this page is where leads live.

const STATUS_LABEL = { open: "Open", signed: "Signed", closed: "Closed" };
const EMPTY_FORM = { lead_number: "", first_name: "", last_name: "", phone: "", assigned_user_id: "", status: "open" };

const formatDate = (iso) =>
  iso ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";

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
  const { user } = useUser();
  const [leads, setLeads] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // the lead being edited, or null when adding
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [leadsRes, staffRes] = await Promise.all([apiFetch("/leads"), apiFetch("/leads/staff")]);
        if (!leadsRes.ok) throw new Error("Leads couldn't be loaded.");
        setLeads(await leadsRes.json());
        if (staffRes.ok) setStaff(await staffRes.json());
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, assigned_user_id: user?.id ? String(user.id) : "" });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (lead) => {
    setEditing(lead);
    setForm({
      lead_number: lead.lead_number,
      first_name: lead.first_name || "",
      last_name: lead.last_name || "",
      phone: lead.phone ? formatPhone(lead.phone) : "",
      assigned_user_id: lead.assigned_user ? String(lead.assigned_user.id) : "",
      status: lead.status,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.lead_number.trim()) {
      setFormError("Enter the LeadBase lead number.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const body = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null,
    };
    try {
      const res = editing
        ? await apiFetch(`/leads/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, status: form.status }),
          })
        : await apiFetch("/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, lead_number: form.lead_number }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(typeof data.detail === "string" ? data.detail : "Check the fields and try again.");
        return;
      }
      setLeads((prev) => (editing ? prev.map((l) => (l.id === data.id ? data : l)) : [data, ...prev]));
      setDialogOpen(false);
      toast.success(editing ? `Lead ${data.lead_number} updated` : `Lead ${data.lead_number} added`);
      if (data.phone_note) toast.warning(data.phone_note);
    } catch {
      setFormError("The server couldn't be reached. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              LeadBase leads you can text. Typed in by hand until LeadBase is connected.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        </div>

        {loading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
          </div>
        )}

        {loadError && (
          <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {loadError}</p>
        )}

        {!loading && !loadError && leads.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
            <Filter className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">No leads yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Add a lead with its LeadBase number and mobile phone, and it's ready to text.
            </p>
            <Button className="mt-4" onClick={openAdd}><Plus className="h-4 w-4" /> Add lead</Button>
          </div>
        )}

        {!loading && leads.length > 0 && (
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
                  <tr
                    key={lead.id}
                    onClick={() => openEdit(lead)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); openEdit(lead); }}>
                        <LeadTag number={lead.lead_number} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium">{lead.name || <span className="text-muted-foreground">No name</span>}</td>
                    <td className="px-4 py-3">
                      {lead.phone ? <span className="tabular">{formatPhone(lead.phone)}</span> : <span className="text-muted-foreground">None</span>}
                      {lead.phone_note && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-warning">
                          <AlertCircle className="h-3 w-3 shrink-0" /> {lead.phone_note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{lead.assigned_user?.name || <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-4 py-3">
                      <span className={lead.status === "open" ? "font-medium" : "text-muted-foreground"}>
                        {STATUS_LABEL[lead.status] || lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground"><time>{formatDate(lead.created_at)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? `Lead ${editing.lead_number}` : "Add lead"}</DialogTitle>
              <DialogDescription>
                {editing ? "Change the lead's details." : "Use the lead number from LeadBase so it matches when LeadBase is connected."}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lead_number">LeadBase lead number</Label>
                <Input
                  id="lead_number"
                  value={form.lead_number}
                  onChange={setField("lead_number")}
                  disabled={!!editing}
                  inputMode="numeric"
                  autoFocus={!editing}
                  required
                />
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
                <select
                  id="assigned"
                  value={form.assigned_user_id}
                  onChange={setField("assigned_user_id")}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {editing && (
                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={setField("status")}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="open">Open</option>
                    <option value="signed">Signed</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              )}
              {formError && (
                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
