import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Copy, Download, Eye, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, apiFetch } from "@/lib/api";

// The trail of every document request in a conversation (task 1.8): when it was
// sent, each time the link was opened, each file that arrived, and its expiry.
// Staff can download files, copy the link, extend it, or turn it off (task 1.9).

const asDate = (iso) => (iso ? new Date(!iso.endsWith("Z") && !iso.includes("+") ? `${iso}Z` : iso) : null);
const when = (iso) => asDate(iso)?.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) || "";
const day = (iso) => asDate(iso)?.toLocaleDateString([], { month: "short", day: "numeric" }) || "";
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const STATE = {
  waiting: { label: "Waiting", tone: "text-warning" },
  partly: { label: "Partly received", tone: "text-warning" },
  complete: { label: "All received", tone: "text-success" },
  expired: { label: "Link expired", tone: "text-muted-foreground" },
  revoked: { label: "Link turned off", tone: "text-muted-foreground" },
};
const EVENT_LABEL = {
  sent: "Sent",
  opened: "Opened",
  opened_expired: "Opened after it expired",
  opened_revoked: "Opened after it was turned off",
  uploaded: "Uploaded",
  completed: "Everything received",
  downloaded: "Downloaded",
  extended: "Extended",
  revoked: "Turned off",
};

export default function FileRequestsPanel({ conversationId, refreshKey }) {
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch(`/conversations/${conversationId}/file-requests`);
    if (res.ok) setRequests(await res.json());
  }, [conversationId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (requests.length === 0) return null;
  const active = requests.filter((r) => r.state === "waiting" || r.state === "partly").length;

  return (
    <section className="border-b border-border bg-muted/30" aria-label="Document requests">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between px-6 py-2.5 text-left text-sm font-medium hover:bg-muted/50">
        <span>Document requests <span className="font-normal text-muted-foreground">({requests.length}{active ? `, ${active} waiting` : ""})</span></span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <ul className="max-h-72 space-y-3 overflow-y-auto px-6 pb-4">
          {requests.map((r) => <RequestCard key={r.id} req={r} onChanged={load} />)}
        </ul>
      )}
    </section>
  );
}

function RequestCard({ req, onChanged }) {
  const [showTrail, setShowTrail] = useState(false);
  const state = STATE[req.state] || STATE.waiting;
  const received = req.items.filter((i) => i.received_at).length;
  const live = req.state === "waiting" || req.state === "partly" || req.state === "complete";

  const act = async (path, body, done) => {
    const res = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(typeof data.detail === "string" ? data.detail : "That didn't work.");
    toast.success(done);
    onChanged();
  };

  return (
    <li className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`font-semibold ${state.tone}`}>{state.label}</p>
        <div className="flex flex-wrap gap-1.5">
          {live && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigator.clipboard.writeText(req.link).then(() => toast.success("Link copied"))}>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
          )}
          {req.state !== "revoked" && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => act(`/file-requests/${req.id}/extend`, { days: 7 }, "Link extended by 7 days")}>
              <Clock className="h-3.5 w-3.5" /> Extend 7 days
            </Button>
          )}
          {req.state !== "revoked" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => {
                if (window.confirm("Turn off this link? It stops working right away and can't be turned back on. You can send a new request.")) {
                  act(`/file-requests/${req.id}/revoke`, null, "Link turned off");
                }
              }}>
              <Ban className="h-3.5 w-3.5" /> Turn off link
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground"><Send className="mr-1 inline h-3 w-3" />Sent</dt>
        <dd>{when(req.created_at)}{req.created_by ? ` by ${req.created_by}` : ""}{req.sent_status === "failed" && <span className="text-destructive">. Text not delivered: {req.sent_error}</span>}</dd>
        <dt className="text-muted-foreground"><Eye className="mr-1 inline h-3 w-3" />Opened</dt>
        <dd>{req.open_count ? `${req.open_count} ${req.open_count === 1 ? "time" : "times"}, last ${when(req.last_opened_at)}` : "Not yet"}</dd>
        <dt className="text-muted-foreground"><FileText className="mr-1 inline h-3 w-3" />Received</dt>
        <dd>{received} of {req.items.length} documents</dd>
        <dt className="text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{req.state === "revoked" ? "Turned off" : req.state === "expired" ? "Expired" : "Expires"}</dt>
        <dd>{req.state === "revoked" ? when(req.revoked_at) : day(req.expires_at)}</dd>
      </dl>

      <ul className="mt-2 space-y-1.5">
        {req.items.map((item) => (
          <li key={item.id}>
            <p className="flex items-center gap-1.5">
              {item.received_at ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={item.received_at ? "" : "text-muted-foreground"}>{item.name}</span>
            </p>
            {item.files.map((f) => (
              <a key={f.id} href={`${API_BASE_URL}/request-files/${f.id}/download`} onClick={() => setTimeout(onChanged, 1500)}
                className="ml-5 mt-0.5 flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Download className="h-3 w-3" /> {f.original_name} <span className="text-muted-foreground">({kb(f.size_bytes)}, {when(f.uploaded_at)})</span>
              </a>
            ))}
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => setShowTrail((s) => !s)} className="mt-2 text-xs font-medium text-primary hover:underline" aria-expanded={showTrail}>
        {showTrail ? "Hide full history" : "Show full history"}
      </button>
      {showTrail && (
        <ol className="mt-1.5 space-y-0.5 border-l border-border pl-3 text-xs">
          {req.events.map((e, idx) => (
            <li key={idx}>
              <time className="text-muted-foreground">{when(e.at)}</time>{" "}
              <span className="font-medium">{EVENT_LABEL[e.kind] || e.kind}</span>
              {e.who ? ` by ${e.who}` : ""}{e.detail ? `: ${e.detail}` : ""}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
