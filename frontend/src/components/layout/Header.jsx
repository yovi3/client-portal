import React from "react";
import { useNavigate } from "react-router-dom";
import { Scale, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useUser } from "@/lib/UserContext";
import { usePolling } from "@/lib/PollingContext";

export default function Header({ mobileMenuTrigger }) {
  const { user } = useUser();
  const { notifications, unreadCount, refetch } = usePolling();
  
  const navigate = useNavigate();

  const hasUnread = notifications.length > 0 || unreadCount > 0;

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
            <span className="text-lg font-semibold text-ink">DSS Connect</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="z-40 shrink-0 border-b border-white/10 bg-bar text-white">
      <div className="flex h-14 items-center justify-between gap-4 px-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {mobileMenuTrigger}
          {/* Firm mark: the app name first, the firm beside it when there's room */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-[0.6875rem] font-bold tracking-wide">DSS</span>
          <span className="text-[0.9375rem] font-semibold">Connect</span>
          <span className="hidden h-5 w-px bg-white/20 sm:block" aria-hidden />
          <span className="hidden truncate text-sm text-white/70 sm:block">Davis, Saperstein &amp; Salomon</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {hasUnread && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-bar bg-destructive"></span>
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

        </div>
      </div>
    </header>
  );
}
