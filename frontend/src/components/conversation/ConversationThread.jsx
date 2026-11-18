import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, FilePlus, Loader2, Paperclip, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, getWsBaseUrl } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { buildClientText, countTextParts, describeTextStatus } from "@/lib/texting";

// One live conversation with a phone number (a lead for now). Staff messages are
// texted to the number; replies appear the moment they arrive.

const asDate = (iso) => new Date(iso && !iso.endsWith("Z") && !iso.includes("+") ? `${iso}Z` : iso);
const timeOf = (iso) => asDate(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayOf = (iso) => {
  const d = asDate(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
};
const initials = (name) => (name || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export default function ConversationThread({ conversationId, contactName, optedOut }) {
  const { user } = useUser();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    let closed = false;
    setLoading(true);
    setMessages([]);
    apiFetch(`/conversations/${conversationId}/messages`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!closed) setMessages(data); })
      .finally(() => { if (!closed) setLoading(false); });

    const ws = new WebSocket(`${getWsBaseUrl()}/ws/conversation/${conversationId}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "sms_status") {
          setMessages((prev) => prev.map((m) => (m.id === msg.message_id ? { ...m, sms_status: msg.sms_status, sms_error: msg.sms_error } : m)));
        } else if (msg.id) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      } catch { /* ignore anything that isn't a message */ }
    };
    return () => { closed = true; ws.close(); };
  }, [conversationId]);

  // Scroll only this message list, never the page sideways.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" }); }, [messages, draft !== ""]);

  const send = () => {
    const text = draft.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ content: text }));
    setDraft("");
  };

  const preview = !optedOut && draft.trim() ? buildClientText(user?.first_name, draft) : null;
  const parts = preview ? countTextParts(preview) : 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && <p className="text-sm text-muted-foreground">Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">No messages yet. Your first message goes out as a text.</p>
        )}
        <div className="space-y-4">
          {messages.map((msg, idx) => {
            const fromStaff = msg.sender_id && msg.sender_user && msg.sender_user.role !== "client";
            const isOwn = msg.sender_id === user?.id;
            const name = isOwn ? "You" : fromStaff ? msg.sender_user?.name : contactName || "Them";
            const showDay = idx === 0 || dayOf(messages[idx - 1].timestamp) !== dayOf(msg.timestamp);
            const status = fromStaff ? describeTextStatus(msg.sms_status, msg.sms_error) : null;
            return (
              <div key={msg.id}>
                {showDay && (
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[0.6875rem] font-medium text-muted-foreground">{dayOf(msg.timestamp)}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={`flex ${fromStaff ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[75%] gap-2.5 ${fromStaff ? "flex-row-reverse" : ""}`}>
                    <span className={`mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${fromStaff ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {initials(isOwn ? user?.name : name)}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className={`px-1 text-[0.6875rem] font-medium text-muted-foreground ${fromStaff ? "text-right" : ""}`}>{name}</p>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${fromStaff ? "rounded-br-sm bg-primary text-primary-foreground" : msg.message_type === "file_upload" ? "rounded-bl-sm border border-success/40 bg-success/10" : "rounded-bl-sm border border-border bg-card shadow-sm"}`}>
                        {msg.message_type === "file_request" && <span className="mb-1 flex items-center gap-1 text-xs font-semibold opacity-90"><FilePlus className="h-3.5 w-3.5" /> Document request</span>}
                        {msg.message_type === "file_send" && <span className="mb-1 flex items-center gap-1 text-xs font-semibold opacity-90"><Paperclip className="h-3.5 w-3.5" /> Documents sent</span>}
                        {msg.message_type === "file_upload" && <Paperclip className="mr-1.5 inline h-3.5 w-3.5 text-success" aria-hidden />}
                        {msg.content}
                      </div>
                      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[0.6875rem] text-muted-foreground ${fromStaff ? "flex-row-reverse" : ""}`}>
                        <time>{timeOf(msg.timestamp)}</time>
                        {!fromStaff && msg.message_type === "file_upload" && <span>Upload link</span>}
                        {!fromStaff && msg.channel === "sms" && (
                          <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> By text</span>
                        )}
                        {status && (
                          <span role="status" className={`flex items-center gap-1 ${status.tone === "danger" ? "font-medium text-destructive" : status.tone === "warning" ? "text-warning" : ""}`}>
                            {status.busy && <Loader2 className="h-3 w-3 animate-spin" />}
                            {status.done && <CheckCheck className="h-3 w-3 text-success" />}
                            {!status.busy && !status.done && status.tone === "muted" && <Check className="h-3 w-3" />}
                            {status.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={endRef} />
      </div>

      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/50 px-4 py-2 focus-within:border-primary/50">
          <Textarea
            aria-label="Message"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={optedOut ? `${contactName || "This number"} opted out of texts. Messages are saved but not sent.` : `Text ${contactName || "this number"}`}
            className="max-h-40 min-h-0 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={send} disabled={!draft.trim() || !connected} aria-label="Send text">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {preview && (
          <div className="mt-2 flex items-start justify-between gap-4 px-1 text-xs">
            <p className="min-w-0 text-muted-foreground">
              <span className="font-medium text-foreground">Their phone shows: </span>
              <span className="line-clamp-2 break-words">{preview}</span>
            </p>
            {parts > 1 && <span className="shrink-0 font-medium text-warning tabular">Sends as {parts} texts</span>}
          </div>
        )}
        <p className="mt-1 px-1 text-[0.6875rem] text-muted-foreground">
          {connected ? "Enter to send, Shift+Enter for a new line" : "Connecting…"}
        </p>
      </div>
    </div>
  );
}
