import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, UserPlus, Plus, FileText, Download, Loader2, X, MessageSquare, Search, User, Send } from "lucide-react"
import MainLayout from "../components/layout/MainLayout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { motion } from "framer-motion"
import { API_BASE_URL, CLIENT_BASE_URL, getWsBaseUrl, apiFetch } from "@/lib/api"
import { getStoredUser, fetchCurrentUser } from "@/lib/auth"


export default function CaseDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  // --- Main Data States ---
  const [caseData, setCaseData] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [clients, setClients] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Modal & Search States ---
  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);

  const [personnelSearch, setPersonnelSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientRoleToAssign, setClientRoleToAssign] = useState("client");

  const [searchResultsPersonnel, setSearchResultsPersonnel] = useState([]);
  const [searchResultsClients, setSearchResultsClients] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // --- Chat States ---
  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef(null);
  const ws = useRef(null);

  // --- 1. Load User ---
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setCurrentUser(stored);
      return;
    }
    fetchCurrentUser().then((u) => setCurrentUser(u));
  }, []);

  // --- 2. Fetch Case Details (Main Data) ---
  const fetchCaseDetails = useCallback(async () => {
    try {
      const caseRes = await apiFetch(`/cases/${id}`);
      if (!caseRes.ok) throw new Error("Case not found");

      const data = await caseRes.json();
      
      setCaseData(data || {});
      setPersonnel(data?.personnel || []);
      setClients(data?.clients || []);

      setDocuments([]);
    } catch (error) {
      console.error(error);
      setCaseData(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchCaseDetails();
  }, [id, fetchCaseDetails]);

  // --- 2b. Fetch documents for case ---
  useEffect(() => {
    if (!id) return;
    const fetchDocuments = async () => {
      try {
        const res = await apiFetch(`/cases/${id}/requests`);
        if (!res.ok) return;
        const requests = await res.json();
        const docs =
          requests
            ?.flatMap(req =>
              req?.requested_documents?.filter(doc => doc.status === "uploaded" || doc.status === "reviewed") || []
            ) || [];
        setDocuments(docs);
      } catch (e) {
        console.error("Failed to load documents", e);
      }
    };
    fetchDocuments();
  }, [id]);
  
  
  // --- 3. Chat Logic (Fetch & WebSocket) ---
  
  // Fetch History
  useEffect(() => {
    if (!id) return;
    const fetchMessages = async () => {
      try {
        const res = await apiFetch(`/cases/${id}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (e) {
        console.error("Failed to load messages", e);
      }
    };
    fetchMessages();
  }, [id]);

  // WebSocket Connection
  useEffect(() => {
    if (!id || !currentUser) return;
    
    // Construct WS URL
    const wsUrl = `${getWsBaseUrl()}/ws/${id}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
       console.log("Connected to Chat WS");
    };

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch (e) {
        console.error("WS Message Parse Error", e);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [id, currentUser]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !ws.current || !currentUser) return;
    
    const payload = {
      content: messageInput,
      sender_id: currentUser.id
    };
    
    ws.current.send(JSON.stringify(payload));
    setMessageInput("");
  };

  const getSenderName = (senderId) => {
      if (currentUser && senderId === currentUser.id) return "You";
      
      const person = personnel.find(p => p.id === senderId);
      if (person) return person.name;
      
      const client = clients.find(c => c.id === senderId);
      if (client) return client.name;
      
      return "Unknown";
  };


  // --- 4. Search Handlers (Personnel & Clients) ---
  
  // Search Personnel Effect
  useEffect(() => {
    const searchPersonnel = async () => {
      if (!addPersonnelOpen) return;
      setIsSearching(true);
      try {
        const res = await apiFetch(`/available-personnel?search=${personnelSearch}`);
        if (res.ok) {
          const data = await res.json();
          const filtered = data.filter(u => !personnel.some(p => p.id === u.id));
          setSearchResultsPersonnel(filtered);
        }
      } catch (error) {
        console.error("Search error", error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchPersonnel, 300);
    return () => clearTimeout(timeoutId);
  }, [personnelSearch, addPersonnelOpen, personnel]);

  // Search Clients Effect
  useEffect(() => {
    const searchClients = async () => {
      if (!addClientOpen) return;
      setIsSearching(true);
      try {
        const res = await apiFetch(`/available-clients?search=${clientSearch}`);
        if (res.ok) {
          const data = await res.json();
          const filtered = data.filter(u => !clients.some(c => c.id === u.id));
          setSearchResultsClients(filtered);
        }
      } catch (error) {
        console.error("Search error", error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchClients, 300);
    return () => clearTimeout(timeoutId);
  }, [clientSearch, addClientOpen, clients]);


  // --- 5. Add/Remove Action Handlers ---

  const handleAddPersonnel = async (user) => {
    const roleToAssign = user.role || "staff"; 
    try {
      const res = await apiFetch(
        `/cases/${id}/personnel?user_id=${user.id}&role=${roleToAssign}`, 
        { method: "POST" }
      );
      
      if (res.ok) {
        await fetchCaseDetails(); 
        setAddPersonnelOpen(false);
        setPersonnelSearch("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemovePersonnel = async (personnelId) => {
    try {
      const res = await apiFetch(`/cases/${id}/personnel/${personnelId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setPersonnel(prev => prev.filter(p => p.id !== personnelId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddClient = async (user) => {
    try {
      const res = await apiFetch(
        `/cases/${id}/clients?user_id=${user.id}&role_type=${encodeURIComponent(clientRoleToAssign)}`,
        { method: "POST" }
      );

      if (res.ok) {
        await fetchCaseDetails(); 
        setAddClientOpen(false);
        setClientSearch("");
        setClientRoleToAssign("client");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveClient = async (clientId) => {
    try {
      const res = await apiFetch(`/cases/${id}/clients/${clientId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setClients(prev => prev.filter(c => c.id !== clientId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDocumentDownload = (doc) => {
    if (!doc?.file_path) return;
    window.open(`${API_BASE_URL}/documents/${doc.id}/download`, "_blank");
  };

  // --- UI Helpers ---
  const getStatusColor = (status) => {
    if (!status) return "outline";
    return status === "active" ? "default" : status === "pending" ? "secondary" : "outline";
  };

  const getPriorityColor = (priority) => {
    if (!priority) return "outline";
    return priority === "high" ? "destructive" : priority === "medium" ? "secondary" : "outline";
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
          <p>Loading case details...</p>
        </div>
      </MainLayout>
    );
  }

  if (!caseData) {
    return (
      <MainLayout>
        <div className="p-6 text-center">
          <p className="text-xl font-semibold text-red-500">Case Not Found</p>
          <Button variant="link" onClick={() => navigate("/cases")}>Go Back</Button>
        </div>
      </MainLayout>
    );
  }

  const canManageCase = currentUser && currentUser.role !== "client";

  return (
    <MainLayout>
      <motion.div className="p-6 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* LEFT SIDE: Buttons + Case Info + (Personnel | Clients) + Documents */}
          <div className="lg:col-span-2 space-y-6">

            {/* BUTTONS ROW (Moved Inside Left Column) */}
            <div className="flex justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/cases")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cases
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/messages?case_id=${id}`)}>
                <MessageSquare className="mr-2 h-4 w-4" /> View All Messages
              </Button>
            </div>

            {/* CASE INFO */}
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl mb-2">{caseData?.title || "Untitled Case"}</CardTitle>
                    <CardDescription>Case Number: {caseData?.case_number ?? "N/A"}</CardDescription>
                    {currentUser?.role === "admin" && (
                      <CardDescription>Case Serial: {caseData?.case_serial || "N/A"}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* <Badge variant={getStatusColor(caseData?.status)}>
                      {(caseData?.status || "unknown").toUpperCase()}
                    </Badge>
                    <Badge variant={getPriorityColor(caseData?.priority)}>
                      {(caseData?.priority || "unknown").toUpperCase()} PRIORITY
                    </Badge> */}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Label>Description</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {caseData?.description || "No description available"}
                </p>
              </CardContent>
            </Card>

            {/* --- ROW WRAPPER FOR PERSONNEL AND CLIENTS --- */}
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* PERSONNEL CARD */}
              <Card className="shadow-md">
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>DSS Team</CardTitle>
                  {canManageCase && (
                    <Dialog open={addPersonnelOpen} onOpenChange={setAddPersonnelOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                          <DialogTitle>Add Personnel</DialogTitle>
                        </DialogHeader>
                      
                      {/* SEARCH SECTION */}
                      <div className="space-y-4 py-2">
                        
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search available personnel..." 
                                className="pl-9"
                                value={personnelSearch}
                                onChange={(e) => setPersonnelSearch(e.target.value)}
                            />
                        </div>
                        
                        <div className="border rounded-md h-[200px] overflow-y-auto p-1">
                            {isSearching ? (
                                <div className="flex items-center justify-center h-full"><Loader2 className="h-4 w-4 animate-spin"/></div>
                            ) : searchResultsPersonnel.length === 0 ? (
                                <p className="text-xs text-center text-muted-foreground py-4">No matching personnel found.</p>
                            ) : (
                                searchResultsPersonnel.map(person => (
                                    <div key={person.id} className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer group" onClick={() => handleAddPersonnel(person)}>
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <User className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium leading-none">{person.name}</p>
                                                <p className="text-xs text-muted-foreground capitalize">{person.role || "No Role"}</p>
                                            </div>
                                        </div>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                      </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {personnel?.length === 0 && <p className="text-sm text-muted-foreground">No personnel assigned.</p>}
                  {personnel?.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-muted rounded-lg mb-2">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs capitalize text-primary">{p.role}</p>
                      </div>
                      {canManageCase && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemovePersonnel(p.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* CLIENTS CARD */}
              <Card className="shadow-md">
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Clients</CardTitle>
                  {canManageCase && (
                    <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><Plus className="h-4 w-4" /></Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
                      
                      {/* SEARCH SECTION */}
                      <div className="space-y-4 py-2">
                        <div className="space-y-1">
                          <Label>Client Role in Case</Label>
                          <Select value={clientRoleToAssign} onValueChange={setClientRoleToAssign}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">client</SelectItem>
                              <SelectItem value="spouse">spouse</SelectItem>
                              <SelectItem value="legal guardian">legal guardian</SelectItem>
                              <SelectItem value="other">other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search available clients..." 
                                className="pl-9"
                                value={clientSearch}
                                onChange={(e) => setClientSearch(e.target.value)}
                            />
                        </div>
                        
                        <div className="border rounded-md h-[200px] overflow-y-auto p-1">
                            {isSearching ? (
                                <div className="flex items-center justify-center h-full"><Loader2 className="h-4 w-4 animate-spin"/></div>
                            ) : searchResultsClients.length === 0 ? (
                                <p className="text-xs text-center text-muted-foreground py-4">No matching clients found.</p>
                            ) : (
                                searchResultsClients.map(client => (
                                    <div key={client.id} className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer group" onClick={() => handleAddClient(client)}>
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                                <span className="text-xs font-bold text-blue-600">{(client.name || "?").charAt(0)}</span>
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-sm font-medium leading-none truncate">{client.name}</p>
                                                <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                                            </div>
                                        </div>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                      </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {clients?.length === 0 && <p className="text-sm text-muted-foreground">No clients assigned.</p>}
                  {clients?.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-muted rounded-lg mb-2">
                      <div>
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                        <p className="text-xs capitalize text-primary">{c.case_role || "client"}</p>
                      </div>
                      {canManageCase && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveClient(c.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

            </div>
            {/* --- END ROW WRAPPER --- */}

            {/* DOCUMENTS FULL WIDTH */}
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {documents?.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded.</p>}
                {documents?.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm">{doc.name}</p>
                    </div>
                    <Button variant="ghost" size="sm" disabled={!doc?.file_path} onClick={() => handleDocumentDownload(doc)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div> {/* END LEFT SIDE */}

          {/* RIGHT SIDE CHAT */}
          {/* h-full + removed sticky/items-start ensures it stretches to match Left Column height */}
          <div className="hidden lg:flex flex-col border rounded-xl shadow-md h-full bg-background overflow-hidden">
            <div className="p-4 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Case Messages
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto bg-muted/20 p-4 space-y-4">
              {messages.length === 0 && (
                 <div className="text-center text-sm text-muted-foreground py-10">
                    <p>No messages yet.</p>
                 </div>
              )}
              
              {messages.map((msg) => {
                  const isMe = currentUser && msg.sender_id === currentUser.id;
                  const senderName = getSenderName(msg.sender_id);
                  const isDocumentRequest = msg.message_type === "document_request";
                  const docRequest = msg.document_request;

                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`flex gap-2 max-w-[80%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center border border-primary/20">
                                <span className="text-xs font-bold text-primary">{senderName.charAt(0)}</span>
                            </div>
                            
                            <div>
                                <div className={`flex items-baseline gap-2 mb-1 ${isMe ? "justify-end" : "justify-start"}`}>
                                    <span className="text-xs text-muted-foreground">{senderName}</span>
                                    <span className="text-[10px] text-muted-foreground opacity-70">
                                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                                
                                <div className={`p-3 rounded-2xl text-sm ${
                                    isMe 
                                    ? "bg-primary text-primary-foreground rounded-tr-none" 
                                    : "bg-muted text-foreground rounded-tl-none"
                                }`}>
                                    {isDocumentRequest && (
                                      <p className="text-xs font-semibold mb-1 opacity-80">Document Request</p>
                                    )}
                                    <p>{msg.content}</p>
                                    {isDocumentRequest && docRequest && (
                                      <div className="mt-2 space-y-1">
                                        {(docRequest.requested_documents || []).map((doc) => (
                                          <p key={doc.id} className="text-xs opacity-90">- {doc.name}</p>
                                        ))}
                                        {currentUser?.role === "client" && docRequest.access_token && (
                                          <Button
                                            size="sm"
                                            variant={isMe ? "secondary" : "outline"}
                                            className="h-7 mt-2"
                                            onClick={() => window.open(`${CLIENT_BASE_URL}/requests/${docRequest.access_token}`, "_blank")}
                                          >
                                            Upload documents
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                  );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t bg-background">
              <div className="flex gap-2">
                <Input 
                    placeholder="Type a message..." 
                    className="flex-1" 
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                />
                <Button size="icon" onClick={handleSendMessage} disabled={!messageInput.trim()}>
                    <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

        </div>
      </motion.div>
    </MainLayout>
  );
}
