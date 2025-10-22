"use client";

import React from "react";
import { Home, Briefcase, Users, FileText, MessageSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation } from "react-router-dom";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { name: "Overview", icon: Home, path: "/dashboard" },
    { name: "Cases", icon: Briefcase, path: "/cases" },
    { name: "Contacts", icon: Users, path: "/contacts" },
    { name: "Documents", icon: FileText, path: "/documents" },
    { name: "Messages", icon: MessageSquare, path: "/messages", badge: 6 },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

  return (
    <aside className="w-64 border-r bg-card p-4">
      <h2 className="text-xl font-bold mb-6 ml-1">Feed</h2>
      <nav className="space-y-2">
        {navItems.map(({ name, icon: Icon, path, badge }) => (
          <Button
            key={name}
            variant={location.pathname === path ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => navigate(path)}
          >
            <Icon className="h-4 w-4 mr-2" />
            {name}
            {badge && <Badge className="ml-auto" variant="destructive">{badge}</Badge>}
          </Button>
        ))}
      </nav>
    </aside>
  );
}
