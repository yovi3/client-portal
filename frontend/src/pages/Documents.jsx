"use client";

import React, { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function Documents() {
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/documents")
      .then((res) => res.json())
      .then((data) => setDocuments(data))
      .catch(console.error);
  }, []);

  return (
    <MainLayout>
      <motion.div
        className="p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold mb-6">Documents</h1>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      {doc.title}
                      {doc.type && <Badge variant="secondary">{doc.type}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-1">
                      Uploaded by: {doc.uploadedBy || "N/A"}
                    </p>
                    <p className="text-sm text-muted-foreground mb-1">
                      Date: {doc.uploadDate || "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Description: {doc.description || "—"}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm mt-4">No documents available.</p>
        )}
      </motion.div>
    </MainLayout>
  );
}
