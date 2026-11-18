import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowDown, ArrowUp, FileDown, FileUp, Filter, FolderOpen, List, Loader2, MessagesSquare, MoreHorizontal,
  PanelBottom, PanelLeft, PanelRight, Pencil, Plus, Search, Smartphone, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import ConversationThread from "@/components/conversation/ConversationThread";
import FileRequestsPanel from "@/components/conversation/FileRequestsPanel";
import RequestDocumentsDialog from "@/components/conversation/RequestDocumentsDialog";
import SendDocumentsDialog from "@/components/conversation/SendDocumentsDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch, getWsBaseUrl } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { formatPhone } from "@/lib/texting";

// Leads (tasks 1.2, 1.4, 2.5).
//   Lead list (the default): every lead, 50 at a time; scrolling loads more, and
//     sorting or searching asks the server, so it stays quick with any number of leads.
//   Conversation view (opening a lead): the active leads, then the opened lead's texts
//     and documents, in the layout each person picks (remembered in their browser).
// Every lead has a "..." menu for the common actions.

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
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground tabular">
      <Filter className="h-3 w-3" aria-hidden />
      Lead {number}
    </span>
  );
}

// The "..." menu on a lead: open it, request or send documents, and (for leads typed
// in by hand) edit or delete. LeadBase leads are changed in LeadBase.
//
// Speed: a full menu component is only created for the lead whose menu is open. Every
// other row shows a plain button (LeadMenuButton), so a list of hundreds of leads stays
// light. modal={false} keeps the open menu from touching the rest of the page.
const menuButtonClass =
  "rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function LeadMenuButton({ lead, onOpenMenu, className = "" }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenMenu(lead.id); }}
      aria-label={`Actions for lead ${lead.lead_number}`}
      aria-haspopup="menu"
      className={`${menuButtonClass} ${className}`}
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}

