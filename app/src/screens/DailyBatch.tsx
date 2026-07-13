import { useCallback, useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  EmptyState, ErrorBox, LoadingList, QueueHeader, RefCode,
} from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { fmtKW, kd, qty } from "@/lib/format"
import type { Profile } from "@/lib/session"
import { cn } from "@/lib/utils"

/* QUEUE pattern — the accountant's daily batch: map, then approve.
   Every unmapped site capture shows WHY it is held (mapping is the
   approval condition); batch action is primary; flagged items are
   excluded from the batch by design. Never per-item approval. */

type Pending = {
  kind: "site" | "grn"; id: number; ts: string; actor: string
  description: string; quantity: number | null; unit: string
  amount: number | null; commitment_line_id: number | null
  commitment_no: string | null; no_po_flag: boolean; photo_url: string
  vendor_name: string | null
}
type Suggest = {
  receipt_id: number; line_id: number; commitment_no: string
  line_no: number; item: string; unit: string; open_qty: number | null
  material_score: number
}
type RowState = { mode: "ok" | "ex"; note: string; lineId: number | null; mapped: boolean }

export default function DailyBatch() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [pending, setPending] = useState<Pending[] | null>(null)
  const [suggests, setSuggests] = useState<Record<number, Suggest[]>>({})
  const [states, setStates] = useState<Record<string, RowState>>({})
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(""); setPending(null)
    try {
      const [{ data: p, error: e1 }, { data: s }] = await Promise.all([
        supabase.from("capture_pending").select("*").order("ts").limit(400),
        supabase.from("capture_line_suggest").select("*")
          .order("material_score", { ascending: false }).limit(1000),
      ])
      if (e1) throw e1
      const rows = (p || []) as Pending[]
      const sug: Record<number, Suggest[]> = {}
      ;(s || []).forEach((x: Suggest) => { (sug[x.receipt_id] = sug[x.receipt_id] || []).push(x) })
      const st: Record<string, RowState> = {}
      rows.forEach((r) => {
        const mapped = !!r.commitment_line_id || r.kind === "grn"
        st[`${r.kind}:${r.id}`] = { mode: mapped ? "ok" : "ex", note: "", lineId: null, mapped }
      })
      setPending(rows); setSuggests(sug); setStates(st)
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => {
    let ok = 0, ex = 0
    Object.values(states).forEach((s) => (s.mode === "ok" ? ok++ : ex++))
    return { ok, ex }
  }, [states])

  function patch(key: string, p: Partial<RowState>) {
    setStates((old) => ({ ...old, [key]: { ...old[key], ...p } }))
  }

  async function submit() {
    setBusy(true)
    const approve: unknown[] = [], except: unknown[] = []
    Object.entries(states).forEach(([k, s]) => {
      const [kind, id] = k.split(":")
      if (s.mode === "ok") approve.push({ kind, id: Number(id), line_id: s.lineId })
      else except.push({ kind, id: Number(id), note: s.note })
    })
    try {
      const r = await rpc("capture_batch_decide", { p_pin: user.pin, p_approve: approve, p_except: except })
      if (r?.success) {
        toast.success(
          [t("queue.approvedN", { n: r.approved }), t("queue.exceptedN", { n: r.excepted }),
           r.skippedUnmapped ? t("queue.skippedN", { n: r.skippedUnmapped }) : null]
            .filter(Boolean).join(" · "))
        await load()
      } else setErr(t("common.error"))
    } catch { setErr(t("common.error")) }
    setBusy(false)
  }

  if (err && !pending) return <ErrorBox message={err} onRetry={load} />
  if (!pending) return <LoadingList />

  return (
    <div className="flex flex-col gap-3">
      <QueueHeader title={t("queue.batchTitle")} count={pending.length} oldestTs={pending[0]?.ts} />
      {!pending.length ? (
        <EmptyState title={t("queue.empty")} />
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {t("queue.willApprove", { ok: counts.ok, ex: counts.ex })}
          </div>
          {pending.map((p) => {
            const key = `${p.kind}:${p.id}`
            const s = states[key]
            const sug = p.kind === "site" ? suggests[p.id] || [] : []
            return (
              <Card key={key} className={cn("py-3", s.mode === "ex" && "opacity-90")}>
                <CardContent className="flex flex-col gap-2 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      {p.kind === "site"
                        ? <>{t("queue.siteNote")} <RefCode>#{p.id}</RefCode></>
                        : <RefCode>GRN #{p.id}</RefCode>}
                    </div>
                    <Button size="sm" variant="ghost"
                      className={s.mode === "ok" ? "text-success" : "text-danger"}
                      onClick={() => {
                        if (s.mode === "ok") patch(key, { mode: "ex" })
                        else if (s.mapped || s.lineId) patch(key, { mode: "ok" })
                      }}>
                      {s.mode === "ok" ? `✓ ${t("queue.approve")}` : `⚑ ${t("queue.exception")}`}
                    </Button>
                  </div>
                  <div className="text-sm">
                    {p.description || "—"}
                    {p.quantity ? <> · <span className="tabular-nums">{qty(p.quantity)} {p.unit}</span></> : null}
                    {p.amount ? <> · <b>{kd(p.amount)}</b></> : null}
                    {p.vendor_name ? <> · {p.vendor_name}</> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.actor || "—"} · {fmtKW(p.ts)}
                    {p.commitment_no
                      ? <> · <RefCode>{p.commitment_no}</RefCode></>
                      : <> · <span className="text-warning">{t("queue.unmapped")}</span></>}
                    {p.photo_url && (
                      <> · <a className="underline" href={p.photo_url} target="_blank" rel="noopener">
                        📷 {t("queue.sitePhoto")}</a></>
                    )}
                  </div>
                  {p.kind === "site" && !p.commitment_line_id && (
                    <Select value={s.lineId ? String(s.lineId) : ""} onValueChange={(v) => {
                      const lineId = v ? Number(v) : null
                      patch(key, { lineId, mapped: !!lineId, mode: lineId ? "ok" : "ex" })
                    }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={sug.length ? t("queue.mapHint") : t("queue.noSuggestions")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sug.map((x) => (
                          <SelectItem key={x.line_id} value={String(x.line_id)}>
                            {x.commitment_no} · {x.line_no}. {x.item}
                            {x.open_qty != null ? ` (${t("queue.openQty", { n: qty(x.open_qty) })} ${x.unit || ""})` : ""}
                            {x.material_score >= 1 ? " ★" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {s.mode === "ex" && (
                    <Input placeholder={t("queue.exceptionReason")} value={s.note}
                      onChange={(e) => patch(key, { note: e.target.value })} />
                  )}
                </CardContent>
              </Card>
            )
          })}
          {err && <ErrorBox message={err} />}
          {/* ONE batch action — the single accent use on this view */}
          <Button size="lg" disabled={busy} onClick={submit}>
            {t("queue.batchApprove")} ({counts.ok})
          </Button>
        </>
      )}
    </div>
  )
}
