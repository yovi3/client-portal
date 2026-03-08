"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import MainLayout from "../components/layout/MainLayout"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { Label } from "../components/ui/label"
import { Badge } from "../components/ui/badge"
import { ArrowLeft, X, Search } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { motion } from "framer-motion"
import { apiFetch } from "@/lib/api"

export default function CreateCase() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
  })

  // Search inputs and results
  const [personnelSearch, setPersonnelSearch] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [personnelResults, setPersonnelResults] = useState([])
  const [clientResults, setClientResults] = useState([])

  // Selected lists
  const [selectedPersonnel, setSelectedPersonnel] = useState([])
  const [selectedClients, setSelectedClients] = useState([])

  // Helper to update basic fields
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // --- Live search for personnel ---
  useEffect(() => {
    const q = personnelSearch.trim()
    if (q.length < 2) {
      setPersonnelResults([])
      return
    }
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch(`/available-personnel?search=${encodeURIComponent(q)}`)
        if (!res.ok) return setPersonnelResults([])
        const data = await res.json()
        setPersonnelResults(data || [])
      } catch (err) {
        console.error("Personnel search error:", err)
        setPersonnelResults([])
      }
    }, 300)
    return () => clearTimeout(id)
  }, [personnelSearch])

  // --- Live search for clients ---
  useEffect(() => {
    const q = clientSearch.trim()
    if (q.length < 2) {
      setClientResults([])
      return
    }
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch(`/available-clients?search=${encodeURIComponent(q)}`)
        if (!res.ok) return setClientResults([])
        const data = await res.json()
        setClientResults(data || [])
      } catch (err) {
        console.error("Client search error:", err)
        setClientResults([])
      }
    }, 300)
    return () => clearTimeout(id)
  }, [clientSearch])

  // Add/remove helpers
  const addPersonnel = (p) => {
    if (!p || !p.id) return
    if (!selectedPersonnel.some((x) => x.id === p.id)) {
      setSelectedPersonnel((prev) => [...prev, p])
    }
    setPersonnelSearch("")
    setPersonnelResults([])
  }

  const removePersonnel = (id) => {
    setSelectedPersonnel((prev) => prev.filter((p) => p.id !== id))
  }

  const addClient = (c) => {
    if (!c || !c.id) return
    if (!selectedClients.some((x) => x.id === c.id)) {
      setSelectedClients((prev) => [...prev, { ...c, case_role: "client" }])
    }
    setClientSearch("")
    setClientResults([])
  }

  const removeClient = (id) => {
    setSelectedClients((prev) => prev.filter((c) => c.id !== id))
  }

  const updateClientRole = (id, roleType) => {
    setSelectedClients((prev) =>
      prev.map((client) => (client.id === id ? { ...client, case_role: roleType } : client)),
    )
  }

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (selectedClients.length === 0 || selectedPersonnel.length === 0) {
      alert("Please assign at least one client and one personnel.")
      return
    }

    const payload = {
      title: formData.title,
      description: formData.description,
      category: formData.category || null,
      personnel_ids: selectedPersonnel.map((p) => p.id),
      client_assignments: selectedClients.map((c) => ({
        user_id: c.id,
        role_type: c.case_role || "client",
      })),
    }

    try {
      const res = await apiFetch("/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error("Create case failed:", err)
        alert("Failed to create case. See console for details.")
        return
      }

      const created = await res.json()
      navigate(`/cases/${created.id}`)
    } catch (err) {
      console.error("Create case error:", err)
      alert("Failed to create case. See console for details.")
    }
  }

  return (
    <MainLayout>
      <motion.div
        className="p-6 max-w-6xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Button variant="ghost" onClick={() => navigate("/cases")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cases
        </Button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Create New Case</h1>
          <p className="text-muted-foreground text-lg">Fill in the details below to initiate a new injury case</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Case information */}
          <Card className="border-2">
            <CardHeader className="bg-muted/30">
              <CardTitle className="text-xl">Case Information</CardTitle>
              <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                Case Number and Case Serial are generated automatically after creation.
              </p>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Case Title *</Label>
                <Input
                  required
                  placeholder="e.g., Smith vs. Johnson"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Description *</Label>
                <Textarea
                  required
                  placeholder="Case description..."
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  className="min-h-32"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Category</Label>
                  <Input
                    placeholder="e.g., Property, Criminal..."
                    value={formData.category}
                    onChange={(e) => handleInputChange("category", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personnel + Clients row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personnel */}
            <Card className="border-2">
              <CardHeader className="bg-muted/30">
                <CardTitle className="text-xl">Assign Personnel</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search personnel (min 2 chars)"
                    value={personnelSearch}
                    onChange={(e) => setPersonnelSearch(e.target.value)}
                  />
                  <Search className="w-5 h-5 mt-2 text-muted-foreground" />
                </div>

                {personnelResults.length > 0 && (
                  <div className="border rounded p-2 space-y-1 max-h-48 overflow-y-auto">
                    {personnelResults.map((p) => (
                      <div
                        key={p.id}
                        className="p-2 hover:bg-muted/50 rounded cursor-pointer flex items-center justify-between"
                        onClick={() => addPersonnel(p)}
                      >
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.email || ""}</div>
                        </div>
                        <div className="text-sm text-primary">Add</div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedPersonnel.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedPersonnel.map((p) => (
                      <Badge key={p.id} variant="secondary" className="text-sm px-3 py-1.5">
                        {p.name}
                        <button type="button" onClick={() => removePersonnel(p.id)} className="ml-2 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clients */}
            <Card className="border-2">
              <CardHeader className="bg-muted/30">
                <CardTitle className="text-xl">Assign Clients</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search clients (min 2 chars)"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <Search className="w-5 h-5 mt-2 text-muted-foreground" />
                </div>

                {clientResults.length > 0 && (
                  <div className="border rounded p-2 space-y-1 max-h-48 overflow-y-auto">
                    {clientResults.map((c) => (
                      <div
                        key={c.id}
                        className="p-2 hover:bg-muted/50 rounded cursor-pointer flex items-center justify-between"
                        onClick={() => addClient(c)}
                      >
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.email || ""}</div>
                        </div>
                        <div className="text-sm text-primary">Add</div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedClients.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {selectedClients.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border p-2">
                        <Badge variant="secondary" className="text-sm px-3 py-1.5">
                          {c.name}
                        </Badge>
                        <Select value={c.case_role || "client"} onValueChange={(value) => updateClientRole(c.id, value)}>
                          <SelectTrigger className="w-[170px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">client</SelectItem>
                            <SelectItem value="spouse">spouse</SelectItem>
                            <SelectItem value="legal guardian">legal guardian</SelectItem>
                            <SelectItem value="other">other</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeClient(c.id)} className="ml-auto h-7 w-7">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => navigate("/cases")} size="lg">
              Cancel
            </Button>
            <Button type="submit" size="lg">
              Create Case
            </Button>
          </div>
        </form>
      </motion.div>
    </MainLayout>
  )
}
