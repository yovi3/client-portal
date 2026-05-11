import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MainLayout from "../components/layout/MainLayout"
import { Card, CardContent } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Briefcase, ChevronRight } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { getStoredUser, fetchCurrentUser } from "@/lib/auth"

export default function Cases() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [user, setUser] = useState(() => getStoredUser())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user) return
    fetchCurrentUser().then((u) => {
      if (u) setUser(u)
      else navigate("/login")
    })
  }, [user, navigate])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await apiFetch("/cases")
        if (res.ok) setCases(await res.json())
      } catch {}
      finally { setIsLoading(false) }
    }
    load()
  }, [user])

  return (
    <MainLayout>
      <div className="p-6 space-y-5">

        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Cases</h1>
        </div>

        <Card className="border-border shadow-none">
          <CardContent className="p-0">
            {isLoading && (
              <div className="divide-y divide-border">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && cases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No cases assigned</p>
              </div>
            )}

            <div className="divide-y divide-border">
              {cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm text-foreground truncate">{c.title}</p>
                      {(c.unread_count || 0) > 0 && (
                        <Badge variant="destructive" className="h-4 px-1 text-[10px] shrink-0">
                          {c.unread_count} new
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Team: {c.personnel?.map((p) => p.name).join(", ") || "—"}
                      {" · "}
                      Client: {c.clients?.map((cl) => cl.name).join(", ") || "—"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </MainLayout>
  )
}
