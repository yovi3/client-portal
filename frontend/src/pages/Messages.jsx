"use client"

import { useState, useEffect, useRef } from "react"
import MainLayout from "@/components/layout/MainLayout"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { 
  Send, 
  Smartphone, 
  FilePlus, 
  X, 
  Search, 
  MoreVertical, 
  Loader2, 
  Calendar as CalendarIcon, 
  FileText, 
  CheckCircle2, 
  Upload,
  FileClock,
  FileSearch,
  FileUp,
  Download // <-- (NEW) Import Download Icon
} from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { Toaster, toast } from "sonner" 

// --- (NEW) API URL (moved to top level for global use) ---
const API_BASE_URL = "http://127.0.0.1:8002";

// --- UTILITY FUNCTIONS ---
const dateToIsoString = (date) => {
    if (!date) return null;
    return date.toISOString();
};

// =========================================================================
// --- DOCUMENT REQUEST MESSAGE COMPONENT (MODIFIED) ---
// =========================================================================

// Helper component for file status icons
const FileStatusIcon = ({ status }) => {
  switch (status) {
    case 'uploaded':
    case 'reviewed': // (NEW) Treat 'reviewed' like 'uploaded' for icon
      return <FileUp className="h-5 w-5 text-blue-500 flex-shrink-0" />;
    case 'required':
    default:
      return <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />;
  }
};

// Helper component for file status badges
const FileStatusBadge = ({ status }) => {
   switch (status) {
    case 'uploaded':
      return <Badge variant="default" className="bg-blue-100 text-blue-700">Uploaded</Badge>;
    case 'reviewed':
      return <Badge variant="secondary" className="bg-green-100 text-green-700">Reviewed</Badge>;
    case 'required':
    default:
      return <Badge variant="outline" className="text-gray-600">Required</Badge>;
  }
}

/**
 * A custom component to render document requests.
 * (MODIFIED) It now takes an `onReviewClick` prop from the parent.
 */
