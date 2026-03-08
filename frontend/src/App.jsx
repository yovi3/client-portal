"use client";

import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import Dashboard from "@/pages/Dashboard";
import Cases from "@/pages/Cases";
import Contacts from "@/pages/Contacts";
import Documents from "@/pages/Documents";
import Messages from "@/pages/Messages";
import CaseInbox from "@/pages/CaseInbox";
import AzureCallback from './pages/AzureCallback'
import SmsLandingPage from './pages/SmsLandingPage'
import CaseDetail from '@/pages/CaseDetail'
import CreateCase from '@/pages/CreateCase'
import AdminDashboard from "@/pages/AdminDashboard";
import { RequireAuth, RequireRole } from "@/components/auth/RouteGuards";

export default function App() {
  const personnelRoles = ["lawyer", "accountant", "paralegal", "legal assistant", "admin"];

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/cases" element={<RequireAuth><Cases /></RequireAuth>} />
      <Route path="/contacts" element={<RequireRole allowedRoles={personnelRoles}><Contacts /></RequireRole>} />
      <Route path="/documents" element={<RequireAuth><Documents /></RequireAuth>} />
      <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
      <Route path="/case-inbox" element={<RequireRole allowedRoles={personnelRoles}><CaseInbox /></RequireRole>} />
      <Route path="/auth/callback" element={<AzureCallback />} />
      <Route path="/requests/:token" element={<SmsLandingPage />} />
      <Route path="/cases/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
      <Route path="/createcase" element={<RequireRole allowedRoles={personnelRoles}><CreateCase /></RequireRole>} />
      <Route path="/admin-dashboard" element={<RequireRole allowedRoles={personnelRoles}><AdminDashboard /></RequireRole>} />
    </Routes>
  );
}
