"use client";

import React from "react";
import { Routes, Route } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import Dashboard from "@/pages/Dashboard";
import Cases from "@/pages/Cases";
import Contacts from "@/pages/Contacts";
import Documents from "@/pages/Documents";
import Messages from "@/pages/Messages";
import AzureCallback from './pages/AzureCallback'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/cases" element={<Cases />} />
      <Route path="/contacts" element={<Contacts />} />
      <Route path="/documents" element={<Documents />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/auth/callback" element={<AzureCallback />} />
    </Routes>
  );
}
