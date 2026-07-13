import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Bar, EmptyState, ErrorBox, LoadingList, MetricStrip, RefCode, StatusBadge,
} from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { kd, qty as fq } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* Subcontract register (0021): value vs certified vs back-charges vs
   retention held. Accountant actions live in the expanded DETAIL:
   add a materials back-charge, record a certificate (pending charges
   deduct on it atomically). */

function Detail({ s, user, onChanged }: { s: any; user: Profile; onChanged: () => void }) {
  const { t } = useTranslation()
  const [d, setD] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [chDesc, setChDesc] = useState(""); const [chQty, setChQty] = useState("")
  const [chUnit, setChUnit] = useState(""); const [chAmt, setChAmt] = useState("")
  const [gross, setGross] = useState(""); const [period, setPeriod] = useState("")
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    const [certs, charges] = await Promise.all([
      supabase.from("payment_certificates").select("*").eq("subcontract_id", s.id).order("cert_no", { ascending: false }),
      supabase.from("sub_material_charges").select("*").eq("subcontract_id", s.id).order("created_at", { ascending: false }),
    ])
    const pend = (charges.data || []).filter((c: any) => c.status === "معلق")
    setD({ certs: certs.data || [], charges: charges.data || [], pend })
    setPicked(new Set(pend.map((c: any) => c.id)))
  }, [s.id])
  useEffect(() => { void load() }, [load])

  if (!d) return <LoadingList rows={2} />
  const canAct = user.accountant && s.status === "نشط"
  const g = parseFloat(gross) || 0
  const ret = Math.round(g * s.retention_pct * 1000 / 100) / 1000
  const chSum = d.pend.filter((c: any) => picked.has(c.id)).reduce((a: number, c: any) => a + Number(c.amount), 0)

  async function addCharge() {
    if (!(parseFloat(chAmt) > 0)) return
    setBusy(true)
    try {
      const r = await rpc("sub_charge_add", {
        p_pin: user.pin, p_subcontract_id: s.id, p_amount: parseFloat(chAmt),
        p_description: chDesc.trim(), p_quantity: chQty ? parseFloat(chQty) : null, p_unit: chUnit.trim(),
      })
      if (r?.success) { setChDesc(""); setChQty(""); setChUnit(""); setChAmt(""); await load(); onChanged() }
      else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }
  async function recordCert() {
    if (!(g > 0)) return
    setBusy(true)
    try {
      const r = await rpc("certificate_record", {
        p_pin: user.pin, p_subcontract_id: s.id, p_gross: g,
        p_period: period.trim(), p_charge_ids: Array.from(picked),
      })
      if (r?.success) { setGross(""); setPeriod(""); await load(); onChanged() }
      else toast.error(t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      {d.certs.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">{t("subs.certsTitle")}</div>
          {d.certs.map((pc: any) => (
            <div key={pc.id} className="text-sm">
              <b>{t("subs.certLine", { n: pc.cert_no })}</b>{pc.period ? ` (${pc.period})` : ""} ·{" "}
              {t("subs.gross")} {kd(pc.gross_amount)} − {t("subs.ret")} {kd(pc.retention_amount)} −{" "}
              {t("subs.back")} {kd(pc.backcharge_amount)} = <b>{kd(pc.net_amount)}</b>
            </div>
          ))}
        </div>
      )}
      {d.charges.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">{t("subs.chargesTitle")}</div>
          {d.charges.map((c: any) => (
            <div key={c.id} className="text-sm">
              {c.description || "—"}{c.quantity ? ` · ${fq(c.quantity)} ${c.unit || ""}` : ""} · <b>{kd(c.amount)}</b> ·{" "}
              {c.status === "معلق"
                ? <span className="text-warning">{t("subs.pendingWith")}</span>
                : <span className="text-success">{t("subs.deducted")}</span>}
            </div>
          ))}
        </div>
      )}
      {canAct && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="text-sm font-semibold">{t("subs.addCharge")}</div>
            <Input placeholder={t("subs.chargeDesc")} value={chDesc} onChange={(e) => setChDesc(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder={t("grn.qty")} dir="ltr" inputMode="decimal" value={chQty} onChange={(e) => setChQty(e.target.value)} />
              <Input placeholder={t("grn.unit")} value={chUnit} onChange={(e) => setChUnit(e.target.value)} />
              <Input placeholder={t("subs.chargeAmount")} dir="ltr" inputMode="decimal" value={chAmt} onChange={(e) => setChAmt(e.target.value)} />
            </div>
            <Button size="sm" variant="secondary" disabled={busy} onClick={addCharge}>{t("common.save")}</Button>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="text-sm font-semibold">{t("subs.recordCert")}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t("subs.certGross")}</Label>
                <Input dir="ltr" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("subs.certPeriod")}</Label>
                <Input dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
            </div>
            {d.pend.length > 0 && (
              <>
                <div className="text-xs text-muted-foreground">{t("subs.deductOn")}:</div>
                {d.pend.map((c: any) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => {
                      setPicked((old) => {
                        const n = new Set(old); if (v) n.add(c.id); else n.delete(c.id); return n
                      })
                    }} />
                    {c.description || "—"} — {kd(c.amount)}
                  </label>
                ))}
              </>
            )}
            <div className="text-xs text-muted-foreground">
              {t("subs.netPreview", { g: kd(g), rp: s.retention_pct, r: kd(ret), c: kd(chSum), n: kd(g - ret - chSum) })}
            </div>
            <Button size="sm" disabled={busy || !(g > 0)} onClick={recordCert}>{t("common.save")}</Button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Subcontracts() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [subs, setSubs] = useState<any[] | null>(null)
  const [cons, setCons] = useState<any[]>([])
  const [err, setErr] = useState("")
  const [open, setOpen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [con, setCon] = useState(""); const [scope, setScope] = useState("")
  const [retPct, setRetPct] = useState("10"); const [adv, setAdv] = useState("")
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [doc, setDoc] = useState("")

  const load = useCallback(async () => {
    setErr(""); setSubs(null)
    try {
      const [s, c] = await Promise.all([
        supabase.from("subcontract_overview").select("*").order("id", { ascending: false }).limit(200),
        supabase.from("commitments").select("id,number,value,vendors(name)")
          .eq("ctype", "CON").eq("status", "نشط").order("created_at", { ascending: false }),
      ])
      if (s.error) throw s.error
      setSubs(s.data || []); setCons(c.data || [])
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  if (err && !subs) return <ErrorBox message={err} onRetry={load} />
  if (!subs) return <LoadingList />

  const registered = new Set(subs.map((s) => s.commitment_id))
  const unregistered = cons.filter((c) => !registered.has(c.id))
  const canRegister = (user.approver || user.accountant) && unregistered.length > 0

  async function register() {
    const ret = parseFloat(retPct)
    if (!con || !(ret >= 0 && ret <= 100)) { toast.error(t("subs.retention")); return }
    setBusy(true)
    try {
      const r = await rpc("subcontract_register", {
        p_pin: user.pin, p_commitment_id: Number(con), p_scope: scope.trim(),
        p_retention_pct: ret, p_advance: parseFloat(adv) || 0,
        p_valid_from: from || null, p_valid_to: to || null, p_doc_url: doc.trim(),
      })
      if (r?.success) { setCon(""); setScope(""); setAdv(""); setDoc(""); await load() }
      else toast.error(r?.error === "already registered" ? t("subs.alreadyRegistered") : t("req.errGeneric"))
    } catch { toast.error(t("common.error")) }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {canRegister && (
        <Card><CardContent className="flex flex-col gap-3 px-4 py-4">
          <h3 className="text-sm font-semibold">{t("subs.registerTitle")}</h3>
          <div className="flex flex-col gap-1.5">
            <Label>{t("subs.commitment")}</Label>
            <Select value={con} onValueChange={setCon}>
              <SelectTrigger><SelectValue placeholder={t("subs.commitmentPick")} /></SelectTrigger>
              <SelectContent>
                {unregistered.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.number} · {c.vendors?.name || ""} · {kd(c.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">{t("subs.commitmentHint")}</div>
          </div>
          <Textarea placeholder={t("subs.scope")} value={scope} onChange={(e) => setScope(e.target.value)} className="min-h-16" />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("subs.retention")}</Label>
              <Input dir="ltr" inputMode="decimal" value={retPct} onChange={(e) => setRetPct(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("subs.advance")}</Label>
              <Input dir="ltr" inputMode="decimal" value={adv} onChange={(e) => setAdv(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("req.validFrom")}</Label>
              <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("req.validTo")}</Label>
              <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Input placeholder={t("subs.docUrl")} dir="ltr" value={doc} onChange={(e) => setDoc(e.target.value)} />
          <Button disabled={busy} onClick={register}>🏗 {t("subs.register")}</Button>
        </CardContent></Card>
      )}

      <h2 className="text-base font-semibold">{t("subs.title")} ({subs.length})</h2>
      {!subs.length ? <EmptyState title={t("subs.empty")} /> : subs.map((s) => (
        <Card key={s.id} className="py-3"><CardContent className="flex flex-col gap-2 px-4">
          <div className="flex items-center justify-between gap-2">
            <RefCode className="text-sm">{s.number}</RefCode>
            <StatusBadge status={s.status} />
          </div>
          <div className="text-sm">{s.vendor_name || "—"}{s.scope ? ` · ${s.scope}` : ""}</div>
          <Bar value={Number(s.certified_amount)} max={Number(s.contract_value)} />
          <MetricStrip tiles={[
            { label: t("subs.contractValue"), value: kd(s.contract_value) },
            { label: `${t("subs.certified")} (${t("subs.certs", { n: s.cert_count })})`, value: kd(s.certified_amount) },
            { label: t("subs.retentionHeld"), value: kd(s.retention_held) },
            {
              label: t("subs.pendingCharges"), value: kd(s.backcharges_pending),
              tone: Number(s.backcharges_pending) > 0 ? "warning" : undefined,
            },
          ]} />
          <div className="text-xs text-muted-foreground">
            {t("subs.deductedCharges")}: {kd(s.backcharges_deducted)}
            {Number(s.advance_amount) > 0 ? ` · ${t("subs.advanceShort")} ${kd(s.advance_amount)}` : ""}
            {s.doc_url ? <> · <a className="underline" href={s.doc_url} target="_blank" rel="noopener">📎 {t("subs.doc")}</a></> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(open === s.id ? null : s.id)}>
            {open === s.id ? "▴" : "▾"} {t("common.details")}
          </Button>
          {open === s.id && <Detail s={s} user={user} onChanged={load} />}
        </CardContent></Card>
      ))}
    </div>
  )
}
