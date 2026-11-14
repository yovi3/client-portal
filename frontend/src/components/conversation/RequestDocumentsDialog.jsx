import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus, X } from "lucide-react";
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
import { buildClientText } from "@/lib/texting";

// Request documents (task 1.7): list what's needed; the secure upload link goes out
// as a text in this conversation. Links last 7 days unless changed here.

const COMMON = [
  "Driver's license",
  "Car insurance card",
  "Health insurance card (front and back)",
  "Police report",
  "Photos of the accident",
  "Photos of injuries",
  "Medical bills",
];
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function RequestDocumentsDialog({ open, conversationId, contactName, onClose, onSent }) {
  const { user } = useUser();
  const [items, setItems] = useState([]);
  const [draftItem, setDraftItem] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems([]); setDraftItem(""); setNote(""); setDays("7"); setError(null);
  }, [open]);

  const addItem = (name) => {
    const clean = (name || "").trim();
    if (!clean || items.some((i) => i.toLowerCase() === clean.toLowerCase())) return;
    setItems((prev) => [...prev, clean]);
  };

  const until = new Date(Date.now() + Number(days) * 86400000).toLocaleDateString([], { month: "short", day: "numeric" });
  const preview = items.length
    ? buildClientText(user?.first_name, `${note.trim() || "Please upload"}: ${items.join(", ")}. Secure link, valid until ${until}: [link]`)
    : null;

  const send = async () => {
    const all = draftItem.trim() ? [...items, draftItem.trim()] : items;
    if (!all.length) return setError("Add at least one document to ask for.");
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/conversations/${conversationId}/file-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: all, note: note.trim() || null, expires_in_days: Number(days) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof data.detail === "string" ? data.detail : "The request couldn't be sent.");
      toast.success("Document request sent");
      onSent?.(data);
      onClose();
    } catch {
      setError("The server couldn't be reached. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request documents{contactName ? ` from ${contactName}` : ""}</DialogTitle>
          <DialogDescription>A secure upload link goes out by text. You'll see when it's opened and when files arrive.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rd_item">Documents to ask for</Label>
            {items.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {items.map((name) => (
                  <li key={name} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-sm">
                    {name}
                    <button type="button" onClick={() => setItems((prev) => prev.filter((i) => i !== name))} aria-label={`Remove ${name}`} className="rounded p-0.5 hover:bg-background">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                id="rd_item"
                value={draftItem}
                onChange={(e) => setDraftItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(draftItem); setDraftItem(""); } }}
                placeholder="Type a document and press Enter"
                autoFocus
              />
              <Button type="button" variant="outline" onClick={() => { addItem(draftItem); setDraftItem(""); }} aria-label="Add document"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {COMMON.filter((c) => !items.includes(c)).map((c) => (
                <button key={c} type="button" onClick={() => addItem(c)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
                  + {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="rd_note">Opening words (optional)</Label>
              <Input id="rd_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Please upload" maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd_days">Link works for</Label>
              <select id="rd_days" value={days} onChange={(e) => setDays(e.target.value)} className={selectClass}>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
          </div>

          {preview && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Their phone shows: </span>{preview}
            </p>
          )}

          {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Send request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
