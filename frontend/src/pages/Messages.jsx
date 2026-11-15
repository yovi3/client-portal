import { useState, useEffect, useRef } from "react"
import MainLayout from "@/components/layout/MainLayout"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  Download,
  AlertCircle,
  Briefcase,
  Check,
  CheckCheck,
} from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { toast } from "sonner"
import { API_BASE_URL, CLIENT_BASE_URL, getWsBaseUrl, apiFetch } from "@/lib/api"
import { getStoredUser, fetchCurrentUser } from "@/lib/auth"
import {
  STAFF_ROLES,
  formatItemLabel,
  getDocumentRequestBody,
  getDocumentRequestTitle,
} from "@/lib/documentRequestText"
import { buildClientText, countTextParts, describeTextStatus, getTextingTarget } from "@/lib/texting"

// --- (NEW) API URL (moved to top level for global use) ---
// --- UTILITY FUNCTIONS ---
const dateToIsoString = (date) => {
    if (!date) return null;
    return date.toISOString();
};

const getLawyerName = (caseData) =>
  caseData?.assigned_lawyer_user?.name ||
  caseData?.personnel?.find((person) => person.role === "lawyer")?.name ||
  caseData?.personnel?.[0]?.name ||
  "DSS Team";

const getConversationParticipantName = (caseData, currentUser) => {
  if (!caseData || !currentUser) return "Case Participant";

  if (currentUser.role === "client") {
    const names = (caseData.personnel || []).map((person) => person.name).filter(Boolean);
    if (names.length) return names.join(", ");
    return "DSS Team";
  }

  const names = (caseData.clients || []).map((client) => client.name).filter(Boolean);
  if (names.length) return names.join(", ");
  return caseData.title || "Client";
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
      return <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />;
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
      return <Badge variant="outline" className="text-muted-foreground">Required</Badge>;
  }
}

/**
 * A custom component to render document requests.
 * (MODIFIED) It now takes an `onReviewClick` prop from the parent.
 */
