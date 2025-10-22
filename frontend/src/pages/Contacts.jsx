"use client";

import React, { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/contacts")
      .then((res) => res.json())
      .then((data) => setContacts(data))
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
        <h1 className="text-3xl font-bold mb-6">Contacts</h1>

        {contacts.length > 0 ? (
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
                      {c.activeCases > 0 && (
                        <Badge variant="secondary">{c.activeCases} Cases</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-1">
                      Email: {c.email || "N/A"}
                    </p>
                    <p className="text-sm text-muted-foreground mb-1">
                      Phone: {c.phone || "N/A"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Joined: {c.joinedDate || "—"}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm mt-4">No contacts available.</p>
        )}
      </motion.div>
    </MainLayout>
  );
}
