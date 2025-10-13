import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Scale,
  FileText,
  MessageSquare,
  LogOut,
  User,
  Bell,
  Plus,
  Users,
  Briefcase,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userFullName, setUserFullName] = useState("");
  const [isNewCaseDialogOpen, setIsNewCaseDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("user")) || {};
    setUserFullName(userData.fullName || "User");
    fetchDashboardData();
    fetchNotifications();
  }, []);

  async function fetchDashboardData() {
    try {
      const token = localStorage.getItem("token");
      const baseURL = "YOUR_BACKEND_URL/api/lawyer";

      const [casesRes, clientsRes, docsRes] = await Promise.all([
        fetch(`${baseURL}/cases`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${baseURL}/clients`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${baseURL}/documents`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (casesRes.ok) setCases(await casesRes.json());
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (docsRes.ok) setDocuments(await docsRes.json());
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchNotifications() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("YOUR_BACKEND_URL/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNotifications(await res.json());
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    navigate("/login");
  }

  async function handleCreateCase(e) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch("YOUR_BACKEND_URL/api/lawyer/cases", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          description: formData.get("description"),
          clientId: formData.get("clientId"),
          priority: formData.get("priority"),
        }),
      });

      if (res.ok) {
        setIsNewCaseDialogOpen(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error("Error creating case:", err);
    }
  }

  async function handleUploadDocument(e) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch("YOUR_BACKEND_URL/api/lawyer/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setIsUploadDialogOpen(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error("Error uploading document:", err);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold">Client Portal</span>
            <Badge variant="outline" className="ml-2">
              {userFullName}
            </Badge>
          </div>

          <div className="flex items-center gap-4 relative">
            {/* Notifications */}
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setIsNotifOpen(!isNotifOpen)}>
                <Bell className="h-5 w-5" />
              </Button>
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border rounded-md shadow-lg p-2 z-50">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No new notifications</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="border-b py-2 last:border-b-0">
                        <p className="text-sm">{n.message}</p>
                        <p className="text-xs text-gray-400">{new Date(n.date).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* User Settings */}
            <Dialog open={isUserSettingsOpen} onOpenChange={setIsUserSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>User Settings</DialogTitle>
                  <DialogDescription>Update your profile settings</DialogDescription>
                </DialogHeader>
                {/* <form className="space-y-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input value={userFullName} onChange={(e) => setUserFullName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={localStorage.getItem("userEmail") || ""} disabled />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={() => {
                        const user = JSON.parse(localStorage.getItem("user"));
                        localStorage.setItem("user", JSON.stringify({ ...user, fullName: userFullName }));
                        setIsUserSettingsOpen(false);
                      }}
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </form> */}
              </DialogContent>
            </Dialog>

            {/* Logout */}
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      {/* <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Lawyer Dashboard</h1>
            <p className="text-muted-foreground">Manage your clients, cases, and documents</p>
          </div>
          <div className="flex items-center gap-2">
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <p className="text-muted-foreground">Overview section</p>
          </TabsContent>

          <TabsContent value="cases">
            <p className="text-muted-foreground">Cases section</p>
          </TabsContent>

          <TabsContent value="clients">
            <p className="text-muted-foreground">Clients section</p>
          </TabsContent>

          <TabsContent value="documents">
            <p className="text-muted-foreground">Documents section</p>
          </TabsContent>
        </Tabs>
      </main> */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Lawyer Dashboard</h1>
            <p className="text-muted-foreground">Manage your clients, cases, and documents</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isNewCaseDialogOpen} onOpenChange={setIsNewCaseDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Case
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Case</DialogTitle>
                  <DialogDescription>Add a new case for a client</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateCase}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Case Title</Label>
                      <Input id="title" name="title" placeholder="Enter case title" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" name="description" placeholder="Enter case description" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientId">Client</Label>
                      <Select name="clientId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select name="priority" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Create Case</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Document</DialogTitle>
                  <DialogDescription>Upload a document for a case</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUploadDocument}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="caseId">Case</Label>
                      <Select name="caseId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a case" />
                        </SelectTrigger>
                        <SelectContent>
                          {cases.map((caseItem) => (
                            <SelectItem key={caseItem.id} value={caseItem.id}>
                              {caseItem.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="file">File</Label>
                      <Input id="file" name="file" type="file" required />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Upload</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{cases.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {cases.filter((c) => c.status === "active").length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{clients.length}</div>
                  <p className="text-xs text-muted-foreground">Active clients</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Documents</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{documents.length}</div>
                  <p className="text-xs text-muted-foreground">Total documents</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{cases.filter((c) => c.priority === "high").length}</div>
                  <p className="text-xs text-muted-foreground">Urgent cases</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Cases */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Cases</CardTitle>
                <CardDescription>Your most recent case updates</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading cases...</p>
                ) : cases.length === 0 ? (
                  <p className="text-muted-foreground">No cases found</p>
                ) : (
                  <div className="space-y-4">
                    {cases.slice(0, 5).map((caseItem) => (
                      <div
                        key={caseItem.id}
                        className="flex items-start justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{caseItem.title}</h3>
                            <Badge variant="outline" className={getStatusColor(caseItem.status)}>
                              {caseItem.status}
                            </Badge>
                            <Badge variant="outline" className={getPriorityColor(caseItem.priority)}>
                              {caseItem.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{caseItem.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Client: {caseItem.client}</span>
                            <span>Updated: {caseItem.lastUpdate}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          Manage
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cases Tab */}
          <TabsContent value="cases" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Cases</CardTitle>
                <CardDescription>Manage all your legal cases</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading cases...</p>
                ) : cases.length === 0 ? (
                  <p className="text-muted-foreground">No cases found</p>
                ) : (
                  <div className="space-y-4">
                    {cases.map((caseItem) => (
                      <div
                        key={caseItem.id}
                        className="flex items-start justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{caseItem.title}</h3>
                            <Badge variant="outline" className={getStatusColor(caseItem.status)}>
                              {caseItem.status}
                            </Badge>
                            <Badge variant="outline" className={getPriorityColor(caseItem.priority)}>
                              {caseItem.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{caseItem.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Client: {caseItem.client}</span>
                            <span>Updated: {caseItem.lastUpdate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Clients</CardTitle>
                <CardDescription>Manage your client relationships</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading clients...</p>
                ) : clients.length === 0 ? (
                  <p className="text-muted-foreground">No clients found</p>
                ) : (
                  <div className="space-y-4">
                    {clients.map((client) => (
                      <div
                        key={client.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{client.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{client.email}</span>
                              <span>{client.phone}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              <span>{client.activeCases} active cases</span>
                              <span>Joined {client.joinedDate}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            View Profile
                          </Button>
                          <Button variant="ghost" size="sm">
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Documents</CardTitle>
                <CardDescription>Manage case documents</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading documents...</p>
                ) : documents.length === 0 ? (
                  <p className="text-muted-foreground">No documents found</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((document) => (
                      <div
                        key={document.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <FileText className="h-8 w-8 text-primary" />
                          <div>
                            <h3 className="font-semibold">{document.name}</h3>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{document.type}</span>
                              <span>{document.size}</span>
                              <span>Case ID: {document.caseId}</span>
                              <span>{document.uploadedAt}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                          <Button variant="ghost" size="sm">
                            Download
                          </Button>
                          <Button variant="ghost" size="sm">
                            Share
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
