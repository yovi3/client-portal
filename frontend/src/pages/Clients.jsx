"use client"

import { useEffect, useMemo, useState } from "react"
import MainLayout from "@/components/layout/MainLayout"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Search, Edit2, Trash2, Phone, Mail, MapPin, User, Loader2, Send } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"

const EMPTY_EDIT_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  street_1: "",
  street_2: "",
  city: "",
  state: "",
  zip_code: "",
  country: "",
}

const EMPTY_INVITE_FORM = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  street_1: "",
  street_2: "",
  city: "",
  state: "",
  zip_code: "",
  country: "US",
}

const formatAddress = (profile = {}) => {
  const line1 = [profile.street_1, profile.street_2].filter(Boolean).join(", ")
  const line2 = [profile.city, profile.state, profile.zip_code].filter(Boolean).join(" ")
  return [line1, line2, profile.country].filter(Boolean).join(", ")
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [actionKey, setActionKey] = useState("")

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [currentClientId, setCurrentClientId] = useState(null)
  const [editFormData, setEditFormData] = useState(EMPTY_EDIT_FORM)

  const [canInvite, setCanInvite] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteFormData, setInviteFormData] = useState(EMPTY_INVITE_FORM)

  const fetchClients = async () => {
    setIsLoading(true)
    try {
      const res = await apiFetch("/clients")
      if (!res.ok) throw new Error("Failed to load clients")
      const data = await res.json()
      setClients(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err?.message || "Failed to load clients")
    } finally {
      setIsLoading(false)
    }
  }

  const checkInvitePermission = async () => {
    try {
      const res = await apiFetch("/invites?limit=1")
      setCanInvite(res.ok)
    } catch {
      setCanInvite(false)
    }
  }

  useEffect(() => {
    fetchClients()
    checkInvitePermission()
  }, [])

  const filteredClients = useMemo(() => {
    const lower = searchQuery.toLowerCase()
    return clients.filter((entry) => {
      const fullName = `${entry.first_name || ""} ${entry.last_name || ""}`.trim()
      return (
        fullName.toLowerCase().includes(lower) ||
        (entry.name || "").toLowerCase().includes(lower) ||
        (entry.email || "").toLowerCase().includes(lower) ||
        (entry.client_profile?.phone || "").toLowerCase().includes(lower)
      )
    })
  }, [clients, searchQuery])

  const openEditModal = (client) => {
    setCurrentClientId(client.id)
    setEditFormData({
      first_name: client.first_name || "",
      last_name: client.last_name || "",
      email: client.email || "",
      phone: client.client_profile?.phone || "",
      street_1: client.client_profile?.street_1 || client.client_profile?.address || "",
      street_2: client.client_profile?.street_2 || "",
      city: client.client_profile?.city || "",
      state: client.client_profile?.state || "",
      zip_code: client.client_profile?.zip_code || "",
      country: client.client_profile?.country || "",
    })
    setIsEditModalOpen(true)
  }

  const handleEditInputChange = (event) => {
    const { id, value } = event.target
    setEditFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleInviteInputChange = (event) => {
    const { id, value } = event.target
    setInviteFormData((prev) => ({ ...prev, [id]: value }))
  }

  const withAction = async (key, callback) => {
    setActionKey(key)
    try {
      await callback()
    } finally {
      setActionKey("")
    }
  }

  const handleSaveClient = async () => {
    if (!currentClientId) return
    if (!editFormData.first_name.trim() || !editFormData.last_name.trim() || !editFormData.email.trim()) {
      toast.error("First name, last name and email are required.")
      return
    }

    await withAction(`save-${currentClientId}`, async () => {
      const res = await apiFetch(`/clients/${currentClientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editFormData.first_name.trim(),
          last_name: editFormData.last_name.trim(),
          email: editFormData.email.trim(),
          phone: editFormData.phone.trim() || null,
          street_1: editFormData.street_1.trim() || null,
          street_2: editFormData.street_2.trim() || null,
          city: editFormData.city.trim() || null,
          state: editFormData.state.trim() || null,
          zip_code: editFormData.zip_code.trim() || null,
          country: editFormData.country.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || "Failed to update client")
      }
      toast.success("Client updated")
      setIsEditModalOpen(false)
      await fetchClients()
    }).catch((err) => toast.error(err?.message || "Failed to update client"))
  }

  const handleDeleteClient = async (id) => {
    if (!window.confirm("Are you sure you want to delete this client?")) return

    await withAction(`delete-${id}`, async () => {
      const res = await apiFetch(`/clients/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || "Failed to delete client")
      }
      setClients((prev) => prev.filter((entry) => entry.id !== id))
      toast.success("Client deleted")
    }).catch((err) => toast.error(err?.message || "Failed to delete client"))
  }

  const handleInviteClient = async () => {
    if (!inviteFormData.email.trim()) {
      toast.error("Email is required")
      return
    }

    await withAction("invite-client", async () => {
      const res = await apiFetch("/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "client",
          email: inviteFormData.email.trim(),
          first_name: inviteFormData.first_name.trim() || null,
          last_name: inviteFormData.last_name.trim() || null,
          phone: inviteFormData.phone.trim() || null,
          street_1: inviteFormData.street_1.trim() || null,
          street_2: inviteFormData.street_2.trim() || null,
          city: inviteFormData.city.trim() || null,
          state: inviteFormData.state.trim() || null,
          zip_code: inviteFormData.zip_code.trim() || null,
          country: inviteFormData.country.trim() || null,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "Failed to send invite")

      if (data?.invite_url) {
        try {
          await navigator.clipboard.writeText(data.invite_url)
          toast.success("Invite sent and link copied")
        } catch {
          toast.success("Invite sent")
        }
      } else {
        toast.success("Invite sent")
      }

      setInviteFormData(EMPTY_INVITE_FORM)
      setInviteModalOpen(false)
    }).catch((err) => toast.error(err?.message || "Failed to send invite"))
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Clients</h1>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              className="pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClients.map((client) => {
              const fullName = `${client.first_name || ""} ${client.last_name || ""}`.trim() || client.name
              const fullAddress = formatAddress(client.client_profile || {})
              return (
                <Card key={client.id} className="border-border shadow-none hover:shadow-sm transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <span className="truncate">{fullName || "Unnamed client"}</span>
                      </div>
                      <Badge variant="outline">client</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {client.email}</p>
                    {client.client_profile?.phone ? (
                      <p className="text-sm flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {client.client_profile.phone}</p>
                    ) : null}
                    {fullAddress ? (
                      <p className="text-sm flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> {fullAddress}</p>
                    ) : null}
                    <div className="flex gap-2 pt-3">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditModal(client)}>
                        <Edit2 className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleDeleteClient(client.id)}
                        disabled={actionKey === `delete-${client.id}`}
                      >
                        {actionKey === `delete-${client.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" /> Delete</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <User className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No clients found</p>
            {searchQuery && <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>}
          </div>
        )}

        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Edit Client</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input id="first_name" value={editFormData.first_name} onChange={handleEditInputChange} />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input id="last_name" value={editFormData.last_name} onChange={handleEditInputChange} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={editFormData.email} onChange={handleEditInputChange} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={editFormData.phone} onChange={handleEditInputChange} />
              </div>
              <Input id="street_1" placeholder="Street 1" value={editFormData.street_1} onChange={handleEditInputChange} />
              <Input id="street_2" placeholder="Street 2" value={editFormData.street_2} onChange={handleEditInputChange} />
              <Input id="city" placeholder="City" value={editFormData.city} onChange={handleEditInputChange} />
              <Input id="state" placeholder="State" value={editFormData.state} onChange={handleEditInputChange} />
              <Input id="zip_code" placeholder="ZIP Code" value={editFormData.zip_code} onChange={handleEditInputChange} />
              <Input id="country" placeholder="Country" value={editFormData.country} onChange={handleEditInputChange} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveClient} disabled={actionKey.startsWith("save-")}>
                {actionKey.startsWith("save-") ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}
