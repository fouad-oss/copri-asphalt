import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  EmptyState, ErrorBox, LoadingList, QueueHeader, RefCode, StatusBadge,
} from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { fmtKW, kd } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* QUEUE pattern — the approval queue walks configurable sequential gates
   (0020): only holders of the current gate's capability decide; the card
   says WHY the request routed here and shows the provable gate trail. */

type Req = any
type Gate = { chain: string; gate_no: number; capability: string; label: string }

function hasCap(u: Profile, cap: string) {
  return cap === "approver" ? u.approver
    : cap === "finance_approver" ? u.financeApprover
    : cap === "accountant" ? u.accountant
    : cap === "admin" ? u.admin : false
}

function ReqCard({ r, children }: { r: Req; children?: React.ReactNode }) {
  const { t } = useTranslation()
  const cc = r.cost_centers
  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <RefCode className="text-sm">{r.req_no}</RefCode>
          <StatusBadge status={r.status} />
        </div>
        <div className="text-sm">
          {r.vendors?.name || "—"} · {cc ? `${cc.name_ar || cc.name_en || ""} (${cc.code})` : "—"} · <b>{kd(r.estimated_value)}</b>
        </div>
        <div className="text-sm text-muted-foreground">{r.description}</div>
        <div className="text-xs text-muted-foreground">
          {r.requested_by || "—"} · {fmtKW(r.created_at)}
          {r.decided_by ? <> · {r.decided_by}</> : null}
          {r.commitments?.number ? <> · <RefCode>{r.commitments.number}</RefCode></> : null}
        </div>
        {r.office_note && (
          <div className="rounded-md bg-warning-surface px-2 py-1 text-xs text-warning">
            {t("req.why")}: {r.office_note}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function GateTrail({ r }: { r: Req }) {
  return (
    <>
      {(r.gate_log || []).map((g: any, i: number) => (
        <div key={i} className="text-xs text-muted-foreground">
          {g.decision === "approve" ? "✓" : "✕"} {g.by} · {fmtKW(g.at)}{g.note ? ` · ${g.note}` : ""}
        </div>
      ))}
    </>
  )
}

export default function RequestQueue() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [rows, setRows] = useState<Req[] | null>(null)
  const [gates, setGates] = useState<Gate[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(""); setRows(null)
    try {
      const [r, g] = await Promise.all([
        supabase.from("commitment_requests")
          .select("*,cost_centers(code,name_ar,name_en),vendors(name),commitments!commitment_requests_commitment_fkey(number)")
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("approval_chain_gates").select("*").eq("active", true).order("gate_no"),
      ])
      if (r.error) throw r.error
      setRows(r.data || []); setGates((g.data || []) as Gate[])
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  if (err && !rows) return <ErrorBox message={err} onRetry={load} />
  if (!rows) return <LoadingList />

  const gateOf = (r: Req): Gate =>
    gates.find((g) => g.chain === r.chain && g.gate_no === r.current_gate)
    || { chain: "default", gate_no: 1, capability: "approver", label: t("admin.capMap.approver") }
  const pending = rows.filter((r) => r.status === "قيد المراجعة")
  const mine = pending.filter((r) => hasCap(user, gateOf(r).capability) && r.requested_by !== user.name)
  const others = pending.filter((r) => !mine.includes(r))
  const decided = rows.filter((r) => r.status !== "قيد المراجعة").slice(0, 20)

  async function decide(r: Req, decision: "approve" | "reject") {
    const note = (notes[r.id] || "").trim()
    if (decision === "reject" && !note) { toast.error(t("req.noteRequired")); return }
    setBusy(true)
    try {
      const res = await rpc("request_decide", { p_pin: user.pin, p_id: r.id, p_decision: decision, p_note: note })
      if (res?.success) {
        toast.success(res.commitmentNo
          ? `${t("req.sentAuto")} ${res.commitmentNo}`
          : res.nextLabel ? t("req.waitingGate", { label: res.nextLabel }) : t(`status.${decision === "approve" ? "approved" : "rejected"}`))
        await load()
      } else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <QueueHeader title={t("tabs.requests")} count={mine.length}
        oldestTs={mine.length ? mine[mine.length - 1].created_at : null} />
      {!mine.length
        ? <EmptyState title={t("queue.empty")} />
        : mine.map((r) => {
          const g = gateOf(r)
          return (
            <ReqCard key={r.id} r={r}>
              <div className="text-xs">
                {t("req.gate")}: <b>{g.label || t(`admin.capMap.${g.capability}`)}</b> ({r.current_gate})
              </div>
              <GateTrail r={r} />
              <Textarea placeholder={t("req.noteOptional")} value={notes[r.id] || ""}
                onChange={(e) => setNotes((o) => ({ ...o, [r.id]: e.target.value }))} className="min-h-16" />
              <div className="flex gap-2">
                {/* approve = the one accent action on this card */}
                <Button size="sm" disabled={busy} onClick={() => decide(r, "approve")}>✓ {t("req.approve")}</Button>
                <Button size="sm" variant="outline" disabled={busy} className="text-danger"
                  onClick={() => decide(r, "reject")}>✕ {t("req.reject")}</Button>
              </div>
            </ReqCard>
          )
        })}

      {others.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-muted-foreground">{t("req.otherGates")} ({others.length})</h3>
          {others.map((r) => {
            const g = gateOf(r)
            return (
              <ReqCard key={r.id} r={r}>
                <div className="text-xs text-muted-foreground">
                  {r.requested_by === user.name
                    ? <span className="text-warning">{t("req.ownRequest")}</span>
                    : t("req.waitingGate", { label: g.label || t(`admin.capMap.${g.capability}`) })}
                </div>
                <GateTrail r={r} />
              </ReqCard>
            )
          })}
        </>
      )}

      {decided.length > 0 && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-muted-foreground">{t("req.decidedLog")}</h3>
          {decided.map((r) => <ReqCard key={r.id} r={r} />)}
        </>
      )}
    </div>
  )
}