function LeadActions({ lead, open, onOpenChange, onOpen, onRequest, onSend, onEdit, onDelete, className = "" }) {
  const manual = lead.source !== "lawbase";
  const textable = !!lead.conversation_id;
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Actions for lead ${lead.lead_number}`}
          className={`${menuButtonClass} ${className}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {onOpen && <DropdownMenuItem onSelect={() => onOpen(lead)}><MessagesSquare className="h-4 w-4" /> Open conversation</DropdownMenuItem>}
        <DropdownMenuItem disabled={!textable} onSelect={() => onRequest(lead)}><FileUp className="h-4 w-4" /> Request documents</DropdownMenuItem>
        <DropdownMenuItem disabled={!textable} onSelect={() => onSend(lead)}><FileDown className="h-4 w-4" /> Send documents</DropdownMenuItem>
        {manual && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onEdit(lead)}><Pencil className="h-4 w-4" /> Edit lead</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDelete(lead)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Delete lead</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The menu for one lead: the full menu while open, the light button otherwise.
function LeadMenu({ lead, menuOpenFor, setMenuOpenFor, actions, onOpen, className = "" }) {
  if (menuOpenFor !== lead.id) {
    return <LeadMenuButton lead={lead} onOpenMenu={setMenuOpenFor} className={className} />;
  }
  return (
    <LeadActions
      lead={lead}
      open
      onOpenChange={(o) => { if (!o) setMenuOpenFor(null); }}
      onOpen={onOpen}
      {...actions}
      className={className}
    />
  );
}

// One row of the conversation view's lead list. Memoized: it only redraws when its own
// lead, its selection or its menu changes, not when anything else on the page does.
const LeadListItem = memo(function LeadListItem({ lead, active, shaded, menuOpen, onSelect, setMenuOpenFor, actions }) {
  return (
    // content-visibility: the browser skips laying out rows that are off screen until
    // they're scrolled into view, so a long list shows up at once.
    <li className="relative [content-visibility:auto] [contain-intrinsic-size:auto_5.75rem]">
      <button
        type="button"
        onClick={() => onSelect(lead)}
        aria-current={active ? "true" : undefined}
        className={`w-full border-b border-l-2 border-b-border/60 py-3 pl-4 pr-10 text-left transition-colors ${active ? "border-l-primary bg-accent" : `border-l-transparent ${shaded ? "bg-muted/60" : "bg-card"} hover:bg-accent/60`}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{lead.name || formatPhone(lead.phone) || "No name"}</span>
          <span className="shrink-0 text-[0.6875rem] text-muted-foreground"><time>{shortTime(lead.last_message_at)}</time></span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <LeadTag number={lead.lead_number} />
          {lead.lead_type && <span className="text-[0.6875rem] text-muted-foreground">{lead.lead_type}</span>}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {lead.last_message
            ? `${lead.last_message.inbound ? "" : "You: "}${lead.last_message.content}`
            : lead.phone ? "No texts yet" : "No mobile number"}
        </p>
      </button>
      <LeadMenu lead={lead} menuOpenFor={menuOpen ? lead.id : null} setMenuOpenFor={setMenuOpenFor} actions={actions} className="absolute right-1.5 top-2.5" />
    </li>
  );
});

// How an opened lead's texts and documents are arranged. Each person picks; remembered
// in this browser.
const LAYOUTS = [
  { key: "docs-left", label: "Documents on the left", icon: PanelLeft },
  { key: "docs-right", label: "Documents on the right", icon: PanelRight },
  { key: "docs-top", label: "Documents above the texts", icon: PanelBottom },
  { key: "texts", label: "Texts only (documents in a side panel)", icon: MessagesSquare },
];
const LAYOUT_KEY = "dssc.leadLayout";
const readLayout = () => {
  try { const v = localStorage.getItem(LAYOUT_KEY); return LAYOUTS.some((l) => l.key === v) ? v : "docs-left"; } catch { return "docs-left"; }
};

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get("lead")) || null;
  // The lead list is the default; opening a lead (or asking for it) shows conversations.
  const view = selectedId || searchParams.get("view") === "conversations" ? "conversations" : "list";

  const [activeLeads, setActiveLeads] = useState([]); // New / In Progress, for the conversation view
  const [openedLead, setOpenedLead] = useState(null);  // an opened lead that isn't active
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = adding, lead = editing
  const [requestFor, setRequestFor] = useState(null);
  const [sendFor, setSendFor] = useState(null);
  const [activity, setActivity] = useState({});       // conversation id -> counter, bumps on news
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [listVersion, setListVersion] = useState(0);  // bump to make the lead list reload
  const [layout, setLayoutState] = useState(readLayout);
  const [docsOpen, setDocsOpen] = useState(false);    // the side panel in the "texts only" layout
  const setLayout = (key) => { setLayoutState(key); setDocsOpen(false); try { localStorage.setItem(LAYOUT_KEY, key); } catch { /* storage unavailable */ } };

  const loadActive = useCallback(async () => {
    try {
      const res = await apiFetch("/leads");
      if (!res.ok) throw new Error("Leads couldn't be loaded.");
      setActiveLeads(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActive();
    apiFetch("/leads/staff").then(async (r) => { if (r.ok) setStaff(await r.json()); });
  }, [loadActive]);

  // A lead opened from the list that isn't New or In Progress: fetch it on its own.
  useEffect(() => {
    if (!selectedId || loading || activeLeads.some((l) => l.id === selectedId)) { setOpenedLead(null); return; }
    apiFetch(`/leads/${selectedId}`).then((r) => (r.ok ? r.json() : null)).then(setOpenedLead);
  }, [selectedId, activeLeads, loading]);

  // Live: reload when any conversation has news (a reply, a sent text, an upload).
  const reloadTimer = useRef(null);
  useEffect(() => {
    const ws = new WebSocket(`${getWsBaseUrl()}/ws/staff/activity`);
    ws.onmessage = (event) => {
      try {
        const { conversation_id: id } = JSON.parse(event.data);
        if (id) setActivity((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
      } catch { /* ignore */ }
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(loadActive, 400);
    };
    return () => { clearTimeout(reloadTimer.current); ws.close(); };
  }, [loadActive]);

  const shownLeads = useMemo(() => (openedLead ? [openedLead, ...activeLeads] : activeLeads), [openedLead, activeLeads]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shownLeads.filter((l) => !q || `${l.lead_number} ${l.name || ""} ${l.phone || ""}`.toLowerCase().includes(q));
  }, [shownLeads, query]);
  const selected = shownLeads.find((l) => l.id === selectedId) || (!selectedId ? filtered[0] : null);

  const openLead = useCallback((lead) => setSearchParams({ lead: String(lead.id) }), [setSearchParams]);
  const showList = () => setSearchParams({});
  const showConversations = () => setSearchParams(selected ? { lead: String(selected.id) } : { view: "conversations" });
  const bump = (lead) => lead?.conversation_id && setActivity((p) => ({ ...p, [lead.conversation_id]: (p[lead.conversation_id] || 0) + 1 }));
  const refreshAll = useCallback(() => { loadActive(); setListVersion((v) => v + 1); }, [loadActive]);

  const deleteLead = useCallback(async (lead) => {
    if (!window.confirm(`Delete lead ${lead.lead_number}${lead.name ? ` (${lead.name})` : ""}? Its texts and documents are kept, and its conversation goes back to Needs assigning.`)) return;
    const res = await apiFetch(`/leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast.error(typeof data.detail === "string" ? data.detail : "The lead couldn't be deleted.");
    }
    toast.success(`Lead ${lead.lead_number} deleted`);
    window.dispatchEvent(new Event("conversations-changed"));
    if (selectedId === lead.id) setSearchParams({});
    refreshAll();
  }, [selectedId, setSearchParams, refreshAll]);

  const actions = useMemo(() => ({
    onRequest: (lead) => setRequestFor(lead),
    onSend: (lead) => setSendFor(lead),
    onEdit: (lead) => setEditing(lead),
    onDelete: deleteLead,
  }), [deleteLead]);

  const onSaved = (saved, wasEditing) => {
    setEditing(undefined);
    refreshAll();
    toast.success(wasEditing ? `Lead ${saved.lead_number} updated` : `Lead ${saved.lead_number} added`);
    if (saved.phone_note) toast.warning(saved.phone_note);
    if (!wasEditing) setSearchParams({ lead: String(saved.id) });
  };

  const documentsPanel = selected?.conversation_id && (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Documents</h3>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setRequestFor(selected)}><FileUp className="h-4 w-4" /> Request</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setSendFor(selected)}><FileDown className="h-4 w-4" /> Send</Button>
          {layout === "texts" && (
            <button type="button" onClick={() => setDocsOpen(false)} aria-label="Close documents" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileRequestsPanel conversationId={selected.conversation_id} refreshKey={activity[selected.conversation_id] || 0} contactName={selected.first_name || selected.name} />
      </div>
    </>
  );
  const thread = selected?.conversation_id && (
    <ConversationThread key={selected.conversation_id} conversationId={selected.conversation_id} contactName={selected.first_name || selected.name} optedOut={selected.sms_opted_out} />
  );

  return (
    <MainLayout>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.375rem] font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              {view === "list"
                ? "Every lead in the portal. Click a lead to open its texts and documents."
                : "LeadBase leads that are New or In Progress. Your messages go out as texts, and replies show up here."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={view === "list" ? showConversations : showList}>
              {view === "list" ? <><MessagesSquare className="h-4 w-4" /> Conversations</> : <><List className="h-4 w-4" /> Lead list</>}
            </Button>
            <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add lead</Button>
          </div>
        </div>

        {loadError && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {loadError}</p>}

        {view === "list" ? (
          <LeadTable onOpen={openLead} actions={actions} menuOpenFor={menuOpenFor} setMenuOpenFor={setMenuOpenFor} version={listVersion} />
        ) : (
          <div className="flex overflow-hidden rounded-lg border border-border bg-card" style={{ height: "calc(100vh - 13rem)" }}>
            {/* The leads, most recent conversation first */}
            <div className="flex w-72 shrink-0 flex-col border-r border-border xl:w-80">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Search leads" placeholder="Search name, lead number, phone" value={query} onChange={(e) => setQuery(e.target.value)} className="border-0 bg-muted/50 pl-9" />
                </div>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Leads">
                {loading && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
                {!loading && filtered.length === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">{activeLeads.length ? "No leads match." : "No active leads."}</li>
                )}
                {filtered.map((lead, idx) => (
                  <LeadListItem key={lead.id} lead={lead} active={selected?.id === lead.id} shaded={idx % 2 === 1}
                    menuOpen={menuOpenFor === lead.id} onSelect={openLead} setMenuOpenFor={setMenuOpenFor} actions={actions} />
                ))}
              </ul>
            </div>

            {/* The opened lead */}
            <div className="flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{selected.name || "No name"}</h2>
                        <LeadTag number={selected.lead_number} />
                        {selected.lead_type && <span className="text-xs text-muted-foreground">{selected.lead_type}</span>}
                        {selected.lb_status && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{selected.lb_status}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Assigned to {selected.assigned_user?.name || selected.assigned_name || "nobody"}
                        {selected.source === "lawbase" ? ". From LeadBase" : ". Typed in by hand"}
                        {selected.language && selected.language.toLowerCase() !== "english" ? `. Speaks ${selected.language}` : ""}
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
                    <div className="flex items-center gap-2">
                      {selected.conversation_id && (
                        <>
                          {layout === "texts" && (
                            <Button size="sm" variant={docsOpen ? "secondary" : "outline"} className="h-8" onClick={() => setDocsOpen((o) => !o)} aria-expanded={docsOpen}>
                              <FolderOpen className="h-4 w-4" /> Documents
                            </Button>
                          )}
                          <div role="radiogroup" aria-label="Layout" className="flex rounded-md border border-border p-0.5">
                            {LAYOUTS.map(({ key, label, icon: Icon }) => (
                              <button key={key} type="button" role="radio" aria-checked={layout === key} aria-label={label} title={label}
                                onClick={() => setLayout(key)}
                                className={`rounded p-1.5 ${layout === key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                                <Icon className="h-4 w-4" />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <LeadMenu lead={{ ...selected, id: `header-${selected.id}` }} menuOpenFor={menuOpenFor} setMenuOpenFor={setMenuOpenFor}
                        actions={{ ...actions, onRequest: () => actions.onRequest(selected), onSend: () => actions.onSend(selected), onEdit: () => actions.onEdit(selected), onDelete: () => actions.onDelete(selected) }} />
                    </div>
                  </div>

                  {selected.conversation_id ? (
                    layout === "docs-top" ? (
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <section className="flex max-h-[40%] min-h-0 shrink-0 flex-col border-b border-border bg-[var(--docs-surface)]" aria-label="Documents">{documentsPanel}</section>
                        {thread}
                      </div>
                    ) : layout === "texts" ? (
                      <div className="relative flex min-h-0 min-w-0 flex-1">
                        {thread}
                        {docsOpen && (
                          <aside className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l border-border bg-[var(--docs-surface)] shadow-xl xl:w-96" aria-label="Documents">{documentsPanel}</aside>
                        )}
                      </div>
                    ) : (
                      <div className={`flex min-h-0 min-w-0 flex-1 ${layout === "docs-right" ? "flex-row-reverse" : ""}`}>
                        <aside className={`flex w-72 shrink-0 flex-col border-border bg-[var(--docs-surface)] xl:w-80 ${layout === "docs-right" ? "border-l" : "border-r"}`} aria-label="Documents">{documentsPanel}</aside>
                        {thread}
                      </div>
                    )
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                      <Smartphone className="h-8 w-8 text-muted-foreground" aria-hidden />
                      <h3 className="mt-3 text-base font-semibold">{selected.phone ? "This number can't be texted from here" : "No mobile number yet"}</h3>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        {selected.phone_note || (selected.source === "lawbase"
                          ? "Add the client's mobile number in LeadBase. It shows up here within a minute."
                          : "Add the lead's mobile number to start texting.")}
                      </p>
                      {!selected.phone && selected.source !== "lawbase" && <Button className="mt-4" onClick={() => setEditing(selected)}><Pencil className="h-4 w-4" /> Add a number</Button>}
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
      <RequestDocumentsDialog open={!!requestFor} conversationId={requestFor?.conversation_id} contactName={requestFor?.first_name || requestFor?.name}
        onClose={() => setRequestFor(null)} onSent={() => bump(requestFor)} />
      <SendDocumentsDialog open={!!sendFor} conversationId={sendFor?.conversation_id} contactName={sendFor?.first_name || sendFor?.name}
        onClose={() => setSendFor(null)} onSent={() => bump(sendFor)} />
    </MainLayout>
  );
}

// The lead list: 50 leads at a time from the server. Scrolling near the bottom loads the
// next 50; sorting or searching starts over with fresh results from the server.
const PAGE = 50;
// Fixed widths add up to about 56rem; Name takes whatever is left, at least 10rem.
const COLUMNS = [
  { key: "lead_number", label: "Lead", width: "w-[7.5rem]" },
  { key: "name", label: "Name" },
  { key: null, label: "Mobile", width: "w-[9rem]" },
  { key: "type", label: "Type", width: "w-[6rem]" },
  { key: "assigned", label: "Assigned to", width: "w-[10rem]" },
  { key: "status", label: "LeadBase status", width: "w-[8rem]" },
  { key: "source", label: "Source", width: "w-[5.5rem]" },
  { key: "created", label: "Added", width: "w-[8rem]" },
];

function LeadTable({ onOpen, actions, menuOpenFor, setMenuOpenFor, version }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState({ key: "created", dir: "desc" });
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");            // the search actually sent (after typing pauses)
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const sentinel = useRef(null);
  const requestId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const fetchPage = useCallback(async (offset) => {
    const params = new URLSearchParams({ show: "all", sort: sort.key, direction: sort.dir, offset: String(offset), limit: String(PAGE) });
    if (q) params.set("q", q);
    const res = await apiFetch(`/leads/page?${params}`);
    if (!res.ok) throw new Error("Leads couldn't be loaded.");
    return res.json();
  }, [sort, q]);

  // First page whenever the sort, the search or the data changes.
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    fetchPage(0)
      .then((page) => { if (id !== requestId.current) return; setRows(page.items); setTotal(page.total); setError(null); })
      .catch((e) => { if (id === requestId.current) setError(e.message); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [fetchPage, version]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || rows.length >= total) return;
    const id = requestId.current;
    setLoadingMore(true);
    fetchPage(rows.length)
      .then((page) => { if (id === requestId.current) setRows((r) => [...r, ...page.items.filter((x) => !r.some((y) => y.id === x.id))]); })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMore(false));
  }, [loading, loadingMore, rows.length, total, fetchPage]);

  // Load the next page when the bottom of the list comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "created" ? "desc" : "asc" }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search all leads" placeholder="Search lead number, name, phone, assigned" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? "Loading…" : `Showing ${rows.length} of ${total} ${total === 1 ? "lead" : "leads"}`}
        </p>
      </div>
      {error && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {/* Fixed column widths: the browser doesn't have to measure every row to size them. */}
        <table className="w-full min-w-[66rem] table-fixed text-sm">
          <colgroup>
            {COLUMNS.map((c, i) => <col key={i} className={c.width || ""} />)}
            <col className="w-12" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {COLUMNS.map((c, i) => (
                <th key={i} className="px-4 py-2.5 font-medium" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.key ? (
                    <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label}
                      {sort.key === c.key && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <LeadTableRow key={lead.id} lead={lead} onOpen={onOpen} actions={actions} menuOpen={menuOpenFor === lead.id} setMenuOpenFor={setMenuOpenFor} />
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-muted-foreground">{q ? "No leads match your search." : "No leads yet. Leads from LeadBase show up here within a minute."}</td></tr>
            )}
          </tbody>
        </table>
        <div ref={sentinel} className="flex h-10 items-center justify-center text-xs text-muted-foreground">
          {loadingMore ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading more…</> : rows.length > 0 && rows.length >= total ? "End of the list" : ""}
        </div>
      </div>
    </div>
  );
}

// One row of the lead list table; memoized like the conversation list rows.
const LeadTableRow = memo(function LeadTableRow({ lead, onOpen, actions, menuOpen, setMenuOpenFor }) {
  return (
    <tr onClick={() => onOpen(lead)} className="cursor-pointer border-b border-border last:border-0 even:bg-muted/60 hover:bg-accent/60 [content-visibility:auto] [contain-intrinsic-size:auto_3.25rem]">
      <td className="px-4 py-2.5">
        <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); onOpen(lead); }} aria-label={`Open lead ${lead.lead_number}`}>
          <LeadTag number={lead.lead_number} />
        </button>
      </td>
      <td className="truncate px-4 py-3 font-medium">{lead.name || <span className="text-muted-foreground">No name</span>}</td>
      <td className="px-4 py-2.5">
        {lead.phone ? <span className="tabular">{formatPhone(lead.phone)}</span> : <span className="text-muted-foreground">None</span>}
        {lead.phone_note && <p className="mt-0.5 flex items-center gap-1 text-xs text-warning"><AlertCircle className="h-3 w-3 shrink-0" /> {lead.phone_note}</p>}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{lead.lead_type || ""}</td>
      <td className="truncate px-4 py-3">{lead.assigned_user?.name || lead.assigned_name || <span className="text-muted-foreground">Unassigned</span>}</td>
      <td className="px-4 py-2.5"><span className={lead.status === "open" ? "font-medium" : "text-muted-foreground"}>{lead.lb_status || STATUS_LABEL[lead.status] || lead.status}</span></td>
      <td className="px-4 py-2.5 text-muted-foreground">{lead.source === "lawbase" ? "LeadBase" : "Typed in"}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground"><time>{formatDate(lead.created_at)}</time></td>
      <td className="px-2 py-2.5"><LeadMenu lead={lead} menuOpenFor={menuOpen ? lead.id : null} setMenuOpenFor={setMenuOpenFor} actions={actions} onOpen={onOpen} /></td>
    </tr>
  );
});

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
