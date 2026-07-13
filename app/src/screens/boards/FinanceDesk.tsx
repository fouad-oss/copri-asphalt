import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorBox, LoadingList, QueueHeader } from "@/components/patterns"
import {
  fetchRequests, getDeskSession, requestDecide, setDeskSession, type RecipientRequest,
} from "./lib"
import { RequestCard } from "./widgets"
import PinGate from "./PinGate"

/* ── Finance approval desk (legacy ?financeRole=manager) — QUEUE pattern:
   recipient requests waiting on the finance manager, decided via the
   recipient_request_decide RPC. Rejection requires a reason. ── */

function DecideRow({ r, who, onDone }: { r: RecipientRequest; who: string; onDone: () => void }) {
  const { t } = useTranslation("boards")
  const [note, setNote] = useState("")
  const [needNote, setNeedNote] = useState(false)
  const [busy, setBusy] = useState(false)

  const decide = async (decision: "موافَق عليه" | "مرفوض") => {
    if (decision === "مرفوض" && !note.trim()) { setNeedNote(true); return }
    setBusy(true)
    try {
      const res = await requestDecide(r.id, decision, who, note.trim())
      if (!res?.success) throw new Error(res?.error || "failed")
    } catch { toast.error(t("error")) }
    onDone()
  }

  return (
    <RequestCard r={r}>
      <Textarea value={note}
        placeholder={needNote ? t("fin.noteReq") : t("fin.notePh")}
        className={needNote ? "border-danger" : undefined}
        onChange={(e) => { setNote(e.target.value); setNeedNote(false) }} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => decide("موافَق عليه")}>
          {t("fin.approve")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-danger" disabled={busy}
          onClick={() => decide("مرفوض")}>
          {t("fin.reject")}
        </Button>
      </div>
    </RequestCard>
  )
}

function Queue({ who }: { who: string }) {
  const { t } = useTranslation("boards")
  const [rows, setRows] = useState<RecipientRequest[] | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    fetchRequests().then(setRows).catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (err) return <ErrorBox message={t("error")} onRetry={load} />
  if (!rows) return <LoadingList />

  const pending = rows.filter((r) => r.status === "قيد المراجعة")
  const decided = rows.filter((r) => r.status !== "قيد المراجعة")
  const oldest = pending.length ? pending[pending.length - 1].created_at : null

  return (
    <div className="flex flex-col gap-3">
      <QueueHeader title={t("fin.pending")} count={pending.length} oldestTs={oldest} />
      {!pending.length ? (
        <EmptyState title={t("fin.pendingNone")} />
      ) : (
        pending.map((r) => <DecideRow key={r.id} r={r} who={who} onDone={load} />)
      )}
      {decided.length > 0 && (
        <>
          <div className="text-sm font-semibold text-muted-foreground">{t("fin.decided")}</div>
          {decided.map((r) => <RequestCard key={r.id} r={r} />)}
        </>
      )}
    </div>
  )
}

export default function FinanceDesk() {
  const { t } = useTranslation("boards")
  const [who, setWho] = useState<string | null>(() => getDeskSession("finance"))

  if (!who) return <PinGate kind="finance" onSuccess={setWho} />

  return (
    <div className="flex flex-col gap-3">
      <Card className="py-3">
        <CardContent className="flex items-center justify-between gap-2 px-4">
          <div>
            <div className="text-sm font-semibold">{who}</div>
            <div className="text-xs text-muted-foreground">{t("desk.financeSub")}</div>
          </div>
          <Button type="button" variant="outline" size="sm"
            onClick={() => { setDeskSession("finance", null); setWho(null) }}>
            {t("desk.logout")}
          </Button>
        </CardContent>
      </Card>
      <Queue who={who} />
    </div>
  )
}
