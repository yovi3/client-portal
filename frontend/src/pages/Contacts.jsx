// src/pages/Contacts.jsx

"use client";

import React, { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ✅ FIXED: Fetch from the correct '/clients' endpoint
    fetch("http://127.0.0.1:8002/clients")
      .then((res) => res.json())
      .then((data) => {
        setContacts(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  return (
    <MainLayout>
      <motion.div
        className="p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold mb-6">Contacts (Clients)</h1>

        {isLoading && (
          <p className="text-muted-foreground text-sm mt-4">Loading contacts...</p>
        )}

        {!isLoading && contacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {contacts.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      {c.name}
                      {/* ✅ FIXED: Data is nested in client_profile */}
                      {c.client_profile?.active_cases > 0 && (
                        <Badge variant="secondary">
                          {c.client_profile.active_cases} Cases
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-1">
                      Email: {c.email || "N/A"}
                    </p>
                    {/* ✅ FIXED: Data is nested in client_profile */}
                    <p className="text-sm text-muted-foreground mb-1">
                      Phone: {c.client_profile?.phone || "N/A"}
                    </p>
                    {/* ✅ FIXED: Field name is joined_date */}
                    <p className="text-sm text-muted-foreground">
                      Joined: {c.joined_date ? new Date(c.joined_date).toLocaleDateString() : "—"}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          !isLoading && <p className="text-muted-foreground text-sm mt-4">No contacts available.</p>
        )}
      </motion.div>
    </MainLayout>
  );
}