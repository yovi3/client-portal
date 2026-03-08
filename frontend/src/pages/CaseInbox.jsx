"use client"

import { useEffect, useMemo, useState } from "react"
import MainLayout from "@/components/layout/MainLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw } from "lucide-react"
import { apiFetch } from "@/lib/api"

export default function CaseInbox() {
  const [threads, setThreads] = useState([])
  const [selectedThreadKey, setSelectedThreadKey] = useState("")
  const [messages, setMessages] = useState([])
  const [availableCases, setAvailableCases] = useState([])
  const [selectedCaseByMessage, setSelectedCaseByMessage] = useState({})
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [actionKey, setActionKey] = useState("")

  const selectedThread = useMemo(
    () => threads.find((item) => threadKey(item) === selectedThreadKey) || null,
    [threads, selectedThreadKey],
  )

  const loadThreads = async () => {
    setIsLoadingThreads(true)
    try {
      const res = await apiFetch("/sms/inbox/threads")
      if (!res.ok) return
      const data = await res.json()
      setThreads(Array.isArray(data) ? data : [])
      if (!selectedThreadKey && Array.isArray(data) && data.length > 0) {
        setSelectedThreadKey(threadKey(data[0]))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingThreads(false)
    }
  }

  const loadMessagesForThread = async (thread) => {
    if (!thread) {
      setMessages([])
      setAvailableCases([])
      return
    }
    setIsLoadingMessages(true)
    try {
      const query = thread.client_id ? `?client_id=${thread.client_id}` : ""
      const res = await apiFetch(`/sms/inbox${query}`)
      if (!res.ok) {
        setMessages([])
        return
      }
      const inboxMessages = await res.json()
      setMessages(Array.isArray(inboxMessages) ? inboxMessages : [])

      if (thread.client_id) {
        const casesRes = await apiFetch("/cases")
        if (casesRes.ok) {
          const casesData = await casesRes.json()
          const relatedCases = (Array.isArray(casesData) ? casesData : []).filter((caseItem) =>
            (caseItem.clients || []).some((client) => client.id === thread.client_id),
          )
          setAvailableCases(relatedCases)
          if (relatedCases.length > 0) {
            const initial = {}
            for (const msg of inboxMessages || []) {
              initial[msg.id] = String(relatedCases[0].id)
            }
            setSelectedCaseByMessage(initial)
          } else {
            setSelectedCaseByMessage({})
          }
        }
      } else {
        setAvailableCases([])
        setSelectedCaseByMessage({})
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingMessages(false)
    }
  }

  useEffect(() => {
    loadThreads()
  }, [])

  useEffect(() => {
    loadMessagesForThread(selectedThread)
  }, [selectedThreadKey])

  const assignMessageToCase = async (messageId) => {
    const selectedCaseId = Number(selectedCaseByMessage[messageId])
    if (!selectedCaseId) return

    const key = `assign-${messageId}`
    setActionKey(key)
    try {
      const res = await apiFetch(`/sms/inbox/${messageId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selectedCaseId }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error(err)
        return
      }
      await Promise.all([loadThreads(), loadMessagesForThread(selectedThread)])
    } catch (err) {
      console.error(err)
    } finally {
      setActionKey("")
    }
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Case Inbox</h1>
          <Button variant="outline" onClick={loadThreads} disabled={isLoadingThreads}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Client Threads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoadingThreads && <p className="text-sm text-muted-foreground">Loading threads...</p>}
              {!isLoadingThreads && threads.length === 0 && (
                <p className="text-sm text-muted-foreground">No pending SMS in inbox.</p>
              )}
              {threads.map((thread) => {
                const key = threadKey(thread)
                const isActive = selectedThreadKey === key
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedThreadKey(key)}
                    className={`w-full rounded border p-3 text-left transition ${
                      isActive ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{thread.client_name || thread.client_phone_number}</p>
                      <Badge variant="secondary">{thread.pending_count}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{thread.client_phone_number}</p>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Pending SMS Messages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedThread && <p className="text-sm text-muted-foreground">Select a thread.</p>}
              {selectedThread && isLoadingMessages && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading messages...
                </div>
              )}
              {selectedThread && !isLoadingMessages && messages.length === 0 && (
                <p className="text-sm text-muted-foreground">No pending messages for selected thread.</p>
              )}
              {selectedThread && !isLoadingMessages && messages.map((message) => (
                <div key={message.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {new Date(message.received_at).toLocaleString()}
                    </p>
                    <Badge variant="outline">#{message.id}</Badge>
                  </div>
                  <p className="text-sm">{message.sms_body}</p>
                  {selectedThread.client_id ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedCaseByMessage[message.id] || ""}
                        onValueChange={(value) =>
                          setSelectedCaseByMessage((prev) => ({ ...prev, [message.id]: value }))
                        }
                      >
                        <SelectTrigger className="max-w-[320px]">
                          <SelectValue placeholder="Select case" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCases.map((caseItem) => (
                            <SelectItem key={caseItem.id} value={String(caseItem.id)}>
                              #{caseItem.case_number} - {caseItem.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => assignMessageToCase(message.id)}
                        disabled={!selectedCaseByMessage[message.id] || actionKey === `assign-${message.id}`}
                      >
                        Assign to Case
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Client not recognized. Add client phone to a contact first.
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

function threadKey(thread) {
  return `${thread.client_id || "unknown"}:${thread.client_phone_number}`
}
