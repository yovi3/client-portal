"use client"

import { useEffect, useState } from "react"
import MainLayout from "@/components/layout/MainLayout"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, User, Loader2, Briefcase, Scale } from "lucide-react"
import { motion as Motion, AnimatePresence } from "framer-motion"
import { apiFetch } from "@/lib/api"

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [filteredContacts, setFilteredContacts] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentContactId, setCurrentContactId] = useState(null)

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  })

  // Fetch Contacts
  const fetchContacts = async () => {
    setIsLoading(true)
    try {
      const res = await apiFetch("/clients")
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
        setFilteredContacts(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchContacts()
  }, [])

  // Filter Logic
  useEffect(() => {
    const lowerQuery = searchQuery.toLowerCase()
    const filtered = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.email.toLowerCase().includes(lowerQuery) ||
        (c.client_profile?.phone && c.client_profile.phone.includes(lowerQuery)),
    )
    setFilteredContacts(filtered)
  }, [searchQuery, contacts])

  // Handle Form Input
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  // Open Modal for Add
  const openAddModal = () => {
    setIsEditing(false)
    setFormData({ name: "", email: "", phone: "", address: "" })
    setIsModalOpen(true)
  }

  // Open Modal for Edit
  const openEditModal = (contact) => {
    setIsEditing(true)
    setCurrentContactId(contact.id)
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.client_profile?.phone || "",
      address: contact.client_profile?.address || "",
    })
    setIsModalOpen(true)
  }

  // Submit Form (Create or Update)
  const handleSubmit = async () => {
    if (!formData.name || !formData.email) return

    try {
      let url = "/clients"
      let method = "POST"
      let body = {}

      if (isEditing) {
        url = `/clients/${currentContactId}`
        method = "PUT"
        body = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
        }
      } else {
        body = {
          email: formData.email,
          name: formData.name,
          password: "tempPassword123",
          role: "client",
          profile_data: {
            phone: formData.phone,
            address: formData.address,
          },
        }
      }

      const res = await apiFetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        fetchContacts()
        setIsModalOpen(false)
      } else {
        console.error("Failed to save contact")
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Handle Delete
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this contact?")) return

    try {
      const res = await apiFetch(`/clients/${id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id))
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <MainLayout>
      <Motion.div
        className="p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddModal} size="lg" className="gap-2 shadow-sm">
                  <Plus className="h-4 w-4" /> New Contact
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="text-xl">{isEditing ? "Edit Contact" : "Add New Contact"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="John Doe"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 123-4567"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-sm font-medium">
                      Address
                    </Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="123 Main Street, City, State"
                      className="h-10"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={!formData.name || !formData.email}>
                    {isEditing ? "Save Changes" : "Create Contact"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative max-w-md mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              className="pl-10 h-11 shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading contacts...</p>
          </div>
        ) : filteredContacts.length > 0 ? (
          <AnimatePresence mode="popLayout">
            <Motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" layout>
              {filteredContacts.map((c, idx) => (
                <Motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  layout
                >
                  <Card className="hover:shadow-lg transition-all duration-300 group border-muted h-full flex flex-col pb-0">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                            <span className="text-primary font-semibold text-base">
                              {c.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-semibold text-base truncate">{c.name}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-primary/10"
                            onClick={() => openEditModal(c)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3 text-sm flex-1">
                      <div className="flex items-start gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground break-all">{c.email || "N/A"}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">{c.client_profile?.phone || "No phone"}</span>
                      </div>

                      {c.client_profile?.address && (
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground text-sm leading-relaxed">
                            {c.client_profile.address}
                          </span>
                        </div>
                      )}
                    </CardContent>

                    <div className="border-t bg-muted/30 px-6 py-3 flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Scale className="h-3.5 w-3.5" />
                        <span>Active Cases</span>
                      </div>
                      <Badge variant="secondary" className="font-mono font-medium">
                        {c.client_profile?.active_cases || 0}
                      </Badge>
                    </div>
                  </Card>
                </Motion.div>
              ))}
            </Motion.div>
          </AnimatePresence>
        ) : (
          /* Enhanced empty state with better visual appeal */
          <Motion.div
            className="text-center py-16 bg-muted/20 rounded-xl border-2 border-dashed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <User className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No contacts found</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {searchQuery ? "Try adjusting your search terms" : "Get started by adding your first contact"}
            </p>
            {!searchQuery && (
              <Button onClick={openAddModal} className="gap-2">
                <Plus className="h-4 w-4" /> Add Your First Contact
              </Button>
            )}
          </Motion.div>
        )}
      </Motion.div>
    </MainLayout>
  )
}
