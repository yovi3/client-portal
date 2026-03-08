"use client";

import React, { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getStoredUser, fetchCurrentUser } from "@/lib/auth";

export default function Documents() {
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);

  // Load user on mount
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      return;
    }
    fetchCurrentUser().then((u) => setUser(u));
  }, []);

  // Fetch documents when user loads
  useEffect(() => {
    if (!user) return;

    apiFetch(`/documents?user_id=${user.id}&role=${user.role}`)
      .then((res) => res.json())
      .then((data) => setDocuments(data))
      .catch(console.error);
  }, [user]);

  return (
    <MainLayout>
      <motion.div
        className="p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold mb-6">Case Documents</h1>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      {doc.name}
                      {doc.status && <Badge variant="secondary">{doc.status}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-1">
                      Case: {doc.case_title || "N/A"}
                    </p>

                    <p className="text-sm text-muted-foreground mb-1">
                      Date: {doc.upload_date || "—"}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      File: {doc.file_path ? "Available" : "—"}
                    </p>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!doc.file_path}
                        onClick={() =>
                          window.open(`${API_BASE_URL}/documents/${doc.id}/download`, "_blank")
                        }
                      >
                        View / Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm mt-4">
            No documents available.
          </p>
        )}
      </motion.div>
    </MainLayout>
  );
}