const DocumentRequestMessage = ({ message, conversation, isLawyer, onReviewClick }) => {
  const { document_request } = message;

  if (!document_request) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] w-full">
          <Card className="shadow-md bg-yellow-50 border-yellow-300 rounded-xl rounded-bl-sm">
            <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
              <div className="p-2 bg-yellow-100 rounded-full">
                <FileSearch className="h-6 w-6 text-yellow-700" />
              </div>
              <div>
                <CardTitle className="text-base text-yellow-800">
                  Document Request
                </CardTitle>
                <p className="text-sm text-yellow-700">
                  Details are unavailable for this request.
                </p>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="text-sm text-yellow-900">{message.content}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  const { 
    requested_documents = [], 
    deadline, 
    status: overallStatus, 
    access_token 
  } = document_request;
  
  const lawyerName = getLawyerName(conversation._caseData);

  const uploadedCount = requested_documents.filter(doc => doc.status === 'uploaded' || doc.status === 'reviewed').length;
  const totalCount = requested_documents.length;
  const hasAllUploads = totalCount > 0 && uploadedCount === totalCount;
  const itemLabel = formatItemLabel(totalCount);

  // --- 1. LAWYER VIEW (Status Dashboard / "Preview") ---
  if (isLawyer) {
    
    // (MODIFIED) This now calls the function passed from the parent
    const handleReviewClick = () => {
        onReviewClick(document_request); // Pass the request data up
    };

    if (hasAllUploads) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[75%] w-full">
            <Card className="shadow-md border-green-300 bg-green-50 rounded-xl rounded-bl-sm">
              <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-6 w-6 text-green-700" />
                </div>
                <div>
                  <CardTitle className="text-base text-green-800">
                    {getDocumentRequestTitle("admin")}
                  </CardTitle>
                  <p className="text-sm text-green-700">
                    {uploadedCount} of {totalCount} uploaded ({itemLabel}).
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="flex justify-end">
                  <Button 
                    onClick={handleReviewClick}
                    variant="secondary"
                    className="text-sm h-9"
                  >
                    Review uploads
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] w-full">
          <Card className="shadow-md bg-card border-border rounded-xl rounded-bl-sm">
            <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
              <div className="p-2 bg-muted rounded-full">
                <FileSearch className="h-6 w-6 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-base text-foreground">
                  {getDocumentRequestTitle("admin")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {uploadedCount} of {totalCount} uploaded ({itemLabel}).
                </p>
              </div>
            </CardHeader>
            
            <CardContent className="px-4 pb-4 pt-0 space-y-4">
              {message.content && (
                <div className="border-l-4 border-border pl-3 py-1">
                  <p className="text-sm italic text-muted-foreground">"{message.content}"</p>
                </div>
              )}
              
              {deadline && (
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <CalendarIcon className="h-4 w-4" />
                  Deadline: {format(new Date(deadline), 'MMM d, yyyy h:mm a')}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Document Status</p>
                <ul className="space-y-2">
                  {requested_documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <FileStatusIcon status={doc.status} />
                        <span className="font-medium text-foreground">{doc.name}</span>
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
  const isCompleted = overallStatus === 'completed' || hasAllUploads;
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

  if (isCompleted) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] w-full">
          <Card className="shadow-md border-green-300 bg-green-50 rounded-xl rounded-bl-sm">
            <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
              <div className="p-2 bg-green-100 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-700" />
              </div>
              <div>
                <CardTitle className="text-base text-green-800">
                  {getDocumentRequestTitle("client")}
                </CardTitle>
                <p className="text-sm text-green-700">
                  {itemLabel} from {lawyerName}
                </p>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="flex justify-end">
                <Button onClick={handleUploadClick} variant="secondary" className="text-sm h-9">
                  View uploads
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] w-full">
        <Card className="shadow-md border-blue-300 bg-blue-50 rounded-xl rounded-bl-sm">
          <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0">
             <div className="p-2 bg-blue-100 rounded-full">
                <FileClock className="h-6 w-6 text-blue-700" />
              </div>
              <div>
                <CardTitle className="text-base text-blue-800">
                  {getDocumentRequestTitle("client")}
                </CardTitle>
                <p className="text-sm text-blue-700">
                  {itemLabel} from {lawyerName}
                </p>
              </div>
          </CardHeader>
          
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {message.content && (
              <div className="border-l-4 border-blue-300 pl-3 py-1">
                <p className="text-sm italic text-foreground">"{message.content}"</p>
              </div>
            )}
            
            {deadline && (
              <div className="flex items-center gap-2 text-sm font-medium text-destructive p-2 bg-destructive/10 rounded-md">
                <CalendarIcon className="h-4 w-4" />
                Please submit by: {format(new Date(deadline), 'MMM d, yyyy h:mm a')}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Required Items</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                {requested_documents.map((doc) => (
                  <li key={doc.id} className="text-sm font-medium text-foreground">
                    {doc.name}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <Button 
                onClick={handleUploadClick}
                variant="default"
                className="text-sm h-10 font-bold"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Documents Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// =========================================================================
// --- SIDEBAR CONVERSATION BUTTON ---
// =========================================================================
function ConvButton({ conv, selected, onSelect, subtitle }) {
  const isSelected = selected?.id === conv.id && selected?.type === conv.type
  const initials = (conv.participantName || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const isDm = conv.type === "dm"
  return (
    <button
      onClick={() => onSelect(conv)}
      className={`w-full px-4 py-2.5 flex items-center gap-3 transition-all border-l-2 ${
        isSelected ? "bg-primary/5 border-primary" : "hover:bg-muted/50 border-transparent"
      }`}
    >
      <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${
        isDm ? "bg-primary/10" : "bg-muted"
      }`}>
        {isDm
          ? <span className="text-xs font-semibold text-primary">{initials}</span>
          : <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
        }
      </div>
      <div className="flex-1 text-left overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{conv.participantName}</p>
          {conv.unreadCount > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[0.625rem] font-bold shrink-0">{conv.unreadCount}</Badge>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
    </button>
  )
}

// =========================================================================
// --- MAIN MESSAGES COMPONENT ---
// =========================================================================
export default function Messages() {
  // --- STATE VARIABLES ---
  const [conversations, setConversations] = useState([])
  const [dmConversations, setDmConversations] = useState([])
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

  // --- Get the logged-in user (cookie or stored) ---
  const [user, setUser] = useState(() => getStoredUser())

  // --- Auth check effect ---
  useEffect(() => {
    if (user) return
    fetchCurrentUser().then((u) => {
      if (u) setUser(u)
      else navigate("/login")
    })
  }, [user, navigate])

  // [.. Fetch Conversations (Cases + DMs) ..]
  useEffect(() => {
    if (!user) return

    const fetchAll = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [casesRes, dmRes] = await Promise.all([
          apiFetch("/cases"),
          apiFetch("/direct-messages"),
        ])

        if (!casesRes.ok) {
          const e = await casesRes.json().catch(() => ({ detail: "Network error" }))
          throw new Error(e.detail || `HTTP error! Status: ${casesRes.status}`)
        }
        const cases = await casesRes.json()
        if (!Array.isArray(cases)) throw new Error("Invalid data format received from server.")
        const staffView = STAFF_ROLES.has(user.role)
        setConversations(cases.map((c) => ({
          id: c.id,
          type: "case",
          // Staff think in people ("I'm texting Mrs. Smith"), clients in their case.
          participantName: staffView
            ? (c.clients || []).map((cl) => cl.name).filter(Boolean).join(", ") || c.title || "Untitled case"
            : c.title || "Untitled case",
          caseTitle: c.title || "Untitled case",
          unreadCount: c.unread_count || 0,
          _caseData: c,
        })))

        if (dmRes.ok) {
          const dms = await dmRes.json()
          if (Array.isArray(dms)) {
            setDmConversations(dms.map((d) => ({
              id: d.user.id,
              type: "dm",
              participantName: d.user.name || d.user.email,
              unreadCount: d.unread_count || 0,
              _user: d.user,
              _lastMessage: d.last_message,
            })))
          }
        }
      } catch (err) {
        console.error("Failed to fetch conversations:", err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
  }, [user])

  // Switching between Cases and Team chat closes a conversation from the other list.
  const viewParam = searchParams.get("view")
  useEffect(() => {
    if (!selectedConversation || !STAFF_ROLES.has(user?.role)) return
    const wantType = viewParam === "team" ? "dm" : "case"
    if (selectedConversation.type !== wantType) setSelectedConversation(null)
  }, [viewParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // [.. Auto-select chat from URL ..]
  useEffect(() => {
    const urlCaseId = searchParams.get("case_id")
    if (urlCaseId && conversations.length > 0) {
      const convoToSelect = conversations.find((c) => c.id.toString() === urlCaseId)
      if (convoToSelect) {
        setSelectedConversation(convoToSelect)
        const next = new URLSearchParams(searchParams)
        next.delete("case_id")
        setSearchParams(next, { replace: true })
      }
    }
  }, [conversations, searchParams, setSearchParams])

  // [.. Fetch Messages & Connect WebSocket ..]
  const fetchMessages = async (conv) => {
    try {
      if (conv.type === "dm") {
        await apiFetch(`/direct-messages/${conv.id}/read`, { method: "POST" })
        setDmConversations((prev) => prev.map((d) => d.id === conv.id ? { ...d, unreadCount: 0 } : d))
        const res = await apiFetch(`/direct-messages/${conv.id}`)
        if (!res.ok) throw new Error("Failed to fetch DMs")
        const data = await res.json()
        if (Array.isArray(data)) setMessages(data)
      } else {
        await apiFetch(`/cases/${conv.id}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reader_id: user.id }),
        })
        setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, unreadCount: 0 } : c))
        const res = await apiFetch(`/cases/${conv.id}/messages`)
        if (!res.ok) throw new Error("Failed to fetch messages")
        const data = await res.json()
        if (Array.isArray(data)) setMessages(data.map((msg) => ({ ...msg, id: msg.id })))
      }
      scrollToBottom()
    } catch (err) {
      console.error("Message fetch/read error:", err)
    }
  }

  useEffect(() => {
    if (selectedConversation && user) {
      const openConversation = async () => {
        setMessages([])
        await fetchMessages(selectedConversation)
        if (webSocketRef.current) webSocketRef.current.close()
        const wsUrl = selectedConversation.type === "dm"
          ? `${getWsBaseUrl()}/ws/dm/${selectedConversation.id}`
          : `${getWsBaseUrl()}/ws/${selectedConversation.id}`
        const ws = new WebSocket(wsUrl)
        webSocketRef.current = ws
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === "sms_status") {
              // Text delivery update for a message already on screen
              setMessages((prev) => prev.map((m) => m.id === msg.message_id
                ? { ...m, sms_status: msg.sms_status, sms_error: msg.sms_error } : m))
              return
            }
            setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
          } catch (e) {
            console.error("Failed to parse ws message", e)
          }
        }
      }
      openConversation()
      return () => { webSocketRef.current?.close() }
    }
  }, [selectedConversation, user])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // The phone preview appears under the box once typing starts and takes some height;
  // keep the newest message in view when it does.
  const isComposing = newMessage.trim().length > 0
  useEffect(() => {
    scrollToBottom()
  }, [isComposing])
  
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

  const formatDateSeparator = (timestamp) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return "Today"
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
  }

  const isSameDay = (a, b) => {
    const da = new Date(a), db = new Date(b)
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  }

  const scrollToBottom = () => {
    // Jump, don't glide: opening a conversation should land on the latest message.
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
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

      const res = await apiFetch(`/cases/${caseId}/requests`, {
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

  const q = searchQuery.toLowerCase()
  const filteredCases = conversations.filter((c) =>
    `${c.participantName} ${c.caseTitle || ""}`.toLowerCase().includes(q))
  const filteredDms = dmConversations.filter((d) => d.participantName.toLowerCase().includes(q))

  // --- RENDER ---
  if (!user) {
    return (
      <MainLayout>
        <p className="p-4">Authenticating...</p>
      </MainLayout>
    )
  }

  const isStaff = STAFF_ROLES.has(user?.role)
  const view = isStaff && searchParams.get("view") === "team" ? "team" : "cases"
  const textingTarget = isStaff && selectedConversation?.type === "case"
    ? getTextingTarget(selectedConversation._caseData) : null
  const composerPlaceholder = !selectedConversation ? "" :
    selectedConversation.type !== "case" || !isStaff ? "Type your message"
      : textingTarget?.mode === "text"
        ? `Message ${textingTarget.client.name}: sent by text and in the portal`
        : `Message ${textingTarget?.client?.name || "the client"}: portal only`
  const textPreview = textingTarget?.mode === "text" && newMessage.trim()
    ? (() => {
        const text = buildClientText(user.first_name, newMessage)
        return { text, parts: countTextParts(text) }
      })()
    : null

  return (
    <MainLayout>
      <div className="p-6 space-y-5">

        {/* Page header */}
        <div>
          <h1 className="text-[1.375rem] font-bold tracking-tight text-foreground">
            {!isStaff ? "Messages" : view === "team" ? "Team chat" : "Cases"}
          </h1>
          {isStaff && (
            <p className="text-sm text-muted-foreground">
              {view === "team"
                ? "Internal messages between staff. Nothing here is ever texted to a client."
                : "Conversations with clients on LawBase cases. Your messages are also sent by text."}
            </p>
          )}
        </div>

        {/* Split panel in a card */}
        <Card className="border-border shadow-none overflow-hidden" style={{ height: "calc(100vh - 13rem)" }}>
        <div className="flex h-full">
        {/* Left: Conversations */}
        <div className="w-72 border-r bg-card flex flex-col shrink-0">
          <div className="px-4 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={view === "team" ? "Search team members" : "Search by client or case"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
              {isLoading && (
                <div className="p-4 space-y-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
                </div>
              )}
              {error && (
                <Alert variant="destructive" className="m-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {!isLoading && !error && (
                <div>
                  {isStaff && view === "team" && (<>
                  {/* Direct Messages section */}
                  <div className="px-4 pt-3 pb-1">
                    <h2 className="text-xs font-semibold text-muted-foreground">Direct messages</h2>
                  </div>
                  {filteredDms.length === 0 && (
                    <p className="px-4 py-2 text-xs text-muted-foreground">No direct messages</p>
                  )}
                  {filteredDms.map((conv) => (
                    <ConvButton key={`dm-${conv.id}`} conv={conv} selected={selectedConversation} onSelect={setSelectedConversation} subtitle={conv._user?.email || ""} />
                  ))}

                  </>)}
                  {(!isStaff || view === "cases") && (<>
                  {/* Case conversations section */}
                  <div className="px-4 pt-4 pb-1">
                    <h2 className="text-xs font-semibold text-muted-foreground">Cases</h2>
                  </div>
                  {filteredCases.length === 0 && (
                    <p className="px-4 py-2 text-xs text-muted-foreground">No case conversations</p>
                  )}
                  {filteredCases.map((conv) => (
                    <ConvButton key={`case-${conv.id}`} conv={conv} selected={selectedConversation} onSelect={setSelectedConversation} subtitle={isStaff ? conv.caseTitle : ""} />
                  ))}
                  </>)}
                </div>
              )}
            </ScrollArea>
          </div>

        {/* Right: Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-border/50 bg-card py-4 px-6 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      selectedConversation.type === "dm" ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {selectedConversation.type === "dm"
                        ? <span className="text-sm font-semibold text-primary">{getInitials(selectedConversation.participantName)}</span>
                        : <Briefcase className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base truncate">{selectedConversation.participantName}</h3>
                      {selectedConversation.type === "case" && isStaff && (
                        <>
                          <p className="text-xs text-muted-foreground truncate">{selectedConversation.caseTitle}</p>
                          {textingTarget?.mode === "text" ? (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Smartphone className="h-3 w-3" />
                              Texts go to {textingTarget.phone}
                            </p>
                          ) : (
                            <p className="text-xs flex items-center gap-1.5 mt-0.5 text-warning">
                              <AlertCircle className="h-3 w-3" />
                              {textingTarget?.reason}
                            </p>
                          )}
                        </>
                      )}
                      {selectedConversation.type === "dm" && (
                        <p className="text-xs text-muted-foreground">{selectedConversation._user?.email || "Direct message"}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-hidden bg-muted/10">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-6 pr-4">
                    {messages.map((msg, idx) => {
                      const isOwn = msg.sender_id === user.id
                      const senderName = isOwn ? "You" : msg.sender_user?.name || selectedConversation.participantName
                      const senderInitials = getInitials(isOwn ? user.name : senderName)
                      const fromStaff = STAFF_ROLES.has(msg.sender_user?.role || (isOwn ? user.role : ""))
                      const textStatus = isStaff && fromStaff ? describeTextStatus(msg.sms_status, msg.sms_error) : null
                      const showDateSep = idx === 0 || !isSameDay(messages[idx - 1].timestamp, msg.timestamp)
                      
                      // --- ROBUST CHECK for Document Request ---
                      const isDocumentRequest = 
                        msg.message_type === "document_request" || 
                        (msg.document_request && Array.isArray(msg.document_request.requested_documents));
                      const documentRequestTitle = getDocumentRequestTitle(user?.role);
                      const documentRequestBody = getDocumentRequestBody(user?.role, msg.document_request, {
                        clientCount: selectedConversation?._caseData?.clients?.length || 1,
                      });
                      const requestedDocuments = msg.document_request?.requested_documents || [];
                      const uploadedCount = requestedDocuments.filter(
                        (doc) => doc.status === "uploaded" || doc.status === "reviewed",
                      ).length;
                      const totalRequested = requestedDocuments.length;
                      const hasUploads = uploadedCount > 0;
                      const clientRequestCompleted =
                        msg.document_request?.status === "completed" ||
                        (totalRequested > 0 && uploadedCount === totalRequested);

                      return (
                        <div key={msg.id}>
                          {showDateSep && (
                            <div className="flex items-center gap-3 my-4">
                              <div className="flex-1 h-px bg-muted" />
                              <span className="text-[0.6875rem] font-medium text-muted-foreground px-2">{formatDateSeparator(msg.timestamp)}</span>
                              <div className="flex-1 h-px bg-muted" />
                            </div>
                          )}
                        <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`flex gap-2.5 max-w-[75%] ${isOwn ? "flex-row-reverse" : ""}`}>
                            <Avatar className="h-8 w-8 mt-0.5 shadow-sm border border-background flex-shrink-0">
                              <AvatarFallback
                                className={
                                  isOwn
                                    ? "bg-primary text-primary-foreground text-xs font-medium"
                                    : "bg-muted text-foreground text-xs font-medium"
                                }
                              >
                                {senderInitials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                              <p className={`text-[0.6875rem] font-medium text-muted-foreground px-1 ${isOwn ? "text-right" : "text-left"}`}>{senderName}</p>
                              <div
                                className={`rounded-2xl px-4 py-2.5 ${
                                  isOwn
                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                    : "bg-card border border-border text-foreground rounded-bl-sm shadow-sm"
                                }`}
                              >
                                {isDocumentRequest && (
                                  <p className="mb-1 text-xs font-semibold opacity-80">{documentRequestTitle}</p>
                                )}
                                <p className="text-sm leading-relaxed">
                                  {isDocumentRequest ? documentRequestBody : msg.content}
                                </p>
                                {isDocumentRequest && msg.document_request && (
                                  <div className="mt-2 space-y-1">
                                    {requestedDocuments.map((doc) => (
                                      <p key={doc.id} className="text-xs opacity-90">
                                        - {doc.name}
                                      </p>
                                    ))}
                                    <div className="pt-1">
                                      {STAFF_ROLES.has(user.role) ? (
                                        hasUploads ? (
                                          <Button
                                            size="sm"
                                            variant={isOwn ? "secondary" : "outline"}
                                            className="h-7"
                                            onClick={() => handleOpenReviewModal(msg.document_request)}
                                          >
                                            Review uploads
                                          </Button>
                                        ) : (
                                          <p className="text-xs opacity-90">Pending client uploads.</p>
                                        )
                                      ) : (
                                        clientRequestCompleted ? (
                                          <p className="text-xs font-medium text-green-700">
                                            Successfully uploaded document{totalRequested === 1 ? "" : "s"}.
                                          </p>
                                        ) : (
                                          msg.document_request.access_token && (
                                            <Button
                                              size="sm"
                                              variant={isOwn ? "secondary" : "outline"}
                                              className="h-7"
                                              onClick={() =>
                                                window.open(`${CLIENT_BASE_URL}/requests/${msg.document_request.access_token}`, "_blank")
                                              }
                                            >
                                              Upload documents
                                            </Button>
                                          )
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className={`flex items-center gap-1.5 px-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                                <p className="text-[0.6875rem] text-muted-foreground">{formatTime(msg.timestamp)}</p>
                                {isStaff && !fromStaff && selectedConversation.type === "case" && (
                                  <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                                    {msg.channel === "sms" && <Smartphone className="h-3 w-3" />}
                                    {msg.channel === "sms" ? "By text" : "In portal"}
                                  </span>
                                )}
                                {textStatus && (
                                  <span
                                    role="status"
                                    className={`flex items-center gap-1 text-[0.6875rem] ${
                                      textStatus.tone === "danger" ? "text-destructive font-medium"
                                        : textStatus.tone === "warning" ? "text-warning"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {textStatus.busy && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {textStatus.done && <CheckCheck className="h-3 w-3 text-success" />}
                                    {!textStatus.busy && !textStatus.done && textStatus.tone === "muted" && <Check className="h-3 w-3" />}
                                    {textStatus.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </div>

              {/* Input Area */}
              <div className="border-t border-border/50 bg-card p-4">
                <div className="flex gap-2 items-start">
                  {STAFF_ROLES.has(user.role) && selectedConversation?.type === "case" && (
                    <Button
                      onClick={() => setIsRequestingDocs(true)}
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      title="Request documents"
                      aria-label="Request documents"
                    >
                      <FilePlus className="h-4 w-4" />
                    </Button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex gap-2 items-end bg-muted/50 rounded-2xl px-4 py-2 border border-border/50 focus-within:border-primary/50 transition-colors">
                      <Textarea
                        aria-label="Message"
                        placeholder={composerPlaceholder}
                        value={newMessage}
                        rows={1}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
                        }}
                        className="min-h-0 max-h-40 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 py-1.5 dark:bg-transparent"
                      />
                      <Button
                        onClick={sendMessage}
                        size="icon"
                        aria-label={textingTarget?.mode === "text" ? "Send and text" : "Send"}
                        disabled={!newMessage.trim()}
                        className="h-9 w-9 rounded-full shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {textPreview && (
                      <div className="mt-2 px-1 flex items-start justify-between gap-4 text-xs">
                        <p className="text-muted-foreground min-w-0">
                          <span className="font-medium text-foreground">Client's phone shows: </span>
                          <span className="line-clamp-2 break-words">{textPreview.text}</span>
                        </p>
                        {textPreview.parts > 1 && (
                          <span className="shrink-0 font-medium text-warning tabular">Sends as {textPreview.parts} texts</span>
                        )}
                      </div>
                    )}
                    <p className="mt-1 px-1 text-[0.6875rem] text-muted-foreground">Enter to send, Shift+Enter for a new line</p>
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
                {isLoading ? "Loading conversations…"
                  : view === "team" ? "Choose a colleague from the list to open your conversation."
                  : "Choose a client from the list to open their conversation."}
              </p>
            </div>
          )}
        </div>
        </div>
        </Card>

      </div>

      {/* Document Request Modal */}
      <Dialog open={isRequestingDocs} onOpenChange={setIsRequestingDocs}>
        <DialogContent className="max-w-2xl h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FilePlus className="h-5 w-5 text-primary" />
              Request Documents from Client
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
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
            </div>
          </div>

          <div className="shrink-0 border-t pt-4 flex gap-3">
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
                      className="bg-card"
                    >
                      {/* This link is constructed from your API base URL and the file_path from the DB.
                        It opens the file in a new tab.
                      */}
                      <a 
                        href={`${API_BASE_URL}/documents/${doc.id}/download`} 
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
    </MainLayout>
  )
}
