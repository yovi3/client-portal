import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Paperclip, X } from "lucide-react";
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

// Send documents (task 1.10): choose files; a secure download link goes out by text.
// Each download by the person shows up in the panel.

const MAX_MB = 50;
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const sizeOf = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function SendDocumentsDialog({ open, conversationId, contactName, onClose, onSent }) {
  const { user } = useUser();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFiles([]); setNote(""); setDays("7"); setError(null);
  }, [open]);

  const addFiles = (list) => {
    const chosen = Array.from(list || []);
    const tooBig = chosen.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")}: over ${MAX_MB} MB.`);
    setFiles((prev) => [...prev, ...chosen.filter((f) => f.size <= MAX_MB * 1024 * 1024 && !prev.some((p) => p.name === f.name && p.size === f.size))]);
  };

  const until = new Date(Date.now() + Number(days) * 86400000).toLocaleDateString([], { month: "short", day: "numeric" });
  const preview = files.length
    ? buildClientText(user?.first_name, `${note.trim() || "Here are your documents"}: ${files.map((f) => f.name).join(", ")}. Secure link, valid until ${until}: [link]`)
    : null;

  const send = async () => {
    if (!files.length) return setError("Choose at least one file to send.");
    setSaving(true);
    setError(null);
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("note", note.trim());
    form.append("expires_in_days", days);
    try {
      const res = await apiFetch(`/conversations/${conversationId}/file-sends`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof data.detail === "string" ? data.detail : "The documents couldn't be sent.");
      toast.success("Documents sent");
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
          <DialogTitle>Send documents{contactName ? ` to ${contactName}` : ""}</DialogTitle>
          <DialogDescription>A secure download link goes out by text. You'll see when it's opened and each file is downloaded.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Files</Label>
            {files.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{sizeOf(f.size)}</span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((p) => p !== f))} aria-label={`Remove ${f.name}`} className="rounded p-0.5 hover:bg-muted">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="sr-only" aria-label="Choose files to send"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <Paperclip className="h-4 w-4" /> {files.length ? "Add more files" : "Choose files"}
            </Button>
            <p className="text-xs text-muted-foreground">PDFs and images, up to {MAX_MB} MB each.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="sd_note">Opening words (optional)</Label>
              <Input id="sd_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Here are your documents" maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sd_days">Link works for</Label>
              <select id="sd_days" value={days} onChange={(e) => setDays(e.target.value)} className={selectClass}>
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
          <Button onClick={send} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Send documents</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
