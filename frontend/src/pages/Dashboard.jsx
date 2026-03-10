"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/layout/MainLayout";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { getStoredUser, fetchCurrentUser } from "@/lib/auth";

const getCaseParticipantLabel = (caseItem, role) => {
  if (role === "client") {
    const staff = caseItem.personnel?.map((person) => person.name).filter(Boolean) || [];
    return staff.length ? `Team: ${staff.join(", ")}` : "Team: Not assigned";
  }
  const clients = caseItem.clients?.map((client) => client.name).filter(Boolean) || [];
  return clients.length ? `Client: ${clients.join(", ")}` : "Client: Not assigned";
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [pendingByCase, setPendingByCase] = useState({});

  useEffect(() => {
    if (user) return;
    fetchCurrentUser().then((currentUser) => {
      if (currentUser) setUser(currentUser);
      else navigate("/login");
    });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchCases = async () => {
      setIsLoading(true);
      setDataError(null);
      try {
        const res = await apiFetch("/cases");
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: "Failed to fetch cases." }));
          throw new Error(errorData.detail || `HTTP error ${res.status}`);
        }
        const data = await res.json();
        const caseList = Array.isArray(data) ? data : [];
        setCases(caseList);

        if (user.role === "client") {
          const requestEntries = await Promise.all(
            caseList.map(async (caseItem) => {
              try {
                const requestsRes = await apiFetch(`/cases/${caseItem.id}/requests`);
                if (!requestsRes.ok) return [caseItem.id, { pending: 0, nextDeadline: null }];
                const requests = await requestsRes.json();
                const pending = (requests || []).filter((request) => request.status !== "completed").length;
                const nextDeadline = (requests || [])
                  .filter((request) => request.deadline)
                  .map((request) => new Date(request.deadline))
                  .sort((left, right) => left.getTime() - right.getTime())[0] || null;
                return [caseItem.id, { pending, nextDeadline }];
              } catch {
                return [caseItem.id, { pending: 0, nextDeadline: null }];
              }
            })
          );
          setPendingByCase(Object.fromEntries(requestEntries));
        }
      } catch (err) {
        console.error("Case fetch error:", err);
        setDataError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCases();
  }, [user]);

  const unreadTotal = useMemo(
    () => cases.reduce((sum, caseItem) => sum + (caseItem.unread_count || 0), 0),
    [cases]
  );
  const pendingTasks = useMemo(
    () => Object.values(pendingByCase).reduce((sum, value) => sum + (value.pending || 0), 0),
    [pendingByCase]
  );

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8 text-center text-gray-500">Authenticating...</div>
      </MainLayout>
    );
  }

  const visibleCases = cases.filter((caseItem) => {
    if (!unreadOnly) return true;
    return (caseItem.unread_count || 0) > 0;
  });

  if (user.role === "client") {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Client Overview</h1>
            <p className="text-muted-foreground">Track your injury cases, deadlines, and secure messages.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Active Cases</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-semibold">{cases.length}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Unread Messages</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-semibold">{unreadTotal}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Pending Document Tasks</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-semibold">{pendingTasks}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Your Cases</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <div className="text-center text-gray-500">Loading cases...</div>}
              {dataError && <div className="text-red-500">Error: {dataError}</div>}
              {!isLoading && !dataError && cases.length === 0 && (
                <div className="text-center text-gray-500">No cases assigned yet.</div>
              )}
              {cases.map((caseItem) => (
                <button
                  key={caseItem.id}
                  type="button"
                  onClick={() => navigate(`/cases/${caseItem.id}`)}
                  className="w-full rounded-lg border p-4 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{caseItem.title}</p>
                    <div className="flex items-center gap-2">
                      {(caseItem.unread_count || 0) > 0 && <Badge variant="destructive">{caseItem.unread_count} new</Badge>}
                      {(pendingByCase[caseItem.id]?.pending || 0) > 0 && (
                        <Badge variant="secondary">{pendingByCase[caseItem.id].pending} pending documents</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{caseItem.description || "No details available."}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={unreadOnly ? "default" : "outline"} onClick={() => setUnreadOnly(!unreadOnly)}>
          Unread Only
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Cases</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="text-center text-gray-500">Loading cases...</div>}
          {dataError && <div className="text-red-500">Error: {dataError}</div>}
          {!isLoading && !dataError && visibleCases.length === 0 && (
            <div className="text-center text-gray-500">No unread case updates.</div>
          )}

          <div className="space-y-3">
            {visibleCases.map((caseItem) => (
              <div
                key={caseItem.id}
                onClick={() => navigate(`/cases/${caseItem.id}`)}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex-1">
                  <h3 className="font-semibold">{caseItem.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{caseItem.description || "No details available."}</p>
                  <span className="text-xs text-muted-foreground">{getCaseParticipantLabel(caseItem, user.role)}</span>
                </div>
                {(caseItem.unread_count || 0) > 0 && (
                  <Badge variant="destructive" className="h-6 w-6 rounded-full flex items-center justify-center p-0">
                    {caseItem.unread_count}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
