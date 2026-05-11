"use client";

import React, { useEffect, useState, useMemo } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getStoredUser, fetchCurrentUser } from "@/lib/auth";
import { FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CLASS = {
  uploaded: "bg-blue-50 text-blue-700 border border-blue-200",
  reviewed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  required: "bg-amber-50 text-amber-700 border border-amber-200",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
};

export default function Documents() {
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) { setUser(stored); return; }
    fetchCurrentUser().then((u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    apiFetch(`/documents?user_id=${user.id}&role=${user.role}`)
      .then((res) => res.json())
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [user]);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.name?.toLowerCase().includes(q) ||
        doc.case_title?.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Documents</h1>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && filteredDocuments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{searchQuery ? "No results found" : "No documents available"}</p>
          </div>
        )}

        {!isLoading && filteredDocuments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="border-border shadow-none hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-start justify-between gap-2">
                    <span className="truncate">{doc.name}</span>
                    {doc.status && (
                      <span className={cn(
                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium flex-shrink-0",
                        STATUS_CLASS[doc.status] || "bg-muted text-muted-foreground border border-border"
                      )}>
                        {doc.status}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-0.5">Case: {doc.case_title || "N/A"}</p>
                  <p className="text-sm text-muted-foreground mb-3">Date: {doc.upload_date || "—"}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!doc.file_path}
                    className="cursor-pointer"
                    onClick={() => window.open(`${API_BASE_URL}/documents/${doc.id}/download`, "_blank")}
                  >
                    Download
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
