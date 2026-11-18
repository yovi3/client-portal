import { useCallback, useEffect, useState } from "react";
import { Ban, ChevronDown, ChevronRight, CheckCircle2, Circle, Clock, Copy, Download, FileDown, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, apiFetch } from "@/lib/api";

// Documents in a conversation (tasks 1.8 to 1.10), as a quiet list: each request or
// send shows only what it is, who it's from or to, and where it stands. Clicking one
// opens the details: each file, when the link was opened, the expiry, the actions
// (copy link, extend, turn off) and the full history.

const asDate = (iso) => (iso ? new Date(!iso.endsWith("Z") && !iso.includes("+") ? `${iso}Z` : iso) : null);
const when = (iso) => asDate(iso)?.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) || "";
const day = (iso) => asDate(iso)?.toLocaleDateString([], { month: "short", day: "numeric" }) || "";
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const PILL = {
  waiting: "bg-warning/15 text-warning",
  partly: "bg-warning/15 text-warning",
  complete: "bg-success/15 text-success",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-muted text-muted-foreground",
};
const LABEL_REQUEST = { waiting: "Waiting", partly: "Partly received", complete: "All received", expired: "Expired", revoked: "Turned off" };
const LABEL_SEND = { waiting: "Not downloaded", partly: "Partly downloaded", complete: "Downloaded", expired: "Expired", revoked: "Turned off" };
const EVENT_LABEL = {
  sent: "Sent",
  opened: "Opened",
  opened_expired: "Opened after it expired",
  opened_revoked: "Opened after it was turned off",
  uploaded: "Uploaded",
  completed: "Everything received",
  downloaded: "Downloaded by staff",
  recipient_downloaded: "Downloaded by them",
  extended: "Extended",
  revoked: "Turned off",
};

export default function FileRequestsPanel({ conversationId, refreshKey, contactName }) {
  const [requests, setRequests] = useState(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/conversations/${conversationId}/file-requests`);
    setRequests(res.ok ? await res.json() : []);
  }, [conversationId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (requests === null) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (requests.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No documents yet. Use Request or Send above to start.
      </p>
    );
  }
  return (
    <ul className="space-y-2 p-3" aria-label="Documents">
      {requests.map((r) => <RequestCard key={r.id} req={r} contactName={contactName} onChanged={load} />)}
    </ul>
  );
}

function RequestCard({ req, contactName, onChanged }) {
  const [open, setOpen] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const sent = req.direction === "send";
  const who = contactName || "them";
  const label = (sent ? LABEL_SEND : LABEL_REQUEST)[req.state] || req.state;
  const what = sent ? req.files.map((f) => f.original_name) : req.items.map((i) => i.name);
  const done = sent ? req.files.filter((f) => f.download_count > 0).length : req.items.filter((i) => i.received_at).length;
  const total = sent ? req.files.length : req.items.length;
  const live = ["waiting", "partly", "complete"].includes(req.state);

  const act = async (path, body, message) => {
    const res = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(typeof data.detail === "string" ? data.detail : "That didn't work.");
    toast.success(message);
    onChanged();
  };

  return (
    <li className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-start gap-2.5 rounded-lg p-3 text-left hover:bg-muted/40">
        {sent ? <FileDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{sent ? `Sent to ${who}` : `Requested from ${who}`}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PILL[req.state] || PILL.waiting}`}>{label}</span>
          </span>
          <span className="mt-1 block truncate text-sm text-muted-foreground" title={what.join(", ")}>{what.join(", ")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {total > 1 ? `${done} of ${total} ${sent ? "downloaded" : "received"}. ` : ""}{day(req.created_at)}{req.created_by ? `, by ${req.created_by}` : ""}
          </span>
        </span>
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Sent</dt>
            <dd>{when(req.created_at)}{req.sent_status === "failed" && <span className="text-destructive">. Text not delivered: {req.sent_error}</span>}</dd>
            <dt className="text-muted-foreground">Opened</dt>
            <dd>{req.open_count ? `${req.open_count} ${req.open_count === 1 ? "time" : "times"}, last ${when(req.last_opened_at)}` : "Not yet"}</dd>
            <dt className="text-muted-foreground">{req.state === "revoked" ? "Turned off" : req.state === "expired" ? "Expired" : "Expires"}</dt>
            <dd>{req.state === "revoked" ? when(req.revoked_at) : day(req.expires_at)}</dd>
          </dl>

          {sent ? (
            <ul className="space-y-1">
              {req.files.map((f) => (
                <li key={f.id} className="text-xs">
                  <a href={`${API_BASE_URL}/request-files/${f.id}/download`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                    <Download className="h-3 w-3" /> {f.original_name}
                  </a>
                  <span className="block pl-[1.125rem] text-muted-foreground">
                    {kb(f.size_bytes)}. {f.download_count ? `Downloaded by them ${f.download_count} ${f.download_count === 1 ? "time" : "times"}, last ${when(f.last_downloaded_at)}` : "Not downloaded by them yet"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1.5">
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
          )}

          <div className="flex flex-wrap gap-1">
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
                if (window.confirm("Turn off this link? It stops working right away and can't be turned back on. You can send a new one.")) {
                  act(`/file-requests/${req.id}/revoke`, null, "Link turned off");
                }
              }}>
                <Ban className="h-3.5 w-3.5" /> Turn off link
              </Button>
            )}
          </div>

          <button type="button" onClick={() => setShowTrail((s) => !s)} className="text-xs font-medium text-primary hover:underline" aria-expanded={showTrail}>
            {showTrail ? "Hide full history" : "Show full history"}
          </button>
          {showTrail && (
            <ol className="space-y-0.5 border-l border-border pl-3 text-xs">
              {req.events.map((e, idx) => (
                <li key={idx}>
                  <time className="text-muted-foreground">{when(e.at)}</time>{" "}
                  <span className="font-medium">{EVENT_LABEL[e.kind] || e.kind}</span>
                  {e.who ? ` by ${e.who}` : ""}{e.detail ? `: ${e.detail}` : ""}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