const DocumentRequestMessage = ({ message, conversation, isLawyer, onReviewClick }) => {
  const { document_request } = message;

  if (!document_request) {
    return <div className="text-red-500 text-sm p-4">Error: Document request data is missing or malformed.</div>;
  }
  
  const { 
    requested_documents = [], 
    deadline, 
    status: overallStatus, 
    access_token 
  } = document_request;
  
  const lawyerName = conversation._caseData.assigned_lawyer_user?.name || 'Your Lawyer';
  const clientName = conversation._caseData.client_user?.name || 'Client';

  // --- 1. LAWYER VIEW (Status Dashboard / "Preview") ---
  if (isLawyer) {
    const uploadedCount = requested_documents.filter(doc => doc.status === 'uploaded' || doc.status === 'reviewed').length;
    const totalCount = requested_documents.length;
    
    // (MODIFIED) This now calls the function passed from the parent
    const handleReviewClick = () => {
        onReviewClick(document_request); // Pass the request data up
    };

    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] w-full">
          <Card className="shadow-md bg-white border-gray-300 rounded-xl rounded-bl-sm">
            <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
              <div className="p-2 bg-gray-100 rounded-full">
                <FileSearch className="h-6 w-6 text-gray-700" />
              </div>
              <div>
                <CardTitle className="text-base text-gray-800">
                  Request Sent to {clientName}
                </CardTitle>
                <p className="text-sm text-gray-500">
                  {uploadedCount} of {totalCount} items uploaded.
                </p>
              </div>
            </CardHeader>
            
            <CardContent className="px-4 pb-4 pt-0 space-y-4">
              {message.content && (
                <div className="border-l-4 border-gray-200 pl-3 py-1">
                  <p className="text-sm italic text-gray-600">"{message.content}"</p>
                </div>
              )}
              
              {deadline && (
                <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                  <CalendarIcon className="h-4 w-4" />
                  Deadline: {format(new Date(deadline), 'MMM d, yyyy h:mm a')}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase">Document Status</p>
                <ul className="space-y-2">
                  {requested_documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <FileStatusIcon status={doc.status} />
                        <span className="font-medium text-gray-700">{doc.name}</span>
                      </div>
                      <FileStatusBadge status={doc.status} />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={handleReviewClick} // <-- (MODIFIED)
                  variant="default"
                  className="text-sm h-9"
                  disabled={uploadedCount === 0}
                >
                  <FileSearch className="h-4 w-4 mr-2" />
                  Review Uploads
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- 2. CLIENT VIEW (Action Card) ---
  const isCompleted = overallStatus === 'completed';
  const uploadUrl = `${CLIENT_BASE_URL}/requests/${access_token}`; // Use CLIENT_BASE_URL

  const handleUploadClick = () => {
    if (isCompleted) {
       toast.info("This request is already completed, but you can view your uploads.");
       window.open(uploadUrl, '_blank');
    } else {
       toast("Opening document upload page...");
       window.open(uploadUrl, '_blank');
    }
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] w-full">
        <Card className={`shadow-md ${isCompleted ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'} rounded-xl rounded-bl-sm`}>
          <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
             <div className={`p-2 ${isCompleted ? 'bg-green-100' : 'bg-blue-100'} rounded-full`}>
                <FileClock className={`h-6 w-6 ${isCompleted ? 'text-green-700' : 'text-blue-700'}`} />
              </div>
              <div>
                <CardTitle className={`text-base ${isCompleted ? 'text-green-800' : 'text-blue-800'}`}>
                  {isCompleted ? 'Documents Received' : 'Action Required: Document Request'}
                </CardTitle>
                <p className={`text-sm ${isCompleted ? 'text-green-700' : 'text-blue-700'}`}>
                  From {lawyerName}
                </p>
              </div>
          </CardHeader>
          
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {message.content && (
              <div className={`border-l-4 ${isCompleted ? 'border-green-300' : 'border-blue-300'} pl-3 py-1`}>
                <p className="text-sm italic text-gray-700">"{message.content}"</p>
              </div>
            )}
            
            {deadline && !isCompleted && (
              <div className="flex items-center gap-2 text-sm font-medium text-red-600 p-2 bg-red-50 rounded-md">
                <CalendarIcon className="h-4 w-4" />
                Please submit by: {format(new Date(deadline), 'MMM d, yyyy h:mm a')}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Required Items</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                {requested_documents.map((doc) => (
                  <li key={doc.id} className="text-sm font-medium text-gray-700">
                    {doc.name}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <Button 
                onClick={handleUploadClick}
                variant={isCompleted ? "secondary" : "default"}
                className="text-sm h-10 font-bold"
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    View My Uploads
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Documents Now
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// =========================================================================
// --- MAIN MESSAGES COMPONENT ---
// =========================================================================
export default function Messages() {
  // --- STATE VARIABLES ---
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Document request modal state
  const [isRequestingDocs, setIsRequestingDocs] = useState(false)
  const [isSendingRequest, setIsSendingRequest] = useState(false)
  const [requiredDocs, setRequiredDocs] = useState([{ display_name: "" }]) 
  const [note, setNote] = useState("")
  const [deadline, setDeadline] = useState(undefined)

  // --- (NEW) State for the Review Modal ---
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedRequestForReview, setSelectedRequestForReview] = useState(null);
  // --- (END NEW) ---

  const messagesEndRef = useRef(null)
  const webSocketRef = useRef(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // --- Get the logged-in user from localStorage ---
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined") {
      const storedUserData = localStorage.getItem("user")
      try {
        return storedUserData ? JSON.parse(storedUserData) : null
      } catch (e) {
        localStorage.removeItem("user")
        return null
      }
    }
    return null
  })

  // --- Auth check effect ---
  useEffect(() => {
    if (!user) {
      navigate("/login")
    }
  }, [user, navigate])

  // [.. Fetch Conversations (Cases) ..]
  useEffect(() => {
    if (!user) return

    const fetchConversations = async () => {
      setIsLoading(true)
      setError(null)
      const endpoint =
        user.role === "lawyer"
          ? `${API_BASE_URL}/lawyers/${user.id}/cases`
          : `${API_BASE_URL}/clients/${user.id}/cases`
      try {
        const res = await fetch(endpoint)
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: "Network error" }))
          throw new Error(errorData.detail || `HTTP error! Status: ${res.status}`)
        }
        const cases = await res.json()
        if (!Array.isArray(cases)) {
          console.error("API did not return an array:", cases)
          throw new Error("Invalid data format received from server.")
        }
        const formattedConvos = cases.map((c) => {
          const participantName = user.role === "lawyer" ? c.client_user?.name : c.assigned_lawyer_user?.name
          return {
            id: c.id,
            participantName: participantName || c.title || "Unknown Participant",
            unreadCount: c.unread_count || 0,
            _caseData: c,
          }
        })
        setConversations(formattedConvos)
      } catch (err) {
        console.error("Failed to fetch conversations:", err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConversations()
  }, [user])

  // [.. Auto-select chat from URL ..]
  useEffect(() => {
    const urlCaseId = searchParams.get("case_id")
    if (urlCaseId && conversations.length > 0) {
      const convoToSelect = conversations.find((c) => c.id.toString() === urlCaseId)
      if (convoToSelect) {
        setSelectedConversation(convoToSelect)
        setSearchParams({}, { replace: true })
      }
    }
  }, [conversations, searchParams, setSearchParams])

  // [.. Fetch Messages & Connect WebSocket ..]
  const fetchMessages = async (caseId) => {
    try {
      await fetch(`${API_BASE_URL}/cases/${caseId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reader_id: user.id }),
      })
      setConversations((prevConvos) => prevConvos.map((c) => (c.id === caseId ? { ...c, unreadCount: 0 } : c)))
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/messages`)
      if (!res.ok) throw new Error("Failed to fetch messages")
      const data = await res.json()
      if (Array.isArray(data)) {
        setMessages(data.map((msg) => ({ ...msg, id: msg.id }))) 
      }
      scrollToBottom()
    } catch (err) {
      console.error("Message fetch/read error:", err)
    }
  }

  useEffect(() => {
    if (selectedConversation && user) {
      const openConversation = async () => {
        await fetchMessages(selectedConversation.id)
        if (webSocketRef.current) {
          webSocketRef.current.close()
        }
        const ws = new WebSocket(`ws://127.0.0.1:8002/ws/${selectedConversation.id}`)
        webSocketRef.current = ws
        ws.onopen = () => console.log("WebSocket connected")
        ws.onclose = () => console.log("WebSocket disconnected")
        ws.onmessage = (event) => {
          try {
            const newMessage = JSON.parse(event.data)
            setMessages((prevMessages) => {
              if (prevMessages.some((msg) => msg.id === newMessage.id)) {
                return prevMessages
              }
              return [...prevMessages, { ...newMessage, id: newMessage.id }]
            })
          } catch (e) {
            console.error("Failed to parse ws message", e)
          }
        }
      }
      openConversation()
      return () => {
        if (webSocketRef.current) {
          webSocketRef.current.close()
        }
      }
    }
  }, [selectedConversation, user])

  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  useEffect(() => {
    if (!isRequestingDocs) {
        setRequiredDocs([{ display_name: "" }]);
        setNote("");
        setDeadline(undefined);
        setIsSendingRequest(false);
    }
  }, [isRequestingDocs]);
  
  // [.. Helper functions ..]
  const getInitials = (name) =>
    (name || "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const sendMessage = () => {
    if (!newMessage.trim() || !webSocketRef.current || !user) return
    const messagePayload = {
      content: newMessage,
      sender_id: user.id,
    }
    webSocketRef.current.send(JSON.stringify(messagePayload))
    setNewMessage("")
  }

  // [.. Document Request Functions ..]
  const handleDocChange = (index, value) => {
    const newDocs = requiredDocs.map((doc, i) => (i === index ? { display_name: value } : doc))
    const filteredDocs = newDocs.filter((doc, i) => doc.display_name.trim() !== "" || i === newDocs.length - 1)
    if (index === newDocs.length - 1 && value.trim() !== "") {
      setRequiredDocs([...filteredDocs, { display_name: "" }])
    } else {
      setRequiredDocs(filteredDocs)
    }
  }

  const removeDoc = (index) => {
    setRequiredDocs(requiredDocs.filter((_, i) => i !== index))
  }

  const sendDocumentRequest = async () => {
    const activeDocs = requiredDocs.filter((d) => d.display_name.trim() !== "")
    if (activeDocs.length === 0 || !selectedConversation) {
        toast.error("Please specify at least one required document.");
        return;
    }

    setIsSendingRequest(true)
    
    try {
      const caseId = selectedConversation.id
      const requiredItemsPayload = activeDocs.map(doc => ({
        name: doc.display_name,
      }));

      const payload = {
        required_items: requiredItemsPayload,
        lawyer_id: user.id,
        note: note || null,
        deadline: dateToIsoString(deadline), 
      }

      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: "Server error" }))
        throw new Error(errorData.detail || `Server error: ${res.status}`)
      }

      toast.success(`Document request successfully sent to ${selectedConversation.participantName}. Client notified via SMS.`);

      setRequiredDocs([{ display_name: "" }])
      setNote("")
      setDeadline(undefined)
      setIsRequestingDocs(false)
      fetchMessages(caseId) 
    } catch (error) {
      console.error("Error sending document request:", error)
      toast.error(`Failed to send request. Error: ${error.message}`);
    } finally {
      setIsSendingRequest(false)
    }
  }
  
  // --- (NEW) Handler for opening the Review Modal ---
  const handleOpenReviewModal = (docRequest) => {
    setSelectedRequestForReview(docRequest);
    setIsReviewModalOpen(true);
  };
  
  // (REMOVED) handleMarkAsReviewed function
  // --- (END NEW) ---

  const filteredConversations = conversations.filter((conv) =>
    conv.participantName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // --- RENDER ---
  if (!user) {
    return (
      <MainLayout>
        <p className="p-4">Authenticating...</p>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="flex gap-4 h-[calc(100vh-8rem)] max-h-[900px]">
        {/* Left Sidebar: Conversations */}
        <Card className="w-[380px] flex flex-col shadow-lg border-border/40">
          <CardHeader className="pb-4 space-y-4">
            <CardTitle className="text-2xl font-semibold">Messages</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {isLoading && (
                <div className="p-8 text-center">
                  <div className="animate-pulse space-y-4">
                    <div className="h-16 bg-muted rounded-lg"></div>
                    <div className="h-16 bg-muted rounded-lg"></div>
                    <div className="h-16 bg-muted rounded-lg"></div>
                  </div>
                </div>
              )}
              {error && (
                <div className="p-4 m-4 bg-destructive/10 text-destructive rounded-lg text-sm">Error: {error}</div>
              )}
              {!isLoading && !error && (
                <div>
                  {filteredConversations.length === 0 && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      {searchQuery ? "No results found" : "No conversations yet"}
                    </p>
                  )}
                  {filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full px-4 py-3 flex items-center gap-3 transition-all border-l-4 ${
                        selectedConversation?.id === conv.id
                          ? "bg-primary/5 border-primary"
                          : "hover:bg-muted/50 border-transparent"
                      }`}
                    >
                      <Avatar className="h-11 w-11 border-2 border-background shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold">
                          {getInitials(conv.participantName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-sm truncate">{conv.participantName}</h3>
                          {conv.unreadCount > 0 && (
                            <Badge
                              variant="default"
                              className="h-5 min-w-5 px-1.5 flex items-center justify-center text-xs font-bold shrink-0"
                            >
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv._caseData.title || "Case conversation"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Chat Area */}
        <Card className="flex-1 flex flex-col shadow-lg border-border/40 overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <CardHeader className="border-b border-border/50 bg-muted/30 backdrop-blur-sm py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold">
                        {getInitials(selectedConversation.participantName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-base">{selectedConversation.participantName}</h3>
                      {user.role === "lawyer" && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Smartphone className="h-3 w-3" />
                          Case Code: {selectedConversation._caseData.sms_id_tag}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>

              {/* Messages Area */}
              <CardContent className="flex-1 p-6 overflow-hidden bg-muted/10">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    {messages.map((msg) => {
                      // Debug log to check message structure
                      console.log(`Message ID: ${msg.id}`, { 
                          type: msg.message_type, 
                          hasDocRequestObj: !!msg.document_request 
                      });


                      const isOwn = msg.sender_id === user.id
                      const senderName = isOwn ? "You" : msg.sender_user?.name || selectedConversation.participantName
                      
                      // --- ROBUST CHECK for Document Request ---
                      const isDocumentRequest = 
                        msg.message_type === "document_request" || 
                        (msg.document_request && Array.isArray(msg.document_request.requested_documents));

                      if (isDocumentRequest) {
                          return (
                            <DocumentRequestMessage 
                                key={msg.id} 
                                message={msg} 
                                conversation={selectedConversation}
                                isLawyer={user.role === 'lawyer'}
                                onReviewClick={handleOpenReviewModal} // <-- (NEW) Pass handler
                            />
                          );
                      }
                      
                      // --- Render standard message ---
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`flex gap-2.5 max-w-[75%] ${isOwn ? "flex-row-reverse" : ""}`}>
                            <Avatar className="h-8 w-8 mt-0.5 shadow-sm border border-background">
                              <AvatarFallback
                                className={
                                  isOwn
                                    ? "bg-primary text-primary-foreground text-xs font-medium"
                                    : "bg-muted text-foreground text-xs font-medium"
                                }
                              >
                                {getInitials(senderName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                              <div
                                className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                                  isOwn
                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                    : "bg-card border border-border/50 text-foreground rounded-bl-sm"
                                }`}
                              >
                                <p className="text-sm leading-relaxed">{msg.content}</p>
                              </div>
                              <div className={`flex items-center gap-1.5 px-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                                <p className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</p>
                                {msg.channel === "sms" && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Smartphone className="h-3 w-3" />
                                    <span className="text-[10px]">SMS</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>

              {/* Input Area */}
              <div className="border-t border-border/50 bg-card p-4">
                <div className="flex gap-2 items-end">
                  {user.role === "lawyer" && (
                    <Button
                      onClick={() => setIsRequestingDocs(true)}
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 mb-2"
                      title="Request documents"
                    >
                      <FilePlus className="h-4 w-4" />
                    </Button>
                  )}

                  <div className="flex-1 flex gap-2 items-center bg-muted/50 rounded-2xl px-4 py-2 border border-border/50 focus-within:border-primary/50 transition-colors">
                    <Input
                      placeholder="Type your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                      className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                    />
                    <Button
                      onClick={sendMessage}
                      size="icon"
                      disabled={!newMessage.trim()}
                      className="h-9 w-9 rounded-full shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/5">
              <div className="rounded-full bg-primary/10 p-6 mb-4">
                <Send className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Select a conversation</h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                {isLoading ? "Loading conversations..." : "Choose a conversation from the list to start messaging"}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Document Request Modal */}
      <Dialog open={isRequestingDocs} onOpenChange={setIsRequestingDocs}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FilePlus className="h-5 w-5 text-primary" />
              Request Documents from Client
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Requesting documents for case:{" "}
                <span className="font-semibold text-foreground">{selectedConversation?.participantName}</span>
              </p>

              <div className="space-y-3">
                <label className="text-sm font-medium ml-1">Required Documents</label>
                {requiredDocs.map((doc, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Input
                        placeholder={`Document ${index + 1} (e.g., ID Card)`}
                        value={doc.display_name} 
                        onChange={(e) => handleDocChange(index, e.target.value)}
                        className="pr-10"
                      />
                      {index < requiredDocs.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDoc(index)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Deadline Field with Calendar and Time */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 ml-1" /> Deadline (Optional) 
              </label>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={`w-full justify-start text-left font-normal ${!deadline && "text-muted-foreground"}`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline ? format(deadline, "PPP HH:mm") : <span>Pick a date and time</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={(date) => {
                        const selectedDate = date || new Date(); 
                        const now = new Date();
                        
                        if (!deadline) {
                            selectedDate.setHours(now.getHours());
                            selectedDate.setMinutes(now.getMinutes());
                        } else {
                             selectedDate.setHours(deadline.getHours());
                             selectedDate.setMinutes(deadline.getMinutes());
                        }
                        setDeadline(selectedDate);
                    }}
                    initialFocus
                  />
                  <div className="p-3 border-t">
                      <Input
                          type="time"
                          value={deadline ? format(deadline, "HH:mm") : "00:00"}
                          onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(':').map(Number);
                              const newDeadline = deadline || new Date(); 
                              newDeadline.setHours(hours, minutes);
                              setDeadline(new Date(newDeadline)); 
                          }}
                          className="w-full"
                      />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium ml-1">Additional Note (Optional)</label>
              <Textarea
                placeholder="e.g. Ensure scans are legible."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsRequestingDocs(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={sendDocumentRequest}
                disabled={requiredDocs.filter((d) => d.display_name.trim() !== "").length === 0 || isSendingRequest} 
                className="flex-1"
              >
                {isSendingRequest ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                    </>
                ) : (
                    "Send Request & Notify via SMS"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* --- (NEW) Lawyer's Review Modal --- */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileSearch className="h-5 w-5 text-primary" />
              Review Uploaded Documents
            </DialogTitle>
            <DialogDescription>
              Review files uploaded by {selectedConversation?.participantName} for request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <ul className="space-y-3">
              {selectedRequestForReview?.requested_documents.map((doc) => (
                <li 
                  key={doc.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileStatusIcon status={doc.status} />
                    <span className="font-medium">{doc.name}</span>
                  </div>
                  
                  {/* Check if file is uploaded and has a path */}
                  {doc.file_path && (doc.status === 'uploaded' || doc.status === 'reviewed') ? (
                    <Button 
                      asChild // 'asChild' lets the <a> tag handle navigation
                      variant="outline" 
                      size="sm"
                      className="bg-white"
                    >
                      {/* This link is constructed from your API base URL and the file_path from the DB.
                        It opens the file in a new tab.
                      */}
                      <a 
                        href={`${API_BASE_URL}/${doc.file_path}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        View File <Download className="h-4 w-4 ml-2" /> 
                      </a>
                    </Button>
                  ) : (
                    // Show "Not Uploaded" if status is 'required'
                    <FileStatusBadge status={doc.status} />
                  )}
                </li>
              ))}
            </ul>
          </div>
          
          <DialogFooter className="gap-2">
             <Button 
                variant="outline" 
                onClick={() => setIsReviewModalOpen(false)}
            >
                Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* --- (END NEW) --- */}
      
      {/* Sonner component for notifications */}
      <Toaster richColors position="bottom-right" /> 
    </MainLayout>
  )
}