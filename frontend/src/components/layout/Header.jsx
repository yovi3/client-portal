import React from "react";
import { useNavigate } from "react-router-dom";
import { Scale, Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useUser } from "@/lib/UserContext";
import { usePolling } from "@/lib/PollingContext";

export default function Header({ mobileMenuTrigger }) {
  const { user, logout } = useUser();
  const { notifications, unreadCount, refetch } = usePolling();
  
  const navigate = useNavigate();

  const hasUnread = notifications.length > 0 || unreadCount > 0;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const getInitials = (name) => {
    if (!name || typeof name !== "string") return "U";
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "m ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
  };
  
  const handleNotificationClick = (case_id) => {
    navigate(`/messages?case_id=${case_id}`);
    refetch();
  };

  if (!user) {
    return (
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold text-foreground">Injury Case Portal</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-card">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          {mobileMenuTrigger}
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <Scale className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold text-foreground">Injury Case Portal</span>
          </button>
        </div>

        <div className="mr-1 flex items-center gap-2">
          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {hasUnread && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-background bg-destructive"></span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" sideOffset={4} className="w-[calc(100vw-2rem)] sm:w-80">
              <h4 className="font-semibold mb-2 px-4">Notifications</h4>
              <div className="flex flex-col" aria-live="polite">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <Button
                      key={notif.message_id}
                      variant="ghost"
                      className="h-auto w-full justify-start p-4 border-b last:border-b-0 rounded-none"
                      onClick={() => handleNotificationClick(notif.case_id)}
                    >
                      <div className="flex flex-col items-start text-left">
                        <div className="flex justify-between w-full">
                          <span className="text-xs font-bold text-primary">
                            {notif.sender_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimeAgo(notif.timestamp)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          In: {notif.case_title}
                        </span>
                        <p className="text-sm text-foreground whitespace-normal">
                          {notif.content_snippet}
                        </p>
                      </div>
                    </Button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground p-4">
                    No new notifications
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* User menu */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold leading-none text-primary-foreground">
                  {getInitials(user.name)}
                </span>
                <span className="hidden md:inline text-sm leading-none font-medium text-foreground">
                  {user.name}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-48">
              <div className="flex flex-col space-y-2">
                <div className="border-b pb-2">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Button
                  variant="ghost"
                  className="justify-start text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
