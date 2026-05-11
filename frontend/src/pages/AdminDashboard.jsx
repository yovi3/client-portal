"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, RefreshCw, Shield } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { useAdminData } from "./admin/useAdminData";
import { PERSONNEL_ROLES } from "./admin/utils";
import CasesTab from "./admin/CasesTab";
import UsersTab from "./admin/UsersTab";
import DocumentsTab from "./admin/DocumentsTab";
import InvitesTab from "./admin/InvitesTab";
import RecordInspector from "./admin/RecordInspector";
import { CaseInboxPanel } from "./CaseInbox";

class AdminDashboardBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || "Unknown runtime error." };
  }

  componentDidCatch(error) {
    console.error("Admin dashboard error:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <MainLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Dashboard crashed</AlertTitle>
            <AlertDescription>{this.state.errorMessage}</AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }
}

function AdminDashboardWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    isLoading,
    tabLoading,
    actionKey,
    notice,
    setNotice,
    cases,
    setCases,
    users,
    setUsers,
    supportedRoles,
    rolePermissions,
    setRolePermissions,
    documents,
    setDocuments,
    invites,
    setInvites,
    inviteAccessDenied,
    canAccess,
    canManageRoles,
    withAction,
    loadAdminData,
    userAssignmentCounts,
    rolePermissionMap,
    permissionColumns,
  } = useAdminData();

  const [activeDataset, setActiveDataset] = useState("cases");
  const [isRecordDrawerOpen, setIsRecordDrawerOpen] = useState(false);
  const [focusedIdByDataset, setFocusedIdByDataset] = useState({});
  const [selectedIdsByDataset, setSelectedIdsByDataset] = useState({});

  // Sync tab from URL (driven by Sidebar)
  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get("tab");
    if (!requestedTab) return;
    const valid = ["cases", "users", "documents", "invites", "inbox"];
    if (valid.includes(requestedTab) && requestedTab !== activeDataset) {
      setActiveDataset(requestedTab);
    }
  }, [activeDataset, location.search]);

  // Selection helpers
  const selectedIds = useMemo(
    () => selectedIdsByDataset[activeDataset] || [],
    [activeDataset, selectedIdsByDataset]
  );

  const focusedId = focusedIdByDataset[activeDataset] || null;

  const onToggleSelection = useCallback((rowId) => {
    setSelectedIdsByDataset((prev) => {
      const dataset = activeDataset;
      const existing = new Set(prev[dataset] || []);
      if (existing.has(rowId)) existing.delete(rowId);
      else existing.add(rowId);
      return { ...prev, [dataset]: [...existing] };
    });
  }, [activeDataset]);

  const onToggleSelectAll = useCallback((ids) => {
    setSelectedIdsByDataset((prev) => {
      const existing = new Set(prev[activeDataset] || []);
      const shouldClear = ids.every((id) => existing.has(id));
      return { ...prev, [activeDataset]: shouldClear ? [] : ids };
    });
  }, [activeDataset]);

  const onClearSelection = useCallback(() => {
    setSelectedIdsByDataset((prev) => ({ ...prev, [activeDataset]: [] }));
  }, [activeDataset]);

  const onFocusRecord = useCallback((rowId) => {
    setFocusedIdByDataset((prev) => ({ ...prev, [activeDataset]: rowId }));
    setIsRecordDrawerOpen(true);
  }, [activeDataset]);

  // Resolve focused record for the inspector
  const selectedRecord = useMemo(() => {
    if (!focusedId) return null;
    if (activeDataset === "cases") return cases.find((r) => r.id === focusedId) || null;
    if (activeDataset === "users") return users.find((r) => r.id === focusedId) || null;
    if (activeDataset === "documents") return documents.find((r) => r.id === focusedId) || null;
    if (activeDataset === "invites") return invites.find((r) => r.id === focusedId) || null;
    return null;
  }, [activeDataset, cases, documents, focusedId, invites, users]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8 text-center text-sm text-muted-foreground">Authenticating...</div>
      </MainLayout>
    );
  }

  if (!canAccess) {
    return (
      <MainLayout>
        <Alert className="m-6">
          <Shield className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>This area is only available for personnel roles.</AlertDescription>
        </Alert>
      </MainLayout>
    );
  }

  // Render the active tab content based on URL ?tab= param
  const renderContent = () => {
    switch (activeDataset) {
      case "users":
        if (!canManageRoles) return null;
        return (
          <UsersTab
            user={user}
            users={users}
            setUsers={setUsers}
            cases={cases}
            supportedRoles={supportedRoles}
            userAssignmentCounts={userAssignmentCounts}
            rolePermissions={rolePermissions}
            setRolePermissions={setRolePermissions}
            rolePermissionMap={rolePermissionMap}
            permissionColumns={permissionColumns}
            invites={invites}
            setInvites={setInvites}
            inviteAccessDenied={inviteAccessDenied}
            withAction={withAction}
            actionKey={actionKey}
            isTabLoading={tabLoading.users}
            focusedId={focusedId}
            onFocusRecord={onFocusRecord}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={onClearSelection}
            setNotice={setNotice}
          />
        );
      case "documents":
        if (!canManageRoles) return null;
        return (
          <DocumentsTab
            documents={documents}
            setDocuments={setDocuments}
            withAction={withAction}
            actionKey={actionKey}
            isTabLoading={tabLoading.documents}
            focusedId={focusedId}
            onFocusRecord={onFocusRecord}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={onClearSelection}
          />
        );
      case "invites":
        return (
          <InvitesTab
            invites={invites}
            setInvites={setInvites}
            inviteAccessDenied={inviteAccessDenied}
            supportedRoles={supportedRoles}
            withAction={withAction}
            actionKey={actionKey}
            isTabLoading={tabLoading.invites}
            focusedId={focusedId}
            onFocusRecord={onFocusRecord}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={onClearSelection}
            setNotice={setNotice}
          />
        );
      case "inbox":
        return <CaseInboxPanel />;
      case "cases":
      default:
        return (
          <CasesTab
            cases={cases}
            setCases={setCases}
            withAction={withAction}
            actionKey={actionKey}
            isTabLoading={tabLoading.cases}
            focusedId={focusedId}
            onFocusRecord={onFocusRecord}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={onClearSelection}
          />
        );
    }
  };

  return (
    <MainLayout>
      <div className="space-y-5 p-6">

        {/* Notice banner */}
        {notice && (
          <Alert
            variant={notice.type === "error" ? "destructive" : "default"}
            className={cn(
              "border shadow-sm",
              notice.type !== "error" && "border-emerald-200 bg-emerald-50/80 text-emerald-900 [&_svg]:text-emerald-600"
            )}
          >
            {notice.type === "error"
              ? <AlertCircle className="h-4 w-4" />
              : <CheckCircle2 className="h-4 w-4" />
            }
            <AlertTitle className="font-semibold">{notice.title}</AlertTitle>
            <AlertDescription>
              {notice.text}
              {notice.status && <span className="ml-2 text-xs opacity-60">HTTP {notice.status}</span>}
              <button
                type="button"
                className="ml-3 text-xs underline opacity-50 hover:opacity-100 cursor-pointer transition-opacity duration-150"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-foreground">Admin Dashboard</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{user.email} · <span className="text-primary font-medium">{user.role}</span></p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAdminData} disabled={isLoading} className="cursor-pointer">
            <RefreshCw className={cn("mr-1.5 h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Active tab content */}
        {renderContent()}
      </div>

      {/* Record detail drawer */}
      <Sheet open={isRecordDrawerOpen} onOpenChange={setIsRecordDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="pb-4">
            <SheetTitle>
              {selectedRecord
                ? activeDataset === "cases"
                  ? selectedRecord.title || "Untitled case"
                  : activeDataset === "users"
                    ? selectedRecord.name || selectedRecord.email
                    : activeDataset === "documents"
                      ? selectedRecord.name
                      : activeDataset === "invites"
                        ? selectedRecord.invited_email
                        : "Record"
                : "Record details"
              }
            </SheetTitle>
            <SheetDescription>
              {activeDataset.charAt(0).toUpperCase() + activeDataset.slice(1)} details and actions
            </SheetDescription>
          </SheetHeader>
          <div className="px-1">
            <RecordInspector
              activeDataset={activeDataset}
              selectedRecord={selectedRecord}
              user={user}
              supportedRoles={supportedRoles}
              userAssignmentCounts={userAssignmentCounts}
              rolePermissionMap={rolePermissionMap}
              permissionColumns={permissionColumns}
              actionKey={actionKey}
              withAction={withAction}
              setUsers={setUsers}
              setDocuments={setDocuments}
              setCases={setCases}
              setRolePermissions={setRolePermissions}
              setNotice={setNotice}
              inviteLinks={{}}
            />
          </div>
        </SheetContent>
      </Sheet>
    </MainLayout>
  );
}

export default function AdminDashboard() {
  return (
    <AdminDashboardBoundary>
      <AdminDashboardWorkspace />
    </AdminDashboardBoundary>
  );
}
