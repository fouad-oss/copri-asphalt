import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  EmptyState, ErrorBox, LoadingList, QueueHeader, RefCode, StatusBadge,
} from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { fmtKW, kd, qty as fq } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* Exception inbox (QUEUE) — every exception carries its reason and its
   owner. Resolution = mapping to a PO line (map & approve), the same
   accounting step as the daily batch. Field capture itself stays on the
   engineers' portal until the offline-capture phase. */

export default function Deliveries() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [d, setD] = useState<any | null>(null)
  const [err, setErr] = useState("")
  const [sel, setSel] = useState<Record<string, { po: string; line: string; lines: any[] }>>({})

  const load = useCallback(async () => {
    setErr(""); setD(null)
    try {
      const [exSite, exGrn, lpos, recent] = await Promise.all([
        supabase.from("material_receipts").select("*").eq("approval_status", "استثناء").order("ts", { ascending: false }).limit(100),
        supabase.from("grns").select("*,commitments(number)").eq("approval_status", "استثناء").order("created_at", { ascending: false }).limit(100),
        supabase.from("commitments").select("id,number,vendors(name)").eq("ctype", "LPO").eq("status", "نشط").order("created_at", { ascending: false }),
        supabase.from("material_receipts").select("*").order("ts", { ascending: false }).limit(15),
      ])
      if (exSite.error) throw exSite.error
      const items = [
        ...(exSite.data || []).map((s: any) => ({
          kind: "site", id: s.id, label: s.receipt_id, desc: `${s.material} ${fq(s.quantity)} ${s.unit || ""} · ${s.supplier || ""}`,
          note: s.exception_note, ts: s.ts,
        })),
        ...(exGrn.data || []).map((g: any) => ({
          kind: "grn", id: g.id, label: g.grn_no, desc: `${g.description} · ${kd(g.amount)}`,
          note: g.exception_note, ts: g.created_at,
        })),
      ]
      setD({ items, lpos: lpos.data || [], recent: recent.data || [] })
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  if (err && !d) return <ErrorBox message={err} onRetry={load} />
  if (!d) return <LoadingList />

  async function pickPo(key: string, poId: string) {
    const { data } = await supabase.from("commitment_lines").select("*").eq("commitment_id", poId).order("line_no")
    setSel((o) => ({ ...o, [key]: { po: poId, line: "", lines: data || [] } }))
  }
  async function resolve(item: any) {
    const s = sel[`${item.kind}:${item.id}`]
    if (!s?.line) return
    try {
      const r = await rpc("capture_exception_resolve", {
        p_pin: user.pin, p_kind: item.kind, p_id: item.id, p_line_id: Number(s.line),
      })
      if (r?.success) { toast.success(t("deliveries.resolved")); await load() }
      else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
  }

  return (
    <div className="flex flex-col gap-4">
      <QueueHeader title={t("deliveries.exceptions")} count={d.items.length}
        oldestTs={d.items.length ? d.items[d.items.length - 1].ts : null} />
      {!d.items.length ? <EmptyState title={t("deliveries.empty")} /> : d.items.map((x: any) => {
        const key = `${x.kind}:${x.id}`
        const s = sel[key]
        return (
          <Card key={key} className="py-3"><CardContent className="flex flex-col gap-2 px-4">
            <div className="flex items-center justify-between gap-2">
              <RefCode className="text-sm">{x.label}</RefCode>
              <StatusBadge status="استثناء" />
            </div>
            <div className="text-sm">{x.desc} · <span className="text-muted-foreground">{fmtKW(x.ts)}</span></div>
            {x.note && (
              <div className="rounded-md bg-danger-surface px-2 py-1 text-xs text-danger">
                {t("deliveries.reason")}: {x.note} · {t("queue.withAccountant")}
              </div>
            )}
            {user.accountant && (
              <div className="flex flex-col gap-2">
                <Select value={s?.po || ""} onValueChange={(v) => pickPo(key, v)}>
                  <SelectTrigger><SelectValue placeholder={t("deliveries.poPick")} /></SelectTrigger>
                  <SelectContent>
                    {d.lpos.map((l: any) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.number} · {l.vendors?.name || ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {s && s.lines.length > 0 && (
                  <Select value={s.line} onValueChange={(v) => setSel((o) => ({ ...o, [key]: { ...s, line: v } }))}>
                    <SelectTrigger><SelectValue placeholder={t("deliveries.linePick")} /></SelectTrigger>
                    <SelectContent>
                      {s.lines.map((l: any) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.line_no}. {l.item}{l.qty ? ` (${fq(l.qty)} ${l.unit})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" disabled={!s?.line} onClick={() => resolve(x)}>{t("deliveries.resolve")}</Button>
              </div>
            )}
          </CardContent></Card>
        )
      })}

      <h3 className="text-sm font-semibold text-muted-foreground">{t("deliveries.recent")}</h3>
      <div className="text-xs text-muted-foreground">{t("deliveries.captureNote")}</div>
      {d.recent.map((r: any) => (
        <Card key={r.id} className="py-2"><CardContent className="flex items-center justify-between gap-2 px-4 text-sm">
          <div>
            <RefCode>{r.receipt_id}</RefCode> · {r.material} {fq(r.quantity)} {r.unit || ""} · {r.supplier || "—"}
            <span className="text-muted-foreground"> · {r.receiver} · {fmtKW(r.ts)}</span>
          </div>
          <StatusBadge status={r.approval_status} />
        </CardContent></Card>
      ))}
    </div>
  )
}
