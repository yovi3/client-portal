import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CaseCard({ caseData, onClick }) {
  return (
    <Card
      className="border-border shadow-none hover:shadow-sm transition-shadow cursor-pointer"
      onClick={() => onClick(caseData.id)}
    >
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>{caseData.title}</span>
          {caseData.unread_count > 0 && (
            <Badge variant="destructive">New ({caseData.unread_count})</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-1">
          Lawbase Case Number: {caseData.lawbase_case_number ?? "N/A"}
        </p>
        <p className="text-sm text-muted-foreground mb-1">
          Clients: {(caseData.clients?.map((cl) => cl.name).join(", ")) || "N/A"}
        </p>
        <p className="text-sm text-muted-foreground">
          Assigned:{" "}
          {caseData.personnel?.[0]
            ? `${caseData.personnel[0].role} (${caseData.personnel[0].name})`
            : "N/A"}
        </p>
      </CardContent>
    </Card>
  );
}
