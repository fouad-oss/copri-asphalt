import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import {
  Bar, EmptyState, ErrorBox, LoadingList, RefCode, StatusBadge,
} from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { fmtKWDate, kd, qty as fq } from "@/lib/format"

/* REGISTER/DETAIL hybrid — the blanket board. Line-controlled blankets
   (v2) show per-line quantity drawdown; KD totals are derived and never
   the primary control. Legacy ceiling blankets keep their money bar. */

export default function Blankets() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    setErr(""); setRows(null)
    try {
      const [bl, draw, lineDraw] = await Promise.all([
        supabase.from("blanket_lpos")
          .select("*,vendors(name),commitments!blanket_lpos_commitment_id_fkey(number)")
          .eq("status", "نشط").order("id"),
        supabase.from("blanket_drawdown").select("*"),
        supabase.from("blanket_line_drawdown").select("*").order("line_no"),
      ])
      if (bl.error) throw bl.error
      const dmap: Record<number, any> = {}
      ;(draw.data || []).forEach((d: any) => { dmap[d.blanket_id] = d })
      setRows((bl.data || []).map((b: any) => ({
        ...b,
        drawn: dmap[b.id]?.drawn || 0,
        remaining: dmap[b.id]?.remaining ?? b.ceiling,
        lines: (lineDraw.data || []).filter((l: any) => l.blanket_id === b.id),
      })))
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  if (err && !rows) return <ErrorBox message={err} onRetry={load} />
  if (!rows) return <LoadingList />

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("blanket.title")}</h2>
      {!rows.length ? <EmptyState title={t("blanket.empty")} /> : rows.map((b) => (
        <Card key={b.id} className="py-3"><CardContent className="flex flex-col gap-2 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              <RefCode>{b.commitments?.number || `#${b.id}`}</RefCode> · {b.category}
            </div>
            <StatusBadge status={b.status} />
          </div>
          <div className="text-xs text-muted-foreground">
            {b.vendors?.name || "—"} · {t("blanket.validity", { from: fmtKWDate(b.valid_from), to: fmtKWDate(b.valid_to) })}
          </div>
          {b.control_mode === "lines" && b.lines.length ? (
            <>
              {b.lines.map((l: any) => (
                <div key={l.line_id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{l.line_no}. {l.item}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fq(l.drawn_qty)} / {fq(l.agreed_qty)} {l.unit || ""} · {l.agreed_rate} د.ك
                    </span>
                  </div>
                  <Bar value={Number(l.drawn_qty)} max={Number(l.agreed_qty)} />
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                {t("blanket.derived", {
                  a: kd(b.lines.reduce((s: number, l: any) => s + Number(l.drawn_value || 0), 0)),
                  b: kd(b.lines.reduce((s: number, l: any) => s + Number(l.agreed_value || 0), 0)),
                })}
              </div>
            </>
          ) : (
            <>
              <Bar value={Number(b.drawn)} max={Number(b.ceiling)} />
              <div className="text-sm">
                {t("blanket.ceiling")} <b>{kd(b.ceiling)}</b> · {t("blanket.drawn")} <b>{kd(b.drawn)}</b> · {t("blanket.left")} <b>{kd(b.remaining)}</b>
              </div>
            </>
          )}
          {b.rate_ref && <div className="text-xs text-muted-foreground">{t("blanket.rateRef")}: {b.rate_ref}</div>}
        </CardContent></Card>
      ))}
    </div>
  )
}
