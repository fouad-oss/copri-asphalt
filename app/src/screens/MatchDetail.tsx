import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  ErrorBox, LoadingList, MetricStrip, RefCode, StatusBadge,
} from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { fmtKW, fmtKWDate, kd, qty } from "@/lib/format"

/* DETAIL pattern — header: reference + status + one-line context; metric
   strip (exceptional tile tinted); line table with per-line state; then
   linked-document panels. Single joined queries, no N+1. */

export default function MatchDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [d, setD] = useState<any | null>(null)
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    setErr(""); setD(null)
    try {
      const [m, c, lines, grns, invs] = await Promise.all([
        supabase.from("po_match").select("*").eq("commitment_id", id).single(),
        supabase.from("commitments")
          .select("*,vendors(name),cost_centers(code,name_ar,name_en)").eq("id", id).single(),
        supabase.from("po_line_match").select("*").eq("commitment_id", id).order("line_no"),
        supabase.from("grns").select("*").eq("commitment_id", id).order("created_at", { ascending: false }),
        supabase.from("supplier_invoices").select("*").eq("commitment_id", id)
          .order("invoice_date", { ascending: false }),
      ])
      if (m.error || c.error) throw m.error || c.error
      const lineIds = (lines.data || []).map((l: any) => l.line_id)
      const site = lineIds.length
        ? (await supabase.from("material_receipts").select("*")
            .in("commitment_line_id", lineIds).order("ts", { ascending: false })).data || []
        : []
      setD({ m: m.data, c: c.data, lines: lines.data || [], grns: grns.data || [], invs: invs.data || [], site })
    } catch { setErr(t("common.error")) }
  }, [id, t])
  useEffect(() => { void load() }, [load])

  if (err && !d) return <ErrorBox message={err} onRetry={load} />
  if (!d) return <LoadingList />

  const { m, c, lines, grns, invs, site } = d
  const cc = c.cost_centers
  const overInv = Number(m.invoiced_not_received) > 0.001
  const uninv = Number(m.uninvoiced_value)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold"><RefCode>{c.number}</RefCode></h2>
        <StatusBadge status={c.status} />
      </div>
      <div className="text-sm text-muted-foreground">
        {c.vendors?.name || "—"} · {cc ? `${cc.name_ar || cc.name_en || ""} (${cc.code})` : "—"} · {c.description}
      </div>

      <MetricStrip tiles={[
        { label: t("match.ordered"), value: kd(m.ordered_value) },
        { label: t("match.received"), value: kd(m.received_amount) },
        {
          label: t("match.invoiced"), value: kd(m.invoiced_amount),
          tone: overInv ? "danger" : undefined,
        },
        {
          label: t("match.uninvoiced"),
          value: uninv > 0.001 ? kd(uninv) : t("match.fullyInvoiced"),
          tone: uninv > 0.001 ? "warning" : "success",
        },
      ]} />
      {overInv && (
        <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">
          ⚠ {t("match.overInvoiced", { v: kd(m.invoiced_not_received) })}
        </div>
      )}

      {lines.length > 0 && (
        <Card><CardContent className="flex flex-col gap-2 px-4 py-3">
          <div className="text-sm font-semibold">{t("match.lines")}</div>
          {lines.map((l: any) => {
            const open = l.open_qty != null && Number(l.open_qty) > 0
            return (
              <div key={l.line_id} className="flex flex-wrap items-baseline gap-1 text-sm">
                <span className="text-muted-foreground">{l.line_no}.</span> {l.item} —
                {l.ordered_qty != null ? (
                  <>
                    <span className="tabular-nums"> {t("match.lineOrdered")} <b>{qty(l.ordered_qty)} {l.unit}</b> ·
                      {" "}{t("match.lineReceived")} <b>{qty(l.received_qty)}</b></span>
                    {Number(l.pending_qty) > 0 && (
                      <span className="text-warning"> (+{qty(l.pending_qty)} {t("match.pendingSuffix")})</span>
                    )}
                    {open
                      ? <span className="text-warning"> · {t("match.lineOpen")} {qty(l.open_qty)}</span>
                      : <span className="text-success"> · ✓ {t("match.lineDone")}</span>}
                  </>
                ) : <span className="tabular-nums"> {kd(l.ordered_amount)}</span>}
              </div>
            )
          })}
        </CardContent></Card>
      )}

      {(grns.length > 0 || site.length > 0 || invs.length > 0) && (
        <Card><CardContent className="flex flex-col gap-2 px-4 py-3">
          {grns.length > 0 && (
            <>
              <div className="text-sm font-semibold">{t("match.grns")}</div>
              {grns.map((g: any) => (
                <div key={g.id} className="text-sm">
                  <RefCode>{g.grn_no}</RefCode> · <span className="tabular-nums">{kd(g.amount)}</span> ·{" "}
                  <StatusBadge status={g.approval_status} /> · <span className="text-muted-foreground">{fmtKW(g.created_at)}</span>
                </div>
              ))}
            </>
          )}
          {site.length > 0 && (
            <>
              {grns.length > 0 && <Separator />}
              <div className="text-sm font-semibold">{t("match.siteNotes")}</div>
              {site.map((s: any) => (
                <div key={s.id} className="text-sm">
                  <RefCode>{s.receipt_id}</RefCode> · {s.material} <span className="tabular-nums">{qty(s.quantity)} {s.unit}</span> ·{" "}
                  <StatusBadge status={s.approval_status} /> · <span className="text-muted-foreground">{fmtKW(s.ts)}</span>
                </div>
              ))}
            </>
          )}
          {invs.length > 0 && (
            <>
              {(grns.length > 0 || site.length > 0) && <Separator />}
              <div className="text-sm font-semibold">{t("match.invoices")}</div>
              {invs.map((i: any) => (
                <div key={i.id} className="text-sm">
                  <RefCode>{i.supplier_invoice_no}</RefCode> · <span className="tabular-nums">{kd(i.amount)}</span> ·{" "}
                  <span className="text-muted-foreground">{fmtKWDate(i.invoice_date)}</span>
                </div>
              ))}
            </>
          )}
        </CardContent></Card>
      )}
    </div>
  )
}
