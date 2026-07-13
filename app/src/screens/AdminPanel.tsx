import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState, ErrorBox, LoadingList } from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { fmtKW } from "@/lib/format"

/* ADMIN pattern — the audit log as a readable feed (time · actor ·
   action · reference) plus the approval-chain config. User management
   stays in the Supabase dashboard (pipeline_users carries PINs and has
   no anon read policy — by design). */

export default function AdminPanel() {
  const { t } = useTranslation()
  const [d, setD] = useState<any | null>(null)
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    setErr(""); setD(null)
    try {
      const [audit, gates] = await Promise.all([
        supabase.from("pipeline_audit").select("*").order("at", { ascending: false }).limit(100),
        supabase.from("approval_chain_gates").select("*").order("chain").order("gate_no"),
      ])
      if (audit.error) throw audit.error
      setD({ audit: audit.data || [], gates: gates.data || [] })
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  if (err && !d) return <ErrorBox message={err} onRetry={load} />
  if (!d) return <LoadingList />

  return (
    <div className="flex flex-col gap-4">
      {d.gates.length > 0 && (
        <Card><CardContent className="flex flex-col gap-2 px-4 py-3">
          <h3 className="text-sm font-semibold">{t("admin.gates")}</h3>
          {d.gates.map((g: any) => (
            <div key={g.id} className="text-sm">
              <span className="ref-code">{g.chain}</span> · {t("admin.gateNo")} {g.gate_no} →{" "}
              <b>{g.label || t(`admin.capMap.${g.capability}`, { defaultValue: g.capability })}</b>
              {!g.active && <span className="ms-1 text-xs text-muted-foreground">(inactive)</span>}
            </div>
          ))}
        </CardContent></Card>
      )}

      <h3 className="text-sm font-semibold">{t("admin.audit")}</h3>
      {!d.audit.length ? <EmptyState title={t("admin.auditEmpty")} /> : (
        <Card><CardContent className="flex flex-col gap-1.5 px-4 py-3">
          {d.audit.map((a: any) => (
            <div key={a.id} className="border-b pb-1.5 text-xs last:border-0">
              <span className="text-muted-foreground">{fmtKW(a.at)}</span> · <b>{a.actor}</b> ·{" "}
              {a.action} <span className="ref-code">{a.table_name}#{a.row_id}</span>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
