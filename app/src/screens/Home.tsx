import { useEffect, useState } from "react"
import { Link, useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { RefCode, StatusBadge } from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { fmtKW, kd } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* DASHBOARD pattern — leads with "waiting on you"; every tile above the
   fold is actionable. Submitters see the fate of what they submitted
   (skill: the feedback loop is an adoption feature). */

export default function Home() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [pendingCaptures, setPendingCaptures] = useState<number | null>(null)
  const [pendingRequests, setPendingRequests] = useState<number | null>(null)
  const [myRequests, setMyRequests] = useState<any[]>([])

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
    if (user.requester || user.accountant) {
      supabase.from("commitment_requests")
        .select("*,commitments!commitment_requests_commitment_fkey(number)")
        .eq("requested_by", user.name)
        .order("created_at", { ascending: false }).limit(8)
        .then(({ data }) => setMyRequests(data || []))
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

      {myRequests.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-muted-foreground">{t("req.myRequests")}</h3>
          <div className="flex flex-col gap-2">
            {myRequests.map((r) => (
              <Card key={r.id} className="py-2"><CardContent className="flex items-center justify-between gap-2 px-4 text-sm">
                <div>
                  <RefCode>{r.req_no}</RefCode> · <b>{kd(r.estimated_value)}</b>
                  <span className="text-muted-foreground"> · {fmtKW(r.created_at)}</span>
                  {r.commitments?.number && <> · <RefCode>{r.commitments.number}</RefCode></>}
                  {r.status === "مرفوض" && r.office_note && (
                    <div className="text-xs text-danger">{r.office_note}</div>
                  )}
                </div>
                <StatusBadge status={r.status} />
              </CardContent></Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
