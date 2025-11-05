"use client";

import React, { useState, useEffect } from "react";
import { Home, Briefcase, Users, FileText, MessageSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation } from "react-router-dom";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // --- MODIFIED: Load the full user object ---
  const [user, setUser] = useState(null);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUserData = localStorage.getItem("user");
      if (storedUserData) {
        try {
          setUser(JSON.parse(storedUserData));
        } catch (e) {
          console.error("Failed to parse user data from localStorage:", e);
        }
      }
    }
  }, []);
  // --- END MODIFIED ---

  // --- ADDED: Effect to fetch total unread count ---
  useEffect(() => {
    if (user && user.id && user.role) {
      const fetchTotalCount = async () => {
        try {
          const res = await fetch(`http://0.0.0.0:8002/users/${user.id}/unread-count?role=${user.role}`);
          if (!res.ok) {
            throw new Error("Failed to fetch unread count");
          }
          const data = await res.json();
          setTotalUnreadCount(data.total_unread_count);
        } catch (err) {
          console.error(err.message);
        }
      };
      
      fetchTotalCount();
      
      // Optional: Poll for new messages every 30 seconds
      const interval = setInterval(fetchTotalCount, 30000);
      return () => clearInterval(interval);

    }
  }, [user]); // Re-run when user is loaded
  // --- END ADDED ---

  const baseNavItems = [
    { name: "Overview", icon: Home, path: "/dashboard", roles: ["lawyer", "client"] },
    { name: "Cases", icon: Briefcase, path: "/cases", roles: ["lawyer", "client"] },
    { name: "Contacts", icon: Users, path: "/contacts", roles: ["lawyer"] }, 
    { name: "Documents", icon: FileText, path: "/documents", roles: ["lawyer"] }, 
    { name: "Messages", icon: MessageSquare, path: "/messages", roles: ["lawyer", "client"] }, // Badge removed
    { name: "Settings", icon: Settings, path: "/settings", roles: ["lawyer", "client"] },
  ];

  // Filter items based on the user's role
  const filteredNavItems = baseNavItems.filter(item => 
    !user || !user.role || item.roles.includes(user.role)
  );

  return (
    <aside className="w-64 border-r bg-card p-4">
      <h2 className="text-xl font-bold mb-6 ml-1">Feed</h2>
      <nav className="space-y-2">
        {filteredNavItems.map(({ name, icon: Icon, path }) => (
          <Button
            key={name}
            variant={location.pathname === path ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => navigate(path)}
          >
            <Icon className="h-4 w-4 mr-2" />
            {name}
            {/* ✅ MODIFIED: Dynamically add badge only for Messages */}
            {name === "Messages" && totalUnreadCount > 0 && (
              <Badge className="ml-auto" variant="destructive">{totalUnreadCount}</Badge>
            )}
          </Button>
        ))}
      </nav>
    </aside>
  );
}