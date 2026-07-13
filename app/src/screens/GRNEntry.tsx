import { useCallback, useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ErrorBox, LoadingList, RefCode, StatusBadge } from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { fmtKW, kd, qty as fq } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* Office capture channel: goods receipt against an active LPO. Exact
   duplicate supplier invoices are refused by constraint; a same-amount
   invoice within 30 days needs the explicit force confirmation. */

export default function GRNEntry() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [m, setM] = useState<any | null>(null)
  const [err, setErr] = useState("")
  const [formErr, setFormErr] = useState("")
  const [nearDup, setNearDup] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID())

  const [lpo, setLpo] = useState("")
  const [lines, setLines] = useState<any[]>([])
  const [lineId, setLineId] = useState("")
  const [desc, setDesc] = useState("")
  const [q, setQ] = useState("")
  const [unit, setUnit] = useState("")
  const [amount, setAmount] = useState("")
  const [invNo, setInvNo] = useState("")
  const [invDate, setInvDate] = useState("")

  const load = useCallback(async () => {
    setErr(""); setM(null)
    try {
      const [lpos, recent] = await Promise.all([
        supabase.from("commitments").select("id,number,value,vendors(name)")
          .eq("ctype", "LPO").eq("status", "نشط").order("created_at", { ascending: false }).limit(300),
        supabase.from("grns").select("*,commitments(number,vendors(name))")
          .order("created_at", { ascending: false }).limit(20),
      ])
      if (lpos.error) throw lpos.error
      setM({ lpos: lpos.data || [], recent: recent.data || [] })
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  const selectedLpo = useMemo(() => m?.lpos.find((l: any) => String(l.id) === lpo), [m, lpo])

  async function pickLpo(id: string) {
    setLpo(id); setLineId(""); setLines([])
    if (!id) return
    const { data } = await supabase.from("commitment_lines").select("*")
      .eq("commitment_id", id).order("line_no")
    setLines(data || [])
  }

  async function submit(force = false) {
    setFormErr(""); if (!force) setNearDup(null)
    if (!lpo) return setFormErr(t("grn.lpoPick"))
    if (!desc.trim() || !(parseFloat(amount) > 0)) return setFormErr(t("login.required"))
    if (invNo.trim() && !invDate) return setFormErr(t("grn.invoiceDate"))
    setBusy(true)
    try {
      const r = await rpc("grn_submit", {
        p_pin: user.pin, p_client_ref: clientRef, p_commitment_id: Number(lpo),
        p_description: desc.trim(), p_quantity: q ? parseFloat(q) : null,
        p_unit: unit.trim(), p_amount: parseFloat(amount),
        p_line_id: lineId ? Number(lineId) : null,
        p_invoice_no: invNo.trim(), p_invoice_date: invDate || null,
        p_force: force, p_note: "",
      })
      if (r?.success) {
        toast.success(`${t("grn.saved")} — ${r.grnNo}`)
        setClientRef(crypto.randomUUID())
        setDesc(""); setQ(""); setUnit(""); setAmount(""); setInvNo(""); setInvDate(""); setLineId("")
        await load()
      } else if (r?.nearDuplicate) setNearDup(r)
      else if (r?.duplicate) setFormErr(t("grn.dupInvoice"))
      else setFormErr(t("req.errGeneric"))
    } catch { setFormErr(t("common.error")) }
    setBusy(false)
  }

  if (err && !m) return <ErrorBox message={err} onRetry={load} />
  if (!m) return <LoadingList />

  return (
    <div className="flex flex-col gap-4">
      <Card><CardContent className="flex flex-col gap-4 px-4 py-4">
        <h2 className="text-base font-semibold">{t("grn.title")}</h2>
        <div className="flex flex-col gap-1.5">
          <Label>{t("grn.lpo")}</Label>
          <Select value={lpo} onValueChange={pickLpo}>
            <SelectTrigger><SelectValue placeholder={t("grn.lpoPick")} /></SelectTrigger>
            <SelectContent>
              {m.lpos.map((l: any) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.number} · {l.vendors?.name || ""} · {kd(l.value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {lines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("grn.line")}</Label>
            <Select value={lineId} onValueChange={setLineId}>
              <SelectTrigger><SelectValue placeholder={t("req.blLinePick")} /></SelectTrigger>
              <SelectContent>
                {lines.map((l: any) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.line_no}. {l.item}{l.qty ? ` (${fq(l.qty)} ${l.unit})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label>{t("grn.desc")}</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t("grn.qty")}</Label>
            <Input dir="ltr" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("grn.unit")}</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("grn.amount")}</Label>
            <Input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t("grn.invoiceNo")}</Label>
            <Input dir="ltr" value={invNo} onChange={(e) => setInvNo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("grn.invoiceDate")}</Label>
            <Input type="date" dir="ltr" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
          </div>
        </div>
        {nearDup && (
          <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-surface p-3 text-sm text-warning">
            {t("grn.nearDup", { no: nearDup.existingNo, date: nearDup.existingDate })}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => submit(true)}>
              {t("grn.force")}
            </Button>
          </div>
        )}
        {formErr && <ErrorBox message={formErr} />}
        <Button size="lg" disabled={busy || !selectedLpo} onClick={() => submit(false)}>
          📦 {t("grn.save")}
        </Button>
      </CardContent></Card>

      {m.recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("grn.recent")}</h3>
          {m.recent.map((g: any) => (
            <Card key={g.id} className="py-2"><CardContent className="px-4 text-sm">
              <div className="flex items-center justify-between">
                <RefCode>{g.grn_no}</RefCode>
                <StatusBadge status={g.approval_status} />
              </div>
              <div className="text-muted-foreground">
                {g.description} · {kd(g.amount)} · <RefCode>{g.commitments?.number}</RefCode> · {fmtKW(g.created_at)}
                {g.supplier_invoice_id ? ` · 🧾` : ""}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}
