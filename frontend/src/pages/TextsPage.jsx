import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Filter, Smartphone } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import ConversationThread from "@/components/conversation/ConversationThread";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatPhone } from "@/lib/texting";
import { LinkLeadDialog } from "@/pages/NeedsAssigning";

// One conversation by itself: a number texted without a lead (from New text), or opened
// from Needs assigning. Staff can text here, and link the number to a lead when ready.
// A conversation that belongs to a lead opens on the Leads screen instead.

export default function TextsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conv, setConv] = useState(null);
  const [error, setError] = useState(null);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/conversations/${id}`);
    if (!res.ok) { setError(res.status === 404 ? "This conversation doesn't exist." : "The conversation couldn't be loaded."); return; }
    const data = await res.json();
    if (data.kind === "lead" && data.lead) { navigate(`/leads?lead=${data.lead.id}`, { replace: true }); return; }
    setConv(data);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  return (
    <MainLayout>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate("/needs-assigning")} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Needs assigning
            </button>
            <h1 className="text-[1.375rem] font-bold tracking-tight tabular">{conv ? formatPhone(conv.phone) : "Texts"}</h1>
            {conv && (
              <p className="text-sm text-muted-foreground">
                {conv.contact_name ? `${conv.contact_name}. ` : ""}Not linked to a lead yet. You can text this number now and link it when you know who it is.
              </p>
            )}
          </div>
          {conv && <Button onClick={() => setLinking(true)}><Filter className="h-4 w-4" /> Link to lead</Button>}
        </div>

        {error && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {error}</p>}

        {conv && (
          <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card" style={{ height: "calc(100vh - 14rem)" }}>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-[var(--texts-surface)] px-4 py-2">
              <h2 className="text-sm font-semibold">Texts</h2>
              {conv.sms_opted_out ? (
                <span className="text-xs font-medium text-warning">Opted out (replied STOP)</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Smartphone className="h-3 w-3" /> <span className="tabular">{formatPhone(conv.phone)}</span></span>
              )}
            </div>
            <ConversationThread key={conv.id} conversationId={conv.id} contactName={conv.contact_name} optedOut={conv.sms_opted_out} />
          </div>
        )}
      </div>

      {linking && conv && (
        <LinkLeadDialog
          conv={conv}
          onClose={() => setLinking(false)}
          onLinked={(_, result) => {
            setLinking(false);
            toast.success(`Linked to Lead ${result.lead.lead_number}`);
            window.dispatchEvent(new Event("conversations-changed"));
            navigate(`/leads?lead=${result.lead.id}`);
          }}
        />
      )}
    </MainLayout>
  );
}
