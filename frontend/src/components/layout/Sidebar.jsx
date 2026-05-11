import React from "react";
import { Home, Briefcase, Users, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "@/lib/UserContext";
import { usePolling } from "@/lib/PollingContext";
import { PERSONNEL_ROLES } from "@/pages/admin/utils";

export default function Sidebar({ onNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();

  const { user } = useUser();
  const { unreadCount } = usePolling();

  const workspaceItems = [
    { name: "Overview", icon: Home, path: "/dashboard", roles: [...PERSONNEL_ROLES, "client"] },
    { name: "Messages", icon: MessageSquare, path: "/messages", roles: [...PERSONNEL_ROLES, "client"] },
    { name: "Cases", icon: Briefcase, path: "/cases", roles: [...PERSONNEL_ROLES, "client"] },
    { name: "Clients", icon: Users, path: "/clients", roles: PERSONNEL_ROLES },
    { name: "Documents", icon: FileText, path: "/documents", roles: [...PERSONNEL_ROLES, "client"] },
  ];

  const adminItems = [
    { name: "Cases", icon: Briefcase, tab: "cases", roles: PERSONNEL_ROLES },
    { name: "Users", icon: Users, tab: "users", roles: ["admin"] },
    { name: "Documents", icon: FileText, tab: "documents", roles: ["admin"] },
  ];

  const role = user?.role;
  const visibleWorkspace = workspaceItems.filter((i) => !role || i.roles.includes(role));
  const visibleAdmin = adminItems.filter((i) => !role || i.roles.includes(role));
  const dashboardTab = new URLSearchParams(location.search).get("tab") || "cases";

  const isActivePath = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");
  const isActiveTab = (tab) =>
    location.pathname === "/admin-dashboard" && dashboardTab === tab;

  return (
    <aside className="w-64 border-r bg-card p-4">
      <h2 className="text-xl font-bold mb-6 ml-1 text-foreground">Menu</h2>
      <nav className="space-y-6">
        <div>
          <div className="mb-2 ml-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </div>
          <div className="space-y-2">
            {visibleWorkspace.map(({ name, icon, path }) => (
              <Button
                key={name}
                variant={isActivePath(path) ? "secondary" : "ghost"}
                className="w-full justify-start cursor-pointer"
                onClick={() => { navigate(path); onNavigate?.(); }}
              >
                {React.createElement(icon, { className: "h-4 w-4 mr-2" })}
                {name}
                {name === "Messages" && unreadCount > 0 && (
                  <Badge className="ml-auto" variant="destructive">{unreadCount}</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {visibleAdmin.length > 0 && (
          <div>
            <div className="mb-2 ml-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Admin
            </div>
            <div className="space-y-2">
              {visibleAdmin.map(({ name, icon, tab }) => (
                <Button
                  key={tab}
                  variant={isActiveTab(tab) ? "secondary" : "ghost"}
                  className="w-full justify-start cursor-pointer"
                  onClick={() => { navigate(`/admin-dashboard?tab=${tab}`); onNavigate?.(); }}
                >
                  {React.createElement(icon, { className: "h-4 w-4 mr-2" })}
                  {name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
