"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import MainLayout from "@/components/layout/MainLayout";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  // --- STATE ---
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined") {
      const storedUserData = localStorage.getItem("user");
      return storedUserData ? JSON.parse(storedUserData) : null;
    }
    return null;
  });

  const [allCases, setAllCases] = useState([]); // Store fetched cases
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [dataError, setDataError] = useState(null);

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // --- EFFECT 1: AUTH & REDIRECT ---
  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);


  // --- EFFECT 2: DATA FETCHING (Using the unified User ID) ---
  useEffect(() => {
    if (!user || user.role !== 'lawyer') return; // Only lawyers fetch this dashboard view

    const fetchCases = async () => {
      setIsLoadingCases(true);
      setDataError(null);
      
      try {
        // Use the unified user.id as the lawyer_id
        const res = await fetch(`http://0.0.0.0:8002/lawyers/${user.id}/cases`);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: "Failed to fetch cases." }));
          throw new Error(errorData.detail || `HTTP error! Status: ${res.status}`);
        }

        const data = await res.json();
        
        if (Array.isArray(data)) {
          setAllCases(data);
        } else {
          throw new Error("Invalid data format received.");
        }
      } catch (err) {
        console.error("Case fetch error:", err);
        setDataError(err.message);
      } finally {
        setIsLoadingCases(false);
      }
    };

    fetchCases();
  }, [user]); 

  // --- FILTERING LOGIC ---

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

  const filteredCases = allCases.filter((c) => {
    // Note: unreadMessages is now unread_messages from the backend schema
    if (unreadOnly && c.unread_messages === 0) return false; 
    if (urgencyFilter !== "all" && c.priority !== urgencyFilter) return false;
    if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
    return true;
  });

  // --- EARLY RETURN: Unauthenticated/Loading ---
  if (!user) {
    return <MainLayout><div className="p-8 text-center text-gray-500">Authenticating...</div></MainLayout>;
  }

  // --- EARLY RETURN: Client Role ---
  if (user.role === 'client') {
    return (
      <MainLayout>
        <Card>
          <CardHeader><CardTitle>Client Dashboard</CardTitle></CardHeader>
          <CardContent>
            <p>Welcome, {user.name}. Your client-specific content goes here.</p>
            {/* You would implement client-specific case fetching here: /clients/{user.id}/cases */}
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  // --- MAIN LAWYER DASHBOARD RENDER ---

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
          <CardTitle>Recent Cases (Lawyer: {user.name})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingCases && <div className="text-center text-gray-500">Loading cases...</div>}
          {dataError && <div className="text-red-500">Error loading cases: {dataError}</div>}
          
          {!isLoadingCases && !dataError && filteredCases.length === 0 && (
             <div className="text-center text-gray-500">No cases assigned.</div>
          )}

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
                    {/* ✅ FIXED: Use the nested client_user name from the backend model */}
                    <span>Client: {c.client_user?.name || 'N/A'}</span>
                    <span>Status: {c.status}</span> 
                    {/* Updated date isn't in the schema, so we use status as a placeholder */}
                  </div>
                </div>
                {c.unread_messages > 0 && (
                  <Badge variant="destructive" className="h-6 w-6 rounded-full flex items-center justify-center p-0">
                    {c.unread_messages}
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