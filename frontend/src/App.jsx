import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import Cases from "@/pages/Cases";
import Clients from "@/pages/Clients";
import Documents from "@/pages/Documents";
import Messages from "@/pages/Messages";
import Leads from "@/pages/Leads";
import CaseInbox from "@/pages/CaseInbox";
import AzureCallback from './pages/AzureCallback'
import SmsLandingPage from './pages/SmsLandingPage'
import CaseDetail from '@/pages/CaseDetail'
import CreateCase from '@/pages/CreateCase'
import AdminDashboard from "@/pages/AdminDashboard";
import InviteAcceptPage from "@/pages/InviteAcceptPage";
import { Toaster } from "sonner";
import { RequireAuth, RequireRole } from "@/components/auth/RouteGuards";

export default function App() {
  const personnelRoles = ["lawyer", "accounting", "other", "case manager", "admin"];

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/cases" element={<RequireAuth><Cases /></RequireAuth>} />
        <Route path="/clients" element={<RequireRole allowedRoles={personnelRoles}><Clients /></RequireRole>} />
        <Route path="/contacts" element={<Navigate to="/clients" replace />} />
        <Route path="/documents" element={<RequireAuth><Documents /></RequireAuth>} />
        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/leads" element={<RequireRole allowedRoles={personnelRoles}><Leads /></RequireRole>} />
        <Route path="/case-inbox" element={<RequireRole allowedRoles={personnelRoles}><CaseInbox /></RequireRole>} />
        <Route path="/auth/callback" element={<AzureCallback />} />
        <Route path="/requests/:token" element={<SmsLandingPage />} />
        <Route path="/cases/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/createcase" element={<RequireRole allowedRoles={personnelRoles}><CreateCase /></RequireRole>} />
        <Route path="/admin-dashboard" element={<RequireRole allowedRoles={personnelRoles}><AdminDashboard /></RequireRole>} />
      </Routes>
      <Toaster richColors position="top-center" />
    </>
  );
}
