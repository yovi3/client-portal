import MainLayout from "@/components/layout/MainLayout";
import { Filter } from "lucide-react";

// Placeholder until conversations can be linked to LeadBase leads.
// The page exists now so staff see Leads and Cases as separate places from day one.
export default function Leads() {
  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <h1 className="text-[22px] font-bold tracking-tight">Leads</h1>
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <Filter className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-base font-semibold">No lead conversations yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Texts with LeadBase leads will show here, tagged with the lead number, once conversations
            can be linked to leads.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
