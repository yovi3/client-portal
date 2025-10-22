"use client";

import React, { useState, useEffect } from "react"; // <-- ADDED useEffect
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import MainLayout from "@/components/layout/MainLayout";
import { useNavigate } from "react-router-dom"; // <-- ADDED useNavigate

export default function Dashboard() {
  const navigate = useNavigate(); // Initialize navigate

  // --- ADDED: User authentication check and state ---
  const [user, setUser] = useState(() => {
    // Check localStorage immediately on component load (client-side)
    if (typeof window !== "undefined") {
      const storedUserData = localStorage.getItem("user");
      return storedUserData ? JSON.parse(storedUserData) : null;
    }
    return null;
  });

  useEffect(() => {
    // If user is null, redirect to login
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);
  // --- END ADDED ---

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const cases = [
    {
      id: "1",
      title: "Smith vs. Johnson Property Dispute",
      status: "active",
      // NOTE: Using the logged-in user's name if available
      client: user ? user.name : "N/A", 
      lastUpdate: "2 hours ago",
      description: "Property boundary dispute requiring immediate attention",
      priority: "high",
      unreadMessages: 3,
      category: "Property",
    },
  ];

  const getStatusColor = (status) => ({
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    closed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  }[status] || "bg-gray-500/10 text-gray-500 border-gray-500/20");

  const getPriorityColor = (priority) => ({
    high: "bg-red-500/10 text-red-500 border-red-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  }[priority] || "bg-gray-500/10 text-gray-500 border-gray-500/20");

  const filteredCases = cases.filter((c) => {
    if (unreadOnly && c.unreadMessages === 0) return false;
    if (urgencyFilter !== "all" && c.priority !== urgencyFilter) return false;
    if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
    return true;
  });

  // --- ADDED: Early return for unauthenticated users or during client hydration ---
  if (!user) {
    // Return null or a simple loading screen while the redirect happens
    // The useEffect hook will handle the actual navigation
    return <MainLayout><div className="p-8 text-center text-gray-500">Authenticating...</div></MainLayout>;
  }
  // --- END ADDED ---


  return (
    <MainLayout>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={unreadOnly ? "default" : "outline"}
          onClick={() => setUnreadOnly(!unreadOnly)}
        >
          Unread
        </Button>

        <Select onValueChange={setUrgencyFilter}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Urgency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Property">Property</SelectItem>
            <SelectItem value="Criminal">Criminal</SelectItem>
            <SelectItem value="Corporate">Corporate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Cases (User: {user.name})</CardTitle> {/* Display user for verification */}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredCases.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{c.title}</h3>
                    <Badge variant="outline" className={getStatusColor(c.status)}>{c.status}</Badge>
                    <Badge variant="outline" className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{c.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Client: {c.client}</span>
                    <span>Updated: {c.lastUpdate}</span>
                  </div>
                </div>
                {c.unreadMessages > 0 && (
                  <Badge variant="destructive" className="h-6 w-6 rounded-full flex items-center justify-center p-0">
                    {c.unreadMessages}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </MainLayout>
  );
}