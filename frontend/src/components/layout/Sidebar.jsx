import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Briefcase,
  FileText,
  Filter,
  Inbox,
  LogOut,
  MessagesSquare,
  PenSquare,
  Settings,
  ShieldCheck,
} from "lucide-react";
import NewTextDialog from "@/components/conversation/NewTextDialog";
import { useAppSettings } from "@/lib/appSettings";
import { useUser } from "@/lib/UserContext";
import { usePolling } from "@/lib/PollingContext";
import { apiFetch } from "@/lib/api";
import { PERSONNEL_ROLES } from "@/pages/admin/utils";

// Staff navigation. Every conversation is with a phone number and belongs to a
// LeadBase lead or a LawBase case; texts that belong to neither wait in
// "Needs assigning". Team chat is internal and never texted, so it sits apart.
// During the intake-team rollout cases are hidden (CASES_ENABLED off), and with
// them Cases and Document requests (which are case-based until task 1.7).
const STAFF_NAV = [
  { key: "assign", name: "Needs assigning", icon: Inbox, to: "/needs-assigning" },
  { key: "leads", name: "Leads", icon: Filter, to: "/leads" },
  { key: "cases", name: "Cases", icon: Briefcase, to: "/messages?view=cases" },
];
const STAFF_NAV_INTERNAL = [
  { key: "team", name: "Team chat", icon: MessagesSquare, to: "/messages?view=team" },
  { key: "requests", name: "Document requests", icon: FileText, to: "/documents" },
];
const CLIENT_NAV = [
  { key: "cases", name: "Messages", icon: MessagesSquare, to: "/messages" },
  { key: "requests", name: "Documents", icon: FileText, to: "/documents" },
];

const initialsOf = (name) =>
  (name || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export default function Sidebar({ onNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUser();
  const { unreadCount } = usePolling();
  const isStaff = PERSONNEL_ROLES.includes(user?.role);
  const [needsAssigning, setNeedsAssigning] = useState(0);
  const [newTextOpen, setNewTextOpen] = useState(false);
  const { cases_enabled: casesEnabled } = useAppSettings();
  const staffNav = STAFF_NAV.filter((i) => casesEnabled || i.key !== "cases");
  const staffInternal = STAFF_NAV_INTERNAL.filter((i) => casesEnabled || i.key !== "requests");

  // How many numbers are waiting to be linked to a lead or case. Refreshed on every
  // page change, when Needs assigning links or dismisses one, and every 30 seconds.
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const refresh = () =>
      apiFetch("/conversations/counts")
        .then((res) => (res.ok ? res.json() : { unassigned: 0 }))
        .then((data) => { if (!cancelled) setNeedsAssigning(data.unassigned || 0); })
        .catch(() => {});
    refresh();
    window.addEventListener("conversations-changed", refresh);
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30_000);
    return () => { cancelled = true; window.removeEventListener("conversations-changed", refresh); clearInterval(timer); };
  }, [isStaff, location.pathname]);

  const view = new URLSearchParams(location.search).get("view") || "cases";
  const isActive = (to) => {
    const [path, query] = to.split("?");
    if (location.pathname !== path && !location.pathname.startsWith(path + "/")) return false;
    if (!query) return true;
    return new URLSearchParams(query).get("view") === view;
  };
  const counts = { assign: needsAssigning, cases: unreadCount };

  const go = (to) => { navigate(to); onNavigate?.(); };
  const handleLogout = async () => { await logout(); navigate("/login"); };

  const NavItem = ({ item }) => {
    const active = isActive(item.to);
    const count = counts[item.key] || 0;
    return (
      <button
        type="button"
        onClick={() => go(item.to)}
        aria-current={active ? "page" : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          active ? "bg-accent text-ink font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand" aria-hidden />}
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.name}</span>
        {count > 0 && (
          <span
            className={`tabular min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] font-semibold ${
              item.key === "assign" ? "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200" : "bg-primary text-primary-foreground"
            }`}
            aria-label={`${count} ${item.key === "assign" ? "waiting" : "unread"}`}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card text-foreground">
      {!isStaff && <div className="pt-4" />}
      {isStaff && (
        <div className="px-3 pb-4 pt-4">
          <button
            type="button"
            onClick={() => setNewTextOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <PenSquare className="h-4 w-4" /> New text
          </button>
          <NewTextDialog open={newTextOpen} onClose={() => { setNewTextOpen(false); onNavigate?.(); }} />
        </div>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Main">
        <div className="space-y-1">
          {(isStaff ? staffNav : CLIENT_NAV).map((item) => <NavItem key={item.key} item={item} />)}
        </div>
        {isStaff && (
          <div className="space-y-1 border-t border-border pt-4">
            <p className="px-3 pb-1 text-[0.6875rem] font-medium text-muted-foreground">Internal</p>
            {staffInternal.map((item) => <NavItem key={item.key} item={item} />)}
          </div>
        )}
      </nav>

      {/* Admin and the signed-in person live at the bottom, out of the daily path. */}
      <div className="space-y-1 border-t border-border px-3 py-3">
        {user?.role === "admin" && (
          <NavItem item={{ key: "admin", name: "Admin", icon: ShieldCheck, to: "/admin-dashboard" }} />
        )}
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bar text-xs font-semibold text-white">
            {initialsOf(user?.name)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => go("/settings")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
