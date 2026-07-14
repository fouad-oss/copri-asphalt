import { useCallback, useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ErrorBox, LoadingList, RefCode } from "@/components/patterns"
import { supabase, rpc } from "@/lib/supabase"
import { kd, qty as fq } from "@/lib/format"
import type { Profile } from "@/lib/session"

/* Request intake. Call-offs lock the vendor to the blanket's; on a
   line-controlled blanket the value derives from qty × agreed rate; a
   blanket request carries proposed item lines (qty is the control). */

type Line = { item: string; unit: string; qty: string; rate: string }
// Per-unit request line (0023): item from the canonical master or free text
type ReqLine = { itemId: string; itemText: string; unit: string; qty: string; rate: string }

export default function NewRequest() {
  const { t } = useTranslation()
  const user = useOutletContext<Profile>()
  const [m, setM] = useState<any | null>(null)
  const [err, setErr] = useState("")
  const [formErr, setFormErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<any | null>(null)
  const [clientRef] = useState(() => crypto.randomUUID())

  const [type, setType] = useState("WO")
  const [cc, setCc] = useState("")
  const [vendor, setVendor] = useState("")
  const [blanket, setBlanket] = useState("")
  const [blLine, setBlLine] = useState("")
  const [blQty, setBlQty] = useState("")
  const [isBlanket, setIsBlanket] = useState(false)
  const [cat, setCat] = useState("")
  const [rateRef, setRateRef] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const [reqLines, setReqLines] = useState<ReqLine[]>([])
  const [desc, setDesc] = useState("")
  const [value, setValue] = useState("")

  const load = useCallback(async () => {
    setErr(""); setM(null)
    try {
      const [ccs, vendors, blankets, lineDraw, cats, items] = await Promise.all([
        supabase.from("cost_centers").select("*").eq("active", true).order("kind", { ascending: false }).order("code"),
        supabase.from("vendors").select("id,name,kind").eq("active", true).order("name"),
        supabase.from("blanket_lpos").select("*,vendors(name),commitments!blanket_lpos_commitment_id_fkey(number)").eq("status", "نشط"),
        supabase.from("blanket_line_drawdown").select("*").order("line_no"),
        supabase.from("list_options").select("value").eq("kind", "blanket_category").order("sort_order"),
        supabase.from("items").select("id,name,unit").eq("active", true).order("name").limit(1000),
      ])
      if (ccs.error || vendors.error) throw ccs.error || vendors.error
      const bl = (blankets.data || []).map((b: any) => ({
        ...b, lines: (lineDraw.data || []).filter((l: any) => l.blanket_id === b.id),
      }))
      setM({ ccs: ccs.data || [], vendors: vendors.data || [], blankets: bl,
             cats: (cats.data || []).map((c: any) => c.value), items: items.data || [] })
      if (user.costCenterId) setCc(String(user.costCenterId))
    } catch { setErr(t("common.error")) }
  }, [t, user.costCenterId])
  useEffect(() => { void load() }, [load])

  const bl = useMemo(() => m?.blankets.find((b: any) => String(b.id) === blanket), [m, blanket])
  const ln = useMemo(() => bl?.control_mode === "lines"
    ? bl.lines.find((l: any) => String(l.line_id) === blLine) : null, [bl, blLine])

  const linesTotal = useMemo(() =>
    lines.reduce((s, L) => s + (parseFloat(L.qty) || 0) * (parseFloat(L.rate) || 0), 0), [lines])
  const reqLinesTotal = useMemo(() =>
    reqLines.reduce((s, L) => s + (parseFloat(L.qty) || 0) * (parseFloat(L.rate) || 0), 0), [reqLines])
  const derived = ln ? (parseFloat(blQty) || 0) * ln.agreed_rate
    : isBlanket && lines.length ? linesTotal
    : reqLines.length ? reqLinesTotal : null
  const shownValue = derived != null ? derived.toFixed(3) : value

  const vendorKinds: Record<string, string[] | null> =
    { WO: ["subcontractor", "internal"], LPO: ["supplier", "internal"], CON: null }
  const vendorList = useMemo(() => {
    if (!m) return []
    const kinds = vendorKinds[type]
    const list = kinds ? m.vendors.filter((v: any) => kinds.includes(v.kind)) : m.vendors
    return list.length ? list : m.vendors
  }, [m, type])

  function pickBlanket(id: string) {
    setBlanket(id); setBlLine(""); setBlQty("")
    const b = m?.blankets.find((x: any) => String(x.id) === id)
    if (b) { setVendor(String(b.vendor_id)); setIsBlanket(false) }
  }

  async function submit() {
    setFormErr("")
    const fail = (s: string) => setFormErr(s)
    if (!cc) return fail(t("req.ccPick"))
    if (!vendor) return fail(t("req.vendorPick"))
    if (!desc.trim()) return fail(t("req.desc"))
    if (bl?.control_mode === "lines" && !blLine) return fail(t("req.blLinePick"))
    if (ln && !(parseFloat(blQty) > 0)) return fail(t("req.blQty"))
    const val = parseFloat(shownValue)
    if (!(val > 0)) return fail(t("req.value"))
    if (isBlanket && (!cat || !from || !to)) return fail(t("req.blCat"))
    const payload: any[] = []
    if (isBlanket) {
      for (const L of lines) {
        if (!L.item.trim() || !(parseFloat(L.qty) > 0) || !(parseFloat(L.rate) >= 0))
          return fail(t("req.linesTitle"))
        payload.push({ item: L.item.trim(), unit: L.unit.trim(), qty: parseFloat(L.qty), rate: parseFloat(L.rate) })
      }
      if (!payload.length) return fail(t("req.addLine"))
    }
    // Per-unit request lines (0023)
    const reqPayload: any[] = []
    if (!isBlanket && !ln && !blanket) {
      for (const L of reqLines) {
        const name = L.itemId === "free" ? L.itemText.trim()
          : (m.items.find((x: any) => String(x.id) === L.itemId)?.name || "")
        if (!name) return fail(t("req.itemPick"))
        if (!(parseFloat(L.qty) > 0) || !(parseFloat(L.rate) >= 0))
          return fail(t("req.reqLinesTitle"))
        reqPayload.push({
          item: name, item_id: L.itemId === "free" ? null : Number(L.itemId),
          unit: L.unit.trim(), qty: parseFloat(L.qty), rate: parseFloat(L.rate),
        })
      }
    }
    setBusy(true)
    try {
      const r = await rpc("request_submit", {
        p_pin: user.pin, p_client_ref: clientRef, p_type: type,
        p_cost_center_id: Number(cc), p_vendor_id: Number(vendor),
        p_description: desc.trim(), p_value: val,
        p_blanket_id: !ln && blanket ? Number(blanket) : null,
        p_is_blanket: isBlanket,
        p_blanket_category: isBlanket ? cat : "",
        p_blanket_rate_ref: isBlanket ? rateRef.trim() : "",
        p_blanket_valid_from: isBlanket ? from : null,
        p_blanket_valid_to: isBlanket ? to : null,
        p_blanket_line_id: ln ? Number(blLine) : null,
        p_qty: ln ? parseFloat(blQty) : null,
        p_blanket_lines: payload,
        // omitted entirely when empty so pre-0023 servers still resolve
        ...(reqPayload.length ? { p_lines: reqPayload } : {}),
      })
      if (r?.success) setDone(r)
      else if (r?.error === "ceiling exceeded") fail(t("req.errCeiling", { v: kd(r.remaining) }))
      else if (r?.error === "line quantity exceeded") fail(t("req.errLineQty", { n: fq(r.remainingQty) }))
      else fail(t("req.errGeneric"))
    } catch { fail(t("common.error")) }
    setBusy(false)
  }

  if (err && !m) return <ErrorBox message={err} onRetry={load} />
  if (!m) return <LoadingList />

  if (done) return (
    <Card><CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="text-3xl">{done.auto ? "⚡" : "✅"}</div>
      <RefCode className="text-lg">{done.reqNo}</RefCode>
      <div className="text-sm text-muted-foreground">
        {done.auto ? <>{t("req.sentAuto")} <RefCode>{done.commitmentNo}</RefCode></> : t("req.sentQueue")}
      </div>
      <Button className="mt-2" onClick={() => { setDone(null); window.location.reload() }}>
        {t("req.again")}
      </Button>
    </CardContent></Card>
  )

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )

  return (
    <Card><CardContent className="flex flex-col gap-4 px-4 py-4">
      <h2 className="text-base font-semibold">{t("tabs.newRequest")}</h2>
      <F label={t("req.type")}>
        <Select value={type} onValueChange={(v) => { setType(v); setBlanket(""); setBlLine(""); setIsBlanket(false) }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="WO">{t("req.typeWO")}</SelectItem>
            <SelectItem value="LPO">{t("req.typeLPO")}</SelectItem>
            <SelectItem value="CON">{t("req.typeCON")}</SelectItem>
          </SelectContent>
        </Select>
      </F>
      <F label={t("req.cc")}>
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
      </F>

      {type === "LPO" && m.blankets.length > 0 && (
        <F label={t("req.callOff")}>
          <Select value={blanket || "none"} onValueChange={(v) => pickBlanket(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("req.callOffNone")}</SelectItem>
              {m.blankets.map((b: any) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {(b.commitments?.number || `#${b.id}`)} · {b.vendors?.name || ""} · {b.category} ·{" "}
                  {b.control_mode === "lines" ? `${b.lines.length} ${t("blanket.linesMode")}` : kd(b.ceiling)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">{t("req.callOffHint")}</div>
        </F>
      )}
      {bl?.control_mode === "lines" && (
        <>
          <F label={t("req.blLine")}>
            <Select value={blLine} onValueChange={setBlLine}>
              <SelectTrigger><SelectValue placeholder={t("req.blLinePick")} /></SelectTrigger>
              <SelectContent>
                {bl.lines.map((l: any) => (
                  <SelectItem key={l.line_id} value={String(l.line_id)}>
                    {l.line_no}. {l.item} — {l.agreed_rate} د.ك/{l.unit || "—"} · {t("req.remaining", { n: fq(l.remaining_qty), m: fq(l.agreed_qty) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label={t("req.blQty")}>
            <Input dir="ltr" inputMode="decimal" value={blQty} onChange={(e) => setBlQty(e.target.value)} />
          </F>
        </>
      )}

      <F label={t("req.vendor")}>
        <Select value={vendor} onValueChange={setVendor} disabled={!!bl}>
          <SelectTrigger><SelectValue placeholder={t("req.vendorPick")} /></SelectTrigger>
          <SelectContent>
            {vendorList.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </F>

      {/* Per-unit request lines (0023) — every request type, unless this
          is a call-off (lines come from the blanket) or a blanket request
          (which has its own lines editor below). */}
      {!bl && !isBlanket && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="text-sm font-semibold">{t("req.reqLinesTitle")}</div>
          {reqLines.map((L, i) => {
            const set = (patch: Partial<ReqLine>) =>
              setReqLines((o) => o.map((x, j) => j === i ? { ...x, ...patch } : x))
            return (
              <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
                <Select value={L.itemId} onValueChange={(v) => {
                  const it = m.items.find((x: any) => String(x.id) === v)
                  set({ itemId: v, itemText: it ? it.name : "", unit: it?.unit || L.unit })
                }}>
                  <SelectTrigger><SelectValue placeholder={t("req.itemPick")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">{t("req.freeText")}</SelectItem>
                    {m.items.map((it: any) => (
                      <SelectItem key={it.id} value={String(it.id)}>
                        {it.name}{it.unit ? ` (${it.unit})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {L.itemId === "free" && (
                  <Input placeholder={t("req.freeItemPh")} value={L.itemText}
                    onChange={(e) => set({ itemText: e.target.value })} />
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder={t("req.lineUnit")} value={L.unit}
                    onChange={(e) => set({ unit: e.target.value })} />
                  <Input placeholder={t("grn.qty")} dir="ltr" inputMode="decimal" value={L.qty}
                    onChange={(e) => set({ qty: e.target.value })} />
                  <Input placeholder={t("req.lineRate")} dir="ltr" inputMode="decimal" value={L.rate}
                    onChange={(e) => set({ rate: e.target.value })} />
                </div>
                <button type="button" className="self-start text-xs text-danger underline"
                  onClick={() => setReqLines((o) => o.filter((_, j) => j !== i))}>
                  {t("req.removeLine")}
                </button>
              </div>
            )
          })}
          <Button type="button" variant="secondary" size="sm"
            onClick={() => setReqLines((o) => [...o, { itemId: "", itemText: "", unit: "", qty: "", rate: "" }])}>
            {t("req.addLine")}
          </Button>
          {reqLines.length > 0 && <div className="text-sm">{t("req.linesTotal", { v: kd(reqLinesTotal) })}</div>}
        </div>
      )}

      {type === "LPO" && !bl && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={isBlanket} onCheckedChange={(v) => {
              setIsBlanket(!!v)
              if (v) setReqLines([])
              if (v && !lines.length) setLines([{ item: "", unit: "", qty: "", rate: "" }])
            }} />
            {t("req.isBlanket")}
          </label>
          {isBlanket && (
            <>
              <F label={t("req.blCat")}>
                <Select value={cat} onValueChange={setCat}>
                  <SelectTrigger><SelectValue placeholder={t("req.blCatPick")} /></SelectTrigger>
                  <SelectContent>
                    {m.cats.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <F label={t("req.blRateRef")}>
                <Input value={rateRef} onChange={(e) => setRateRef(e.target.value)} />
              </F>
              <div className="grid grid-cols-2 gap-2">
                <F label={t("req.validFrom")}>
                  <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
                </F>
                <F label={t("req.validTo")}>
                  <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
                </F>
              </div>
              <div className="text-xs text-muted-foreground">{t("req.linesTitle")}:</div>
              {lines.map((L, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
                  <Input placeholder={t("req.lineItem")} value={L.item}
                    onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, item: e.target.value } : x))} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder={t("req.lineUnit")} value={L.unit}
                      onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                    <Input placeholder={t("req.lineQty")} dir="ltr" inputMode="decimal" value={L.qty}
                      onChange={(e) => setLines((o) => o.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
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
                onClick={() => setLines((o) => [...o, { item: "", unit: "", qty: "", rate: "" }])}>
                {t("req.addLine")}
              </Button>
              <div className="text-sm">{t("req.linesTotal", { v: kd(linesTotal) })}</div>
            </>
          )}
        </div>
      )}

      <F label={t("req.desc")}>
        <Textarea placeholder={t("req.descPh")} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </F>
      <F label={t("req.value")}>
        <Input dir="ltr" inputMode="decimal" value={shownValue} readOnly={derived != null}
          className={derived != null ? "bg-secondary" : ""}
          onChange={(e) => setValue(e.target.value)} />
      </F>

      {formErr && <ErrorBox message={formErr} />}
      <Button size="lg" disabled={busy} onClick={submit}>📨 {t("req.send")}</Button>
    </CardContent></Card>
  )
}
