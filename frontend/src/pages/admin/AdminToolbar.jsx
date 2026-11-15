import { useRef } from "react";
import { ArrowUpDown, Download, Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMN_OPTIONS, DEFAULT_COLUMNS, buildCsv, exportContent } from "./utils";

export function AdminToolbar({
  dataset,
  query,
  onQueryChange,
  visibleColumns,
  onToggleColumn,
  rows,
  selectedRows,
  exportNormalizer,
  extraFilters,
  extraActions,
}) {
  const searchRef = useRef(null);
  const cols = COLUMN_OPTIONS[dataset] || [];
  const curVis = visibleColumns || DEFAULT_COLUMNS[dataset];

  const handleExport = (targetRows, format) => {
    const normalized = targetRows.map(exportNormalizer);
    if (format === "json") {
      exportContent(`admin-${dataset}-${Date.now()}.json`, JSON.stringify(normalized, null, 2), "application/json");
    } else {
      exportContent(`admin-${dataset}-${Date.now()}.csv`, buildCsv(normalized), "text/csv;charset=utf-8;");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border bg-card">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-9 h-8 text-sm"
          placeholder={`Search ${dataset}...`}
        />
      </div>

      {extraFilters}

      {cols.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {cols.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={curVis.includes(col.key)}
                onCheckedChange={() => onToggleColumn(col.key)}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => handleExport(rows, "csv")}>All visible as CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport(rows, "json")}>All visible as JSON</DropdownMenuItem>
          {selectedRows.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport(selectedRows, "csv")}>Selection as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport(selectedRows, "json")}>Selection as JSON</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {extraActions}
    </div>
  );
}

export function BulkBar({ count, children, onClear }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/10">
      <Badge variant="secondary">{count} selected</Badge>
      {children}
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClear}>Clear</Button>
    </div>
  );
}

export function SortButton({ dataset, field, label, currentSort, onSort }) {
  const active = currentSort?.field === field;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 cursor-pointer transition-colors duration-150",
        active ? "text-primary font-semibold" : "font-medium text-muted-foreground hover:text-foreground"
      )}
      onClick={() => onSort(field)}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}

export const thClass = "px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground bg-muted";
export const tdClass = "px-3 py-2 text-sm text-foreground align-middle";

export function rowClass(isFocused) {
  return cn(
    "border-t border-border transition-colors duration-150 hover:bg-muted/50 cursor-pointer",
    isFocused && "bg-primary/5 border-l-2 border-l-primary/30"
  );
}
