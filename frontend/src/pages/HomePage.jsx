import React from "react";
import { Button } from "@/components/ui/button";
import { Scale } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-black" />
            <span className="text-xl font-semibold">Client Portal</span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/dashboard">
              <Button>Dashboard</Button>
            </a>
            <a href="/login">
              <Button variant="ghost">Sign In</Button>
            </a>
            <a href="/register">
              <Button>Create Account</Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-5xl font-bold mb-6 text-gray-900">
            Client Communication Portal
          </h1>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href="/register">
              <Button size="lg" className="text-lg px-8">
                Sign Up
              </Button>
            </a>
            <a href="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Sign In
              </Button>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>&copy; 2025 DSS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
