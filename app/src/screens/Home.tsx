import { useEffect, useState } from "react"
import { Link, useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import type { Profile } from "@/lib/session"

/* DASHBOARD pattern — leads with "waiting on you"; every tile above the
   fold is actionable. Role-routed: each capability sees its own counts. */

export default function Home() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [pendingCaptures, setPendingCaptures] = useState<number | null>(null)
  const [pendingRequests, setPendingRequests] = useState<number | null>(null)

  useEffect(() => {
    if (user.accountant) {
      supabase.from("capture_pending").select("id", { count: "exact", head: true })
        .then(({ count }) => setPendingCaptures(count ?? 0))
    }
    if (user.approver || user.financeApprover || user.admin) {
      supabase.from("commitment_requests").select("id", { count: "exact", head: true })
        .eq("status", "قيد المراجعة")
        .then(({ count }) => setPendingRequests(count ?? 0))
    }
  }, [user])

  const tiles: { to: string; label: string; count: number | null }[] = []
  if (user.accountant) tiles.push({ to: "/approvals", label: t("home.batch"), count: pendingCaptures })
  if (user.approver || user.financeApprover || user.admin)
    tiles.push({ to: "/approvals/requests", label: t("home.queue"), count: pendingRequests })
  tiles.push({ to: "/commitments", label: t("home.register"), count: null })

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("home.welcome", { name: user.name })}</h2>
      <div className="text-sm text-muted-foreground">{t("home.waitingOnYou")}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tl) => (
          <Link key={tl.to} to={tl.to}>
            <Card className="transition-colors hover:bg-secondary/40">
              <CardContent className="px-4 py-4">
                <div className="text-sm text-muted-foreground">{tl.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {tl.count == null ? "—" : tl.count}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
