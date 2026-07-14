import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import LangToggle from "@/components/LangToggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState, LoadingList, RefCode, StatusBadge } from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { fmtKW } from "@/lib/format"
import { cn } from "@/lib/utils"
import { clearCaptureSession, getCaptureSession } from "./session"
import { pendingCount, syncNow, useQueue, type QueuedReceipt, type SyncState } from "./queue"

/* Receiver home: my recent receipts with their fate (approval_status chips —
   the feedback loop is an adoption feature) merged with the local offline
   queue and its visible per-item sync state, + the one accent action. */

const SYNC_TONE: Record<SyncState, string> = {
  queued: "bg-warning-surface text-warning",
  syncing: "bg-info/10 text-info",
  synced: "bg-success/10 text-success",
  failed: "bg-danger-surface text-danger",
}

function SyncChip({ state }: { state: SyncState }) {
  const { t } = useTranslation("capture")
  return <Badge variant="secondary" className={cn("font-normal", SYNC_TONE[state])}>{t(`sync.${state}`)}</Badge>
}

type ServerReceipt = {
  receipt_id: string; ts: string; project: string; site: string; work_order: string
  category: string; material: string; quantity: number | null; unit: string
  supplier: string; subcontractor: string; photo_url: string; remarks: string
  approval_status: string; exception_note: string
}

function Line({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-end">{value}</span>
    </div>
  )
}

function ReceiptCard({ id, ts, status, note, photoUrl, r, queued }: {
  id: string; ts: string
  status?: string | null
  note?: string
  photoUrl?: string
  r: { project: string; site: string; work_order: string; category: string; material: string
       quantity: number | null; unit: string; supplier: string; subcontractor: string; remarks: string }
  queued?: QueuedReceipt
}) {
  const { t } = useTranslation("capture")
  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <RefCode className="max-w-[55%] truncate text-xs">{id}</RefCode>
          {queued ? <SyncChip state={queued.state} /> : <StatusBadge status={status} />}
        </div>
        <div className="text-base font-semibold">{r.material || "—"}</div>
        <Line label={t("form.category")} value={r.category} />
        <Line label={t("form.quantity")} value={[r.quantity, r.unit].filter(Boolean).join(" ")} />
        <Line label={t("form.supplier")} value={r.supplier} />
        <Line label={t("form.subcontractor")} value={r.subcontractor} />
        <Line label={t("form.project")} value={[r.project, r.site].filter(Boolean).join(" · ")} />
        {r.work_order && <Line label={t("form.woLabel")} value={r.work_order} />}
        {r.remarks && <Line label={t("form.remarks")} value={r.remarks} />}
        {note && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{note}</div>}
        <div className="text-xs text-muted-foreground">{fmtKW(ts)}</div>
        {queued?.state === "failed" && (
          <Button size="sm" variant="outline" className="self-start" onClick={() => void syncNow()}>
            {t("sync.retryNow")}
          </Button>
        )}
        {photoUrl && (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="text-sm text-info underline">
            {t("home.photo")}
          </a>
        )}
      </CardContent>
    </Card>
  )
}

export default function CaptureHome() {
  const { t } = useTranslation("capture")
  const nav = useNavigate()
  const session = getCaptureSession()
  const queue = useQueue()
  const [rows, setRows] = useState<ServerReceipt[] | null>(null)
  const [offline, setOffline] = useState(false)

  const name = session?.name || ""

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("material_receipts")
        .select("receipt_id,ts,project,site,work_order,category,material,quantity,unit,supplier,subcontractor,photo_url,remarks,approval_status,exception_note")
        .eq("receiver", name)
        .order("ts", { ascending: false })
        .limit(100)
      if (error) throw error
      setRows((data || []) as ServerReceipt[])
      setOffline(false)
    } catch {
      setOffline(true) // keep whatever we had; the local queue still renders
    }
  }, [name])
  useEffect(() => { void load() }, [load])

  const pending = pendingCount()
  const serverIds = useMemo(() => new Set((rows || []).map((r) => r.receipt_id)), [rows])
  // Local items first (they are the newest); hide a synced local copy once
  // the server list contains the row it became.
  const localItems = queue.filter(
    (q) => q.row.receiver === name && !(q.state === "synced" && serverIds.has(q.receiptId)),
  )
  const serverItems = (rows || []).filter((r) => !localItems.some((q) => q.receiptId === r.receipt_id))

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">{t("home.portal")}</div>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle />
          {pending > 0 && (
            <Badge variant="secondary" className="bg-warning-surface font-normal text-warning">
              {t("home.pending", { n: pending })}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => { clearCaptureSession(); nav("/capture/login", { replace: true }) }}>
            {t("home.logout")}
          </Button>
        </div>
      </div>

      {/* the one accent action per view */}
      <Button className="h-12 text-base" onClick={() => nav("/capture/new")}>
        ＋ {t("home.newReceipt")}
      </Button>

      {offline && (
        <div className="rounded-md bg-warning-surface p-2 text-sm text-warning">{t("home.offlineNote")}</div>
      )}

      <h2 className="mt-1 text-sm font-semibold text-muted-foreground">{t("home.mine")}</h2>

      {rows === null && !offline && <LoadingList rows={3} />}

      {localItems.map((q) => (
        <ReceiptCard key={q.receiptId} id={q.receiptId} ts={q.queuedAt} r={q.row}
          queued={q} photoUrl={q.photoUrl || undefined} />
      ))}
      {serverItems.map((r) => (
        <ReceiptCard key={r.receipt_id} id={r.receipt_id} ts={r.ts}
          status={r.approval_status || "بانتظار"}
          note={r.approval_status === "استثناء" ? r.exception_note || undefined : undefined}
          photoUrl={r.photo_url || undefined} r={r} />
      ))}

      {(rows !== null || offline) && localItems.length === 0 && serverItems.length === 0 && (
        <EmptyState title={t("home.empty")} />
      )}
    </div>
  )
}
