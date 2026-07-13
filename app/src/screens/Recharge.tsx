import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorBox, LoadingList, RefCode, StatusBadge } from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { kd } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* Monthly internal recharge (0015): refuses to generate until every
   needed policy rate exists — the missing item strings come back
   verbatim so they can be added to recharge_rates. */

function prevKuwaitMonth(): string {
  const kw = new Date(Date.now() + 3 * 3600e3)
  kw.setUTCDate(1); kw.setUTCMonth(kw.getUTCMonth() - 1)
  return `${kw.getUTCFullYear()}-${String(kw.getUTCMonth() + 1).padStart(2, "0")}`
}

export default function Recharge() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [period, setPeriod] = useState(prevKuwaitMonth())
  const [missing, setMissing] = useState<any[] | null>(null)

  const load = useCallback(async () => {
    setErr(""); setData(null)
    try {
      const [inv, rates] = await Promise.all([
        supabase.from("internal_invoices")
          .select("*,vendors(name),cost_centers(code,name_ar,name_en)")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("recharge_rates").select("*,vendors(name,handle)").eq("active", true),
      ])
      if (inv.error) throw inv.error
      setData({ invoices: inv.data || [], rates: rates.data || [] })
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  async function run() {
    if (!period) return
    setBusy(true); setMissing(null)
    try {
      const r = await rpc("recharge_run", { p_pin: user.pin, p_period: period })
      if (r?.success) { toast.success(t("status.approved")); await load() }
      else if (r?.missingRates) setMissing(r.missingRates)
      else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }
  async function issue(id: number) {
    setBusy(true)
    try {
      const r = await rpc("internal_invoice_issue", { p_pin: user.pin, p_id: id })
      if (r?.success) await load(); else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }

  if (err && !data) return <ErrorBox message={err} onRetry={load} />
  if (!data) return <LoadingList />
  const names: Record<string, string> = { plant: "المصنع", milling: "القشط", garage: "الكراج" }

  return (
    <div className="flex flex-col gap-4">
      <Card><CardContent className="flex flex-col gap-3 px-4 py-4">
        <h2 className="text-base font-semibold">{t("recharge.title")}</h2>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t("recharge.period")}</Label>
            <Input type="month" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <Button disabled={busy || !period} onClick={run}>🔁 {t("recharge.run")}</Button>
        </div>
        {missing && (
          <div className="rounded-md border border-warning/40 bg-warning-surface p-3 text-sm text-warning">
            ⚠️ <b>{t("recharge.missing")}</b>
            {missing.map((m: any, i: number) => (
              <div key={i}>• {names[m.vendor] || m.vendor}: <b>{m.item}</b></div>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {data.rates.length
            ? `${t("recharge.rates")}: ${data.rates.map((r: any) => `${r.item} = ${r.rate} د.ك/${r.unit || "—"}`).join(" · ")}`
            : t("recharge.noRates")}
        </div>
      </CardContent></Card>

      {data.invoices.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("recharge.invoices")}</h3>
          {data.invoices.map((v: any) => (
            <Card key={v.id} className="py-2"><CardContent className="flex items-center justify-between gap-2 px-4 text-sm">
              <div>
                <RefCode>{v.inv_no}</RefCode> · {v.period} · {v.vendors?.name || "—"} → {v.cost_centers?.code || "—"} · <b>{kd(v.amount)}</b>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={v.status} />
                {v.status === "مسودة" && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => issue(v.id)}>
                    {t("recharge.issue")}
                  </Button>
                )}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}
