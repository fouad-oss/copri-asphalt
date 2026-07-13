import { useCallback, useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ErrorBox, LoadingList, RefCode } from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { kd } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* The always-open intake door: register an already-approved paper PO
   directly into the register (origin='manual'). Slice 4 restricts this
   to exceptions once the request portal has earned trust. */

type Line = { item: string; qty: string; unit: string; rate: string }

export default function ManualPO() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [m, setM] = useState<any | null>(null)
  const [err, setErr] = useState("")
  const [formErr, setFormErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<any | null>(null)
  const [clientRef] = useState(() => crypto.randomUUID())

  const [type, setType] = useState("LPO")
  const [cc, setCc] = useState("")
  const [vendor, setVendor] = useState("")
  const [desc, setDesc] = useState("")
  const [note, setNote] = useState("")
  const [value, setValue] = useState("")
  const [lines, setLines] = useState<Line[]>([])

  const load = useCallback(async () => {
    setErr(""); setM(null)
    try {
      const [ccs, vendors] = await Promise.all([
        supabase.from("cost_centers").select("*").eq("active", true).order("kind", { ascending: false }).order("code"),
        supabase.from("vendors").select("id,name,kind").eq("active", true).order("name"),
      ])
      if (ccs.error || vendors.error) throw ccs.error || vendors.error
      setM({ ccs: ccs.data || [], vendors: vendors.data || [] })
      if (user.costCenterId) setCc(String(user.costCenterId))
    } catch { setErr(t("common.error")) }
  }, [t, user.costCenterId])
  useEffect(() => { void load() }, [load])

  const linesTotal = useMemo(() =>
    lines.reduce((s, L) => s + (parseFloat(L.qty) || 0) * (parseFloat(L.rate) || 0), 0), [lines])
  const shownValue = lines.length && linesTotal > 0 ? linesTotal.toFixed(3) : value

  async function submit() {
    setFormErr("")
    if (!cc || !vendor || !desc.trim()) return setFormErr(t("login.required"))
    const val = parseFloat(shownValue)
    if (!(val > 0)) return setFormErr(t("req.value"))
    const payload: any[] = []
    for (const L of lines) {
      if (!L.item.trim()) return setFormErr(t("req.lineItem"))
      payload.push({
        item: L.item.trim(), unit: L.unit.trim(),
        qty: L.qty ? parseFloat(L.qty) : null, rate: L.rate ? parseFloat(L.rate) : null,
      })
    }
    setBusy(true)
    try {
      const r = await rpc("po_entry", {
        p_pin: user.pin, p_client_ref: clientRef, p_type: type,
        p_cost_center_id: Number(cc), p_vendor_id: Number(vendor),
        p_description: desc.trim(), p_value: val,
        p_lines: payload, p_note: note.trim(),
      })
      if (r?.success) setDone(r)
      else setFormErr(t("req.errGeneric"))
    } catch { setFormErr(t("common.error")) }
    setBusy(false)
  }

  if (err && !m) return <ErrorBox message={err} onRetry={load} />
  if (!m) return <LoadingList />
  if (done) return (
    <Card><CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="text-3xl">✅</div>
      <div className="text-sm">{t("po.saved")} <RefCode className="text-lg">{done.number}</RefCode></div>
      <Button className="mt-2" onClick={() => window.location.reload()}>{t("req.again")}</Button>
    </CardContent></Card>
  )

  return (
    <Card><CardContent className="flex flex-col gap-4 px-4 py-4">
      <div>
        <h2 className="text-base font-semibold">{t("po.manualTitle")}</h2>
        <div className="text-xs text-muted-foreground">{t("po.manualHint")}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("req.type")}</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="LPO">{t("req.typeLPO")}</SelectItem>
            <SelectItem value="WO">{t("req.typeWO")}</SelectItem>
            <SelectItem value="CON">{t("req.typeCON")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("req.cc")}</Label>
        <Select value={cc} onValueChange={setCc}>
          <SelectTrigger><SelectValue placeholder={t("req.ccPick")} /></SelectTrigger>
          <SelectContent>
            {m.ccs.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {(c.name_ar || c.name_en) ? `${c.name_ar || c.name_en} (${c.code})` : c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("req.vendor")}</Label>
        <Select value={vendor} onValueChange={setVendor}>
          <SelectTrigger><SelectValue placeholder={t("req.vendorPick")} /></SelectTrigger>
          <SelectContent>
            {m.vendors.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("req.desc")}</Label>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="text-sm font-semibold">{t("po.lines")}</div>
        {lines.map((L, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
            <Input placeholder={t("req.lineItem")} value={L.item}
              onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, item: e.target.value } : x))} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder={t("grn.qty")} dir="ltr" inputMode="decimal" value={L.qty}
                onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
              <Input placeholder={t("req.lineUnit")} value={L.unit}
                onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
              <Input placeholder={t("req.lineRate")} dir="ltr" inputMode="decimal" value={L.rate}
                onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
            </div>
            <button type="button" className="self-start text-xs text-danger underline"
              onClick={() => setLines((o) => o.filter((_, j) => j !== i))}>
              {t("req.removeLine")}
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm"
          onClick={() => setLines((o) => [...o, { item: "", qty: "", unit: "", rate: "" }])}>
          {t("req.addLine")}
        </Button>
        {lines.length > 0 && <div className="text-sm">{t("req.linesTotal", { v: kd(linesTotal) })}</div>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("req.value")}</Label>
        <Input dir="ltr" inputMode="decimal" value={shownValue}
          readOnly={lines.length > 0 && linesTotal > 0}
          className={lines.length > 0 && linesTotal > 0 ? "bg-secondary" : ""}
          onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("po.note")}</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {formErr && <ErrorBox message={formErr} />}
      <Button size="lg" disabled={busy} onClick={submit}>📄 {t("po.save")}</Button>
    </CardContent></Card>
  )
}
