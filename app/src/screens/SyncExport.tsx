import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  EmptyState, ErrorBox, LoadingList, MetricStrip, RefCode,
} from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { kd } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* Export layer (0016): freeze pending supplier/internal invoices into a
   batch; the CSV download is the file adapter; per-row acks are the
   reconciliation. Sync-health strip on top (skill: dashboard tile). */

const CSV_COLS = ["date", "contactId", "vendor", "costCenter", "glAccount", "amount", "commitmentRef", "sourceId", "refNo"]

function rowsToCsv(rows: any[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  return [CSV_COLS.join(","),
    ...rows.map((r) => CSV_COLS.map((c) => esc(r.payload?.[c])).join(","))].join("\r\n")
}

export default function SyncExport() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [d, setD] = useState<any | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    setErr(""); setD(null)
    try {
      const [pending, batches, rows] = await Promise.all([
        supabase.from("export_pending").select("*"),
        supabase.from("export_batches").select("*").order("id", { ascending: false }).limit(20),
        supabase.from("export_rows").select("*").order("id"),
      ])
      if (batches.error) throw batches.error
      setD({ pending: pending.data || [], batches: batches.data || [], rows: rows.data || [] })
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  if (err && !d) return <ErrorBox message={err} onRetry={load} />
  if (!d) return <LoadingList />

  const acked = d.rows.filter((r: any) => r.acked).length
  const canAct = user.approver || user.admin

  async function createBatch() {
    setBusy(true)
    try {
      const r = await rpc("export_batch_create", { p_pin: user.pin, p_note: note.trim() })
      if (r?.success) { setNote(""); await load() } else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }
  async function ack(rowId: number, val: boolean) {
    try {
      const r = await rpc("export_row_ack", { p_pin: user.pin, p_row_id: rowId, p_acked: val })
      if (r?.success) await load()
    } catch { toast.error(t("common.error")) }
  }
  function download(batch: any) {
    const rows = d.rows.filter((r: any) => r.batch_id === batch.id)
    const blob = new Blob(["﻿" + rowsToCsv(rows)], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${batch.batch_no}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("sync.title")}</h2>
      <MetricStrip tiles={[
        { label: t("sync.pending"), value: d.pending.length, tone: d.pending.length ? "warning" : "success" },
        { label: t("sync.exported"), value: d.rows.length },
        { label: t("sync.unmatched"), value: d.rows.length - acked, tone: d.rows.length - acked > 0 ? "warning" : undefined },
      ]} />

      {canAct && (
        <Card><CardContent className="flex items-end gap-2 px-4 py-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="text-sm">{d.pending.length
              ? t("sync.pendingRows", { n: d.pending.length })
              : t("sync.emptyPending")}</div>
            <Input placeholder={t("sync.note")} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button disabled={busy || !d.pending.length} onClick={createBatch}>📤 {t("sync.create")}</Button>
        </CardContent></Card>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground">{t("sync.batches")}</h3>
      {!d.batches.length ? <EmptyState title={t("sync.emptyPending")} /> : d.batches.map((b: any) => {
        const rows = d.rows.filter((r: any) => r.batch_id === b.id)
        const done = rows.filter((r: any) => r.acked).length
        return (
          <Card key={b.id} className="py-3"><CardContent className="flex flex-col gap-2 px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                <RefCode>{b.batch_no}</RefCode>
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {t("sync.rows", { n: rows.length })} · {t("sync.acked", { n: done })}
                </span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => download(b)}>⬇ {t("sync.downloadCsv")}</Button>
            </div>
            {b.note && <div className="text-xs text-muted-foreground">{b.note}</div>}
            {canAct && rows.map((r: any) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={r.acked} onCheckedChange={(v) => ack(r.id, !!v)} />
                <span className="tabular-nums">{r.payload?.date}</span> · {r.payload?.vendor} ·{" "}
                <b>{kd(r.payload?.amount)}</b> · <RefCode>{r.payload?.commitmentRef}</RefCode>
                {r.acked && <span className="text-xs text-success">✓ {t("sync.ack")} {r.acked_by}</span>}
              </label>
            ))}
          </CardContent></Card>
        )
      })}
    </div>
  )
}
