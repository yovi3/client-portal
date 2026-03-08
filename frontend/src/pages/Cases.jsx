"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MainLayout from "../components/layout/MainLayout"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../components/ui/select"
import { motion } from "framer-motion"
import { Plus } from "lucide-react"
import { Button } from "../components/ui/button"
import { apiFetch } from "@/lib/api"
import { getStoredUser, fetchCurrentUser } from "@/lib/auth"

export default function Cases() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [activeTab, setActiveTab] = useState("all")
  const [urgencyFilter, setUrgencyFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [user, setUser] = useState(null) // Added user state for context

  // --- 1. Load User from Local Storage ---
  useEffect(() => {
    const loggedInUser = getStoredUser();
    if (loggedInUser) {
      setUser(loggedInUser);
      return;
    }
    fetchCurrentUser().then((u) => {
      if (u) setUser(u);
      else navigate("/login");
    });
  }, [navigate]);

  // --- 2. Fetch Cases (Modified to use API) ---
  useEffect(() => {
    if (!user) return;

    const fetchCases = async () => {
      try {
        const res = await apiFetch("/cases");
        if (!res.ok) throw new Error("Failed to fetch cases from API.");
        
        const data = await res.json();
        setCases(data || []);
      } catch (error) {
        console.error("Error fetching cases:", error);
        // Fallback to mock data structure if API fails
        setCases(mockCaseData);
      }
    };

    fetchCases();
  }, [user, navigate]);

  // --- 3. Filtering Logic ---
  const applyFilters = (caseList) => {
    return caseList.filter((c) => {
      // NOTE: c.priority is used here to match the current DB model
      if (urgencyFilter !== "all" && c.priority !== urgencyFilter) return false
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false
      return true
    })
  }
  
  // The 'My Cases' tab logic must be adjusted for M2M structure:
  const myCasesRaw = cases.filter((c) => {
    if (!user) return false;
    // Check if the user is in the personnel list (for lawyers/staff)
    const isPersonnel = c.personnel?.some(p => p.id === user.id);
    // Check if the user is in the clients list (for clients)
    const isClient = c.clients?.some(cl => cl.id === user.id);
    
    return isPersonnel || isClient;
  });


  const myCasesFiltered = applyFilters(myCasesRaw)
  const allCasesFiltered = applyFilters(cases)

  const handleCaseClick = (caseId) => {
    navigate(`/cases/${caseId}`)
  }

  return (
    <MainLayout>
      <motion.div className="p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <h1 className="text-3xl font-bold">Cases</h1>

          {/* <div className="flex gap-2">
            <Select onValueChange={setUrgencyFilter} value={urgencyFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={setCategoryFilter} value={categoryFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Property">Property</SelectItem>
                <SelectItem value="Criminal">Criminal</SelectItem>
                <SelectItem value="Corporate">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </div> */}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="all">All Cases</TabsTrigger>
              <TabsTrigger value="my">My Cases</TabsTrigger>
            </TabsList>

            {user && user.role !== "client" && (
              <Button onClick={() => (window.location.href = "/createcase")} size="default" className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                New Case
              </Button>
            )}
          </div>


          <TabsContent value="my">
            {myCasesFiltered.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {myCasesFiltered.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleCaseClick(c.id)}
                    >
                      <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                          <span>{c.title}</span>
                          {/* Use unread_count from the API structure */}
                          {c.unread_count > 0 && <Badge variant="destructive">New ({c.unread_count})</Badge>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-1">Case Number: {c.case_number ?? "N/A"}</p>
                        <p className="text-sm text-muted-foreground mb-1">Category: {c.category || "—"}</p>
                        <p className="text-sm text-muted-foreground mb-1">
                          Urgency: {c.priority ? c.priority.toUpperCase() : "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Clients: {(c.clients && c.clients.map((cl) => cl.name).join(", ")) || "N/A"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {/* Display first assigned personnel role and name */}
                          Assigned:{" "}
                          {c.personnel && c.personnel[0] ? `${c.personnel[0].role} (${c.personnel[0].name})` : "N/A"}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm mt-4">No cases match your filters.</p>
            )}
          </TabsContent>

          <TabsContent value="all">
            {allCasesFiltered.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {allCasesFiltered.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleCaseClick(c.id)}
                    >
                      <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                          <span>{c.title}</span>
                          {/* Use unread_count from the API structure */}
                          {c.unread_count > 0 && <Badge variant="destructive">New ({c.unread_count})</Badge>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-1">Case Number: {c.case_number ?? "N/A"}</p>
                        {/* <p className="text-sm text-muted-foreground mb-1">Category: {c.category || "—"}</p>
                        <p className="text-sm text-muted-foreground mb-1">
                          Urgency: {c.priority ? c.priority.toUpperCase() : "—"}
                        </p> */}
                        <p className="text-sm text-muted-foreground">
                          Clients: {(c.clients && c.clients.map((cl) => cl.name).join(", ")) || "N/A"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Assigned:{" "}
                          {c.personnel && c.personnel[0] ? `${c.personnel[0].role} (${c.personnel[0].name})` : "N/A"}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm mt-4">No cases match your filters.</p>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </MainLayout>
  )
}
