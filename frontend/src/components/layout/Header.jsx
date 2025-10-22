"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; // <-- Import for navigation
import { Scale, Bell, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export default function Header() {
  // --- ADDED: State and Navigation ---
  const [user, setUser] = useState(() => {
    // Get user from localStorage on client-side
    if (typeof window !== "undefined") {
      const storedUserData = localStorage.getItem("user");
      return storedUserData ? JSON.parse(storedUserData) : null;
    }
    return null;
  });
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear user from localStorage
    localStorage.removeItem("user");
    // Clear user from state
    setUser(null);
    // Redirect to login page
    navigate("/login");
  };
  // --- END ADDED ---

  // Show a minimal header or loading state if no user is logged in
  if (!user) {
    return (
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold">Client Portal</span>
          </div>
        </div>
      </header>
    );
  }

  // Full header for logged-in user
  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" />
          <span className="text-xl font-semibold">Client Portal</span>
          {/* --- UPDATED: Dynamic User Name --- */}
          <Badge variant="outline" className="ml-2">
            {user.name}
          </Badge>
          {/* --- END UPDATED --- */}
        </div>

        <div className="flex items-center gap-4 mr-6">
          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {/* Example notification dot, you can wire this up later */}
                <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" sideOffset={4} className="w-64">
              <h4 className="font-semibold mb-2">Notifications</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>No new notifications</p>
              </div>
            </PopoverContent>
          </Popover>

          {/* User menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-48">
              <div className="flex flex-col space-y-2">
                <div className="border-b pb-2">
                  {/* --- UPDATED: Dynamic User Info --- */}
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  {/* --- END UPDATED --- */}
                </div>
                <Button variant="ghost" className="justify-start">Profile</Button>
                {/* --- UPDATED: Logout Button --- */}
                <Button
                  variant="ghost"
                  className="justify-start text-red-600"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
                {/* --- END UPDATED --- */}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}