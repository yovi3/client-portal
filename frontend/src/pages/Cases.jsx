"use client";

import React, { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

export default function Cases() {
  const [cases, setCases] = useState([]);
  const [activeTab, setActiveTab] = useState("my");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/cases")
      .then((res) => res.json())
      .then((data) => setCases(data))
      .catch(console.error);
  }, []);

  const filteredCases = cases.filter((c) =>
    activeTab === "my" ? c.assigned_to_me === true : true
  );

  return (
    <MainLayout>
      <motion.div
        className="p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold mb-6">Cases</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="my">My Cases</TabsTrigger>
            <TabsTrigger value="all">All Cases</TabsTrigger>
          </TabsList>

          <TabsContent value="my">
            {filteredCases.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredCases.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                          <span>{c.title}</span>
                          {c.unread && <Badge variant="destructive">Unread</Badge>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-1">
                          Category: {c.category || "—"}
                        </p>
                        <p className="text-sm text-muted-foreground mb-1">
                          Urgency: {c.urgency ? `${c.urgency}/5` : "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Client: {c.client || "N/A"}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm mt-4">No cases found.</p>
            )}
          </TabsContent>

          <TabsContent value="all">
            {cases.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cases.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                          <span>{c.title}</span>
                          {c.unread && <Badge variant="destructive">Unread</Badge>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-1">
                          Category: {c.category || "—"}
                        </p>
                        <p className="text-sm text-muted-foreground mb-1">
                          Urgency: {c.urgency ? `${c.urgency}/5` : "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Client: {c.client || "N/A"}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm mt-4">No cases available.</p>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </MainLayout>
  );
}
