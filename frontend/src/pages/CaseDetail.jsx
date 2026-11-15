import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  UserPlus,
  Plus,
  FileText,
  Download,
  Loader2,
  X,
  MessageSquare,
  Search,
  Send,
  Briefcase,
  Hash,
  Tag,
  Mail,
} from "lucide-react"
import MainLayout from "../components/layout/MainLayout"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"
import { Avatar, AvatarFallback } from "../components/ui/avatar"
import { Badge } from "../components/ui/badge"
import { ScrollArea } from "../components/ui/scroll-area"
import { API_BASE_URL, getWsBaseUrl, apiFetch } from "@/lib/api"
import { getStoredUser, fetchCurrentUser } from "@/lib/auth"
import { toast } from "sonner"

const getInitials = (name) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2)

const formatTime = (timestamp) => {
  if (!timestamp) return ""
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
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

const isSameDay = (a, b) => {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export default function CaseDetail() {
  const navigate = useNavigate()
  const { id } = useParams()

  // --- Main Data States ---
  const [caseData, setCaseData] = useState(null)
  const [personnel, setPersonnel] = useState([])
  const [clients, setClients] = useState([])
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // --- Modal & Search States ---
  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)

  const [personnelSearch, setPersonnelSearch] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [clientRoleToAssign, setClientRoleToAssign] = useState("client")

  const [searchResultsPersonnel, setSearchResultsPersonnel] = useState([])
  const [searchResultsClients, setSearchResultsClients] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [actionKey, setActionKey] = useState("")

  // --- Chat States ---
  const [currentUser, setCurrentUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const messagesEndRef = useRef(null)
  const ws = useRef(null)

  const fetchCaseDocuments = useCallback(async () => {
    if (!id) return
    try {
      const res = await apiFetch(`/cases/${id}/requests`)
      if (!res.ok) return
      const requests = await res.json()
      const docs =
        requests?.flatMap((req) => req?.requested_documents || []) || []
      setDocuments(docs)
    } catch {
      toast.error("Failed to load documents")
    }
  }, [id])

  useEffect(() => {
    const stored = getStoredUser()
    if (stored) {
      setCurrentUser(stored)
      return
    }
    fetchCurrentUser().then((u) => setCurrentUser(u))
  }, [])

  const fetchCaseDetails = useCallback(async () => {
    try {
      const caseRes = await apiFetch(`/cases/${id}`)
      if (!caseRes.ok) throw new Error("Case not found")

      const data = await caseRes.json()

      setCaseData(data || {})
      setPersonnel(data?.personnel || [])
      setClients(data?.clients || [])
    } catch {
      toast.error("Failed to load case")
      setCaseData(null)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) fetchCaseDetails()
  }, [id, fetchCaseDetails])

  useEffect(() => {
    fetchCaseDocuments()
  }, [fetchCaseDocuments])

  // --- Chat fetch history ---
  useEffect(() => {
    if (!id) return
    const fetchMessages = async () => {
      try {
        const res = await apiFetch(`/cases/${id}/messages`)
        if (res.ok) {
          const data = await res.json()
          setMessages(Array.isArray(data) ? data : [])
        }
      } catch {
        toast.error("Failed to load messages")
      }
    }
    fetchMessages()
  }, [id])

  // --- WebSocket ---
  useEffect(() => {
    if (!id || !currentUser) return

    const wsUrl = `${getWsBaseUrl()}/ws/${id}`
    ws.current = new WebSocket(wsUrl)

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === "sms_status") {
          // Text delivery update for a message already on screen
          setMessages((prev) => prev.map((m) => m.id === msg.message_id
            ? { ...m, sms_status: msg.sms_status, sms_error: msg.sms_error } : m))
          return
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      } catch (e) {
        console.error("WS Message Parse Error", e)
      }
    }

    return () => {
      ws.current?.close()
    }
  }, [id, currentUser])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const senderLookup = useMemo(() => {
    const map = new Map()
    personnel.forEach((p) => map.set(p.id, p.name))
    clients.forEach((c) => map.set(c.id, c.name))
    return map
  }, [personnel, clients])

  const getSenderName = useCallback(
    (msg) => {
      if (currentUser && msg.sender_id === currentUser.id) return "You"
      if (msg.sender_user?.name) return msg.sender_user.name
      return senderLookup.get(msg.sender_id) || "Unknown"
    },
    [currentUser, senderLookup]
  )

  const sendMessage = () => {
    const text = newMessage.trim()
    if (!text || !ws.current || ws.current.readyState !== WebSocket.OPEN || !currentUser) return
    ws.current.send(
      JSON.stringify({
        content: text,
        sender_id: currentUser.id,
      })
    )
    setNewMessage("")
  }

  // --- Search Personnel ---
  useEffect(() => {
    const searchPersonnel = async () => {
      if (!addPersonnelOpen) return
      setIsSearching(true)
      try {
        const res = await apiFetch(
          `/available-personnel?search=${personnelSearch}`
        )
        if (res.ok) {
          const data = await res.json()
          const filtered = data.filter(
            (u) => !personnel.some((p) => p.id === u.id)
          )
          setSearchResultsPersonnel(filtered)
        }
      } catch (error) {
        console.error("Search error", error)
      } finally {
        setIsSearching(false)
      }
    }

    const timeoutId = setTimeout(searchPersonnel, 300)
    return () => clearTimeout(timeoutId)
  }, [personnelSearch, addPersonnelOpen, personnel])

  // --- Search Clients ---
  useEffect(() => {
    const searchClients = async () => {
      if (!addClientOpen) return
      setIsSearching(true)
      try {
        const res = await apiFetch(`/available-clients?search=${clientSearch}`)
        if (res.ok) {
          const data = await res.json()
          const filtered = data.filter(
            (u) => !clients.some((c) => c.id === u.id)
          )
          setSearchResultsClients(filtered)
        }
      } catch (error) {
        console.error("Search error", error)
      } finally {
        setIsSearching(false)
      }
    }

    const timeoutId = setTimeout(searchClients, 300)
    return () => clearTimeout(timeoutId)
  }, [clientSearch, addClientOpen, clients])

  const handleAddPersonnel = async (user) => {
    const roleToAssign = user.role || "staff"
    setActionKey(`add-personnel-${user.id}`)
    try {
      const res = await apiFetch(
        `/cases/${id}/personnel?user_id=${user.id}&role=${roleToAssign}`,
        { method: "POST" }
      )

      if (res.ok) {
        await fetchCaseDetails()
        await fetchCaseDocuments()
        toast.success("Personnel assigned")
        setAddPersonnelOpen(false)
        setPersonnelSearch("")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.detail || "Failed to assign personnel")
      }
    } catch {
      toast.error("Failed to assign personnel")
    } finally {
      setActionKey("")
    }
  }

  const handleRemovePersonnel = async (personnelId) => {
    setActionKey(`remove-personnel-${personnelId}`)
    try {
      const res = await apiFetch(`/cases/${id}/personnel/${personnelId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setPersonnel((prev) => prev.filter((p) => p.id !== personnelId))
        await fetchCaseDocuments()
        toast.success("Personnel removed")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.detail || "Failed to remove personnel")
      }
    } catch {
      toast.error("Failed to remove personnel")
    } finally {
      setActionKey("")
    }
  }

  const handleAddClient = async (user) => {
    setActionKey(`add-client-${user.id}`)
    try {
      const res = await apiFetch(
        `/cases/${id}/clients?user_id=${user.id}&role_type=${encodeURIComponent(
          clientRoleToAssign
        )}`,
        { method: "POST" }
      )

      if (res.ok) {
        await fetchCaseDetails()
        await fetchCaseDocuments()
        toast.success("Client assigned")
        setAddClientOpen(false)
        setClientSearch("")
        setClientRoleToAssign("client")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.detail || "Failed to assign client")
      }
    } catch {
      toast.error("Failed to assign client")
    } finally {
      setActionKey("")
    }
  }

  const handleRemoveClient = async (clientId) => {
    setActionKey(`remove-client-${clientId}`)
    try {
      const res = await apiFetch(`/cases/${id}/clients/${clientId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setClients((prev) => prev.filter((c) => c.id !== clientId))
        await fetchCaseDocuments()
        toast.success("Client removed")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.detail || "Failed to remove client")
      }
    } catch {
      toast.error("Failed to remove client")
    } finally {
      setActionKey("")
    }
  }

  const handleDocumentDownload = (doc) => {
    if (!doc?.file_path) return
    window.open(`${API_BASE_URL}/documents/${doc.id}/download`, "_blank")
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Loading case details...</p>
        </div>
      </MainLayout>
    )
  }

  if (!caseData) {
    return (
      <MainLayout>
        <div className="p-6 text-center py-16">
          <p className="text-base font-semibold text-foreground mb-3">
            Case not found
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/cases")}
          >
            Back to Cases
          </Button>
        </div>
      </MainLayout>
    )
  }

  const canManageCase = currentUser && currentUser.role !== "client"
  const primaryClient = clients?.[0]

  return (
    <MainLayout>
      <div className="p-6 space-y-5">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/cases")}
            className="h-9 w-9 -ml-2 shrink-0 cursor-pointer"
            aria-label="Back to cases"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.375rem] font-bold tracking-tight text-foreground leading-tight truncate">
              {caseData?.title || "Untitled Case"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {caseData?.lawbase_case_number && (
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {caseData.lawbase_case_number}
                </span>
              )}
              {caseData?.case_type && (
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {caseData.case_type}
                </span>
              )}
              {primaryClient && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {primaryClient.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] gap-5 lg:h-[calc(100vh-11rem)]"
        >
          {/* === LEFT: INFO === */}
          <div className="space-y-4 min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1 -mr-1">

            {/* Case details */}
            <Card className="border-border shadow-none">
              <CardHeader className="px-5 py-3 border-b border-border">
                <CardTitle className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Case Details
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-4">
                {caseData?.description ? (
                  <p className="text-sm text-foreground leading-relaxed">
                    {caseData.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No description provided.
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Type
                    </p>
                    <p className="text-sm text-foreground mt-0.5">
                      {caseData?.case_type || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Lawbase #
                    </p>
                    <p className="text-sm text-foreground mt-0.5">
                      {caseData?.lawbase_case_number || "—"}
                    </p>
                  </div>
                  {caseData?.status && (
                    <div>
                      <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Status
                      </p>
                      <Badge
                        variant="secondary"
                        className="mt-0.5 capitalize font-medium"
                      >
                        {caseData.status}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team + Client side-by-side on wide screens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* DSS Team */}
              <Card className="border-border shadow-none">
                <CardHeader className="px-5 py-3 border-b border-border flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    DSS Team
                    <span className="ml-1.5 text-muted-foreground/60 font-medium normal-case tracking-normal">
                      ({personnel?.length || 0})
                    </span>
                  </CardTitle>
                  {canManageCase && (
                    <Dialog
                      open={addPersonnelOpen}
                      onOpenChange={setAddPersonnelOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 -mr-1 cursor-pointer"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                          <DialogTitle>Add Personnel</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 py-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search available personnel..."
                              className="pl-9"
                              value={personnelSearch}
                              onChange={(e) =>
                                setPersonnelSearch(e.target.value)
                              }
                            />
                          </div>
                          <div className="border rounded-md h-[220px] overflow-y-auto p-1">
                            {isSearching ? (
                              <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            ) : searchResultsPersonnel.length === 0 ? (
                              <div className="py-4 px-3 flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                  No matching personnel found.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate("/admin-dashboard")}
                                >
                                  Invite User
                                </Button>
                              </div>
                            ) : (
                              searchResultsPersonnel.map((person) => (
                                <div
                                  key={person.id}
                                  className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer group"
                                  onClick={() => handleAddPersonnel(person)}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="bg-primary/10 text-primary text-[0.6875rem] font-semibold">
                                        {getInitials(person.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium leading-none">
                                        {person.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground capitalize mt-0.5">
                                        {person.role || "No Role"}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                    disabled={
                                      actionKey ===
                                      `add-personnel-${person.id}`
                                    }
                                  >
                                    <Plus className="h-3.5 w-3.5" />
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
                <CardContent className="p-0">
                  {personnel?.length === 0 ? (
                    <div className="px-5 py-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        No personnel assigned
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {personnel.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between px-5 py-2.5 group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-[0.6875rem] font-semibold">
                                {getInitials(p.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground leading-tight truncate">
                                {p.name}
                              </p>
                              <p className="text-xs capitalize text-muted-foreground mt-0.5">
                                {p.role || "staff"}
                              </p>
                            </div>
                          </div>
                          {canManageCase && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              onClick={() => handleRemovePersonnel(p.id)}
                              disabled={actionKey === `remove-personnel-${p.id}`}
                            >
                              {actionKey === `remove-personnel-${p.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Clients */}
              <Card className="border-border shadow-none">
                <CardHeader className="px-5 py-3 border-b border-border flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Clients
                    <span className="ml-1.5 text-muted-foreground/60 font-medium normal-case tracking-normal">
                      ({clients?.length || 0})
                    </span>
                  </CardTitle>
                  {canManageCase && (
                    <Dialog
                      open={addClientOpen}
                      onOpenChange={setAddClientOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 -mr-1 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                          <DialogTitle>Add Client</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 py-2">
                          <div className="space-y-1">
                            <Label>Client Role in Case</Label>
                            <Select
                              value={clientRoleToAssign}
                              onValueChange={setClientRoleToAssign}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="client">client</SelectItem>
                                <SelectItem value="spouse">spouse</SelectItem>
                                <SelectItem value="legal guardian">
                                  legal guardian
                                </SelectItem>
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
                          <div className="border rounded-md h-[220px] overflow-y-auto p-1">
                            {isSearching ? (
                              <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            ) : searchResultsClients.length === 0 ? (
                              <div className="py-4 px-3 flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                  No matching clients found.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate("/clients")}
                                >
                                  Invite Client
                                </Button>
                              </div>
                            ) : (
                              searchResultsClients.map((client) => (
                                <div
                                  key={client.id}
                                  className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer group"
                                  onClick={() => handleAddClient(client)}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="bg-muted text-foreground text-[0.6875rem] font-semibold">
                                        {getInitials(client.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="overflow-hidden">
                                      <p className="text-sm font-medium leading-none truncate">
                                        {client.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {client.email}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                    disabled={
                                      actionKey === `add-client-${client.id}`
                                    }
                                  >
                                    <Plus className="h-3.5 w-3.5" />
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
                <CardContent className="p-0">
                  {clients?.length === 0 ? (
                    <div className="px-5 py-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        No clients assigned
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {clients.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between px-5 py-2.5 group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-muted text-foreground text-[0.6875rem] font-semibold">
                                {getInitials(c.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground leading-tight truncate">
                                {c.name}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{c.email}</span>
                                <span className="text-muted-foreground/60">·</span>
                                <span className="capitalize">
                                  {c.case_role || "client"}
                                </span>
                              </p>
                            </div>
                          </div>
                          {canManageCase && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                              onClick={() => handleRemoveClient(c.id)}
                              disabled={actionKey === `remove-client-${c.id}`}
                            >
                              {actionKey === `remove-client-${c.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Documents */}
            <Card className="border-border shadow-none">
              <CardHeader className="px-5 py-3 border-b border-border">
                <CardTitle className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Documents
                  <span className="ml-1.5 text-muted-foreground/60 font-medium normal-case tracking-normal">
                    ({documents?.length || 0})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {documents?.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <FileText className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      No document requests
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {documents.map((doc) => {
                      const uploaded = !!doc.file_path
                      return (
                        <li
                          key={doc.id}
                          className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/50/60 gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                                uploaded
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-sm text-foreground truncate">
                              {doc.name}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {uploaded ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs cursor-pointer"
                                onClick={() => handleDocumentDownload(doc)}
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                Download
                              </Button>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[0.625rem] text-amber-700 bg-amber-50 border-amber-200 font-medium"
                              >
                                Required
                              </Badge>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* === RIGHT: CHAT === */}
          <Card className="border-border shadow-none overflow-hidden flex flex-col lg:h-full h-[600px]">
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-card shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    Conversation
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {personnel?.length || 0} team · {clients?.length || 0}{" "}
                    client{(clients?.length || 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => navigate(`/messages?case_id=${id}`)}
              >
                Open full
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-hidden bg-muted/40">
              <ScrollArea className="h-full">
                <div className="px-4 py-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">No messages yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Send the first message below
                      </p>
                    </div>
                  ) : (
                    messages.slice(-50).map((msg, idx, arr) => {
                      const isMe =
                        currentUser && msg.sender_id === currentUser.id
                      const senderName = getSenderName(msg)
                      const isDocumentRequest =
                        msg.message_type === "document_request"
                      const prev = arr[idx - 1]
                      const showDate =
                        idx === 0 || !isSameDay(prev?.timestamp, msg.timestamp)

                      return (
                        <div key={msg.id}>
                          {showDate && msg.timestamp && (
                            <div className="flex items-center gap-3 my-3">
                              <div className="flex-1 h-px bg-muted" />
                              <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
                                {formatDateSeparator(msg.timestamp)}
                              </span>
                              <div className="flex-1 h-px bg-muted" />
                            </div>
                          )}
                          <div
                            className={`flex ${
                              isMe ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`flex gap-2 max-w-[85%] ${
                                isMe ? "flex-row-reverse" : "flex-row"
                              }`}
                            >
                              <Avatar className="h-7 w-7 mt-0.5 shrink-0">
                                <AvatarFallback
                                  className={
                                    isMe
                                      ? "bg-primary text-primary-foreground text-[0.625rem] font-semibold"
                                      : "bg-muted text-foreground text-[0.625rem] font-semibold"
                                  }
                                >
                                  {getInitials(senderName)}
                                </AvatarFallback>
                              </Avatar>
                              <div
                                className={`space-y-0.5 min-w-0 ${
                                  isMe ? "items-end" : "items-start"
                                } flex flex-col`}
                              >
                                <p
                                  className={`text-[0.625rem] font-medium text-muted-foreground px-1 ${
                                    isMe ? "text-right" : "text-left"
                                  }`}
                                >
                                  {senderName}
                                </p>
                                <div
                                  className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                                    isMe
                                      ? "bg-primary text-primary-foreground rounded-br-sm"
                                      : "bg-card border border-border text-foreground rounded-bl-sm"
                                  }`}
                                >
                                  {isDocumentRequest ? (
                                    <span className="inline-flex items-center gap-1.5 italic opacity-90">
                                      <FileText className="h-3.5 w-3.5" />
                                      Document request
                                    </span>
                                  ) : (
                                    <span>{msg.content}</span>
                                  )}
                                </div>
                                <p
                                  className={`text-[0.625rem] text-muted-foreground px-1 ${
                                    isMe ? "text-right" : "text-left"
                                  }`}
                                >
                                  {formatTime(msg.timestamp)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-border bg-card shrink-0">
              <div className="flex gap-2 items-center bg-muted/40 rounded-full pl-4 pr-1 py-1 border border-transparent focus-within:border-primary/40 focus-within:bg-card transition-colors">
                <Input
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-8 text-sm"
                />
                <Button
                  onClick={sendMessage}
                  size="icon"
                  disabled={!newMessage.trim()}
                  className="h-8 w-8 rounded-full shrink-0 cursor-pointer"
                  aria-label="Send message"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
