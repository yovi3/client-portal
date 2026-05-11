import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, value, hint, tone = "default" }) {
  return (
    <Card
      className={cn(
        "border border-border bg-card shadow-none border-l-[3px] transition-shadow hover:shadow-sm",
        tone === "default" && "border-l-slate-300",
        tone === "attention" && "border-l-amber-400",
        tone === "danger" && "border-l-red-400"
      )}
    >
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className={cn(
          "mt-1.5 text-2xl font-bold",
          tone === "default" && "text-foreground",
          tone === "attention" && "text-amber-700",
          tone === "danger" && "text-red-700"
        )}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }) {
  const map = {
    uploaded: "bg-blue-50 text-blue-700 border-blue-200",
    reviewed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    required: "bg-amber-50 text-amber-700 border-amber-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    used: "bg-emerald-50 text-emerald-700 border-emerald-200",
    expired: "bg-destructive/10 text-destructive border-red-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
      map[status] || "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}

export function TabSkeleton() {
  return (
    <div className="space-y-4 p-5 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[88px] rounded-lg bg-muted border border-border" />
        ))}
      </div>
      <div className="h-[400px] rounded-lg bg-muted border border-border" />
    </div>
  );
}
