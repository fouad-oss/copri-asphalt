import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ErrorBox, LoadingList } from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  fetchPrograms, fetchRequests, getDeskSession, kwISO, programSetStatus, programSubmit,
  requestSubmit, setDeskSession, todayStr, useDash, useRef_,
  type Program, type RecipientRequest, type RefData,
} from "./lib"
import { Chip, RequestCard } from "./widgets"
import PinGate from "./PinGate"
import PlantBoard from "./PlantBoard"
import { generateDispatchReport } from "./report"

/* ── Plant-manager desk (legacy ?plantRole=manager) — interim PIN via
   plant_managers. Tabs: embedded plant board + report generator ·
   planned asphalt programs (day-grouped, add for NON-Copri clients
   only, user decision 2026-07-11) · recipient requests with the
   WhatsApp handoff to finance. ── */

function dayLabel(iso: string, t: (k: string) => string): string {
  const d = new Date(iso + "T12:00:00+03:00")
  const wd = new Intl.DateTimeFormat("ar", { weekday: "long" }).format(d)
  const dt = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" }).format(d)
  const tag = iso === kwISO(0) ? ` · ${t("prog.today")}` : iso === kwISO(1) ? ` · ${t("prog.tomorrow")}` : ""
  return `${wd} ${dt}${tag}`
}

/* ── Tab 1: report generator + the plant board, embedded ── */

function ReportGenerator() {
  const { t } = useTranslation("boards")
  const { data } = useDash()
  const today = todayStr()
  const latestDay = useMemo(() => {
    const all = data?.dispatch || []
    return all.length ? all.map((r) => r.d).reduce((a, b) => (a > b ? a : b)) : today
  }, [data, today])
  const [day, setDay] = useState(latestDay)
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 6 * 864e5)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  useEffect(() => { setDay(latestDay) }, [latestDay])

  const run = async (kind: "day" | "range" | "month", a: string, b?: string) => {
    const r = await generateDispatchReport(kind, a, b)
    if (r === "popup") toast.error(t("report.popup"))
    if (r === "data") toast.error(t("report.dataError"))
  }
  const row = "flex flex-wrap items-center gap-2"
  const lbl = "w-24 shrink-0 text-sm text-muted-foreground"

  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-2 px-4">
        <h3 className="text-sm font-semibold">{t("report.make")}</h3>
        <div className={row}>
          <span className={lbl}>{t("report.day")}</span>
          <Input type="date" className="w-fit" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => run("day", day || today)}>{t("report.go")}</Button>
        </div>
        <div className={row}>
          <span className={lbl}>{t("report.range")}</span>
          <Input type="date" className="w-fit" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-sm text-muted-foreground">{t("ranges.to")}</span>
          <Input type="date" className="w-fit" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => run("range", from || today, to || today)}>{t("report.go")}</Button>
        </div>
        <div className={row}>
          <span className={lbl}>{t("report.month")}</span>
          <Input type="month" className="w-fit" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => run("month", month || today.slice(0, 7))}>{t("report.go")}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Tab 2: planned asphalt work days ── */

type MixRow = { mix: string; loads: string }

function ProgramForm({ who, ref, onSaved }: { who: string; ref: RefData; onSaved: () => void }) {
  const { t } = useTranslation("boards")
  const [open, setOpen] = useState(false)
  const [comp, setComp] = useState("")
  const [proj, setProj] = useState("")
  const [date, setDate] = useState(kwISO(1))
  const [site, setSite] = useState("")
  const [block, setBlock] = useState("")
  const [street, setStreet] = useState("")
  const [mixRows, setMixRows] = useState<MixRow[]>([{ mix: "", loads: "" }])
  const [plant, setPlant] = useState("")
  const [loadTime, setLoadTime] = useState("")
  const [paveTime, setPaveTime] = useState("")
  const [notes, setNotes] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const nonCopri = ref.clients.filter((c) => !c.isCopri).map((c) => c.company)
  const projects = ref.clientProjects.filter((p) => p.company === comp).map((p) => p.project)

  const save = async () => {
    if (!comp || !proj || !date || !site.trim()) { setErr(t("prog.reqFields")); return }
    setErr(""); setBusy(true)
    try {
      const mixes = mixRows.filter((m) => m.mix)
        .map((m) => ({ mix: m.mix, loads: m.loads ? parseInt(m.loads, 10) : 0 }))
      const r = await programSubmit({
        p_work_date: date, p_company: comp, p_project: proj,
        p_site: site.trim(), p_block: block.trim(), p_street: street.trim(),
        p_mixes: mixes, p_plant: plant, p_load_time: loadTime, p_pave_time: paveTime,
        p_notes: notes.trim(), p_by: who,
      })
      if (!r?.success) throw new Error(r?.error || "failed")
      onSaved()
    } catch {
      setErr(t("prog.failed")); setBusy(false)
    }
  }

  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-3 px-4">
        <Button type="button" variant="outline" className="w-fit" onClick={() => setOpen((o) => !o)}>
          {open ? t("prog.hideForm") : t("prog.add")}
        </Button>
        {open && (
          <>
            <div className="rounded-lg bg-secondary/50 p-2 text-xs text-muted-foreground">{t("prog.copriNote")}</div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.company")}</Label>
              <Select value={comp} onValueChange={(v) => { setComp(v); setProj("") }}>
                <SelectTrigger><SelectValue placeholder={t("prog.companyPick")} /></SelectTrigger>
                <SelectContent>{nonCopri.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.project")}</Label>
              <Select value={proj} onValueChange={setProj} disabled={!comp}>
                <SelectTrigger><SelectValue placeholder={t("prog.projectPick")} /></SelectTrigger>
                <SelectContent>{projects.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.site")}</Label>
              <Input value={site} placeholder={t("prog.sitePh")} onChange={(e) => setSite(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t("prog.block")}</Label>
                <Input value={block} inputMode="numeric" placeholder={t("prog.blockPh")} onChange={(e) => setBlock(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("prog.street")}</Label>
                <Input value={street} placeholder={t("prog.streetPh")} onChange={(e) => setStreet(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.mixes")}</Label>
              {mixRows.map((m, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <Select value={m.mix} onValueChange={(v) => setMixRows((rows) => rows.map((x, j) => j === i ? { ...x, mix: v } : x))}>
                    <SelectTrigger><SelectValue placeholder={t("prog.mixPick")} /></SelectTrigger>
                    <SelectContent>{ref.mixTypes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" inputMode="numeric" value={m.loads} placeholder={t("prog.loadsPh")}
                    onChange={(e) => setMixRows((rows) => rows.map((x, j) => j === i ? { ...x, loads: e.target.value } : x))} />
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="w-fit"
                onClick={() => setMixRows((rows) => [...rows, { mix: "", loads: "" }])}>
                {t("prog.addMix")}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.plant")}</Label>
              <Select value={plant} onValueChange={setPlant}>
                <SelectTrigger><SelectValue placeholder={t("prog.plantPick")} /></SelectTrigger>
                <SelectContent>{ref.plants.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t("prog.loadTime")}</Label>
                <Input type="time" value={loadTime} onChange={(e) => setLoadTime(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("prog.paveTime")}</Label>
                <Input type="time" value={paveTime} onChange={(e) => setPaveTime(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prog.notes")}</Label>
              <Textarea value={notes} placeholder={t("prog.notesPh")} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {err && <ErrorBox message={err} />}
            <Button type="button" disabled={busy} onClick={save}>
              {busy ? t("prog.saving") : t("prog.save")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProgramCard({ p, who, refresh }: { p: Program; who: string; refresh: () => void }) {
  const { t } = useTranslation("boards")
  const [confirming, setConfirming] = useState<"منفذ" | "ملغي" | null>(null)
  const [busy, setBusy] = useState(false)
  const mixes = Array.isArray(p.mixes) ? p.mixes : []

  const act = async (status: "منفذ" | "ملغي") => {
    setBusy(true)
    try { await programSetStatus(p.id, status, who) } catch { /* list refresh shows truth */ }
    refresh()
  }

  return (
    <Card className={cn("py-3", p.status === "ملغي" && "opacity-60", p.status === "منفذ" && "opacity-80")}>
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{p.mix || t("prog.noMix")}</span>
          <Chip status={p.status} />
        </div>
        <div className="text-sm">{p.site}{p.block ? ` ق${p.block}` : ""}{p.street ? ` ش${p.street}` : ""}</div>
        {p.company && p.company !== "كوبري" && (
          <div className="text-xs text-muted-foreground">
            {t("prog.forClient", { c: p.company + (p.project ? ` — ${p.project}` : "") })}
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {mixes.length > 1
            ? <span>🚛 {mixes.map((m) => `${m.loads || "؟"} × ${m.mix}`).join(" · ")}</span>
            : p.loads ? <span>🚛 {p.loads} {t("prog.loadsUnit")}</span> : null}
          {p.plant && <span>🏭 {p.plant}</span>}
          {p.load_time && <span>⏱️ {t("prog.loadLbl")} <b>{p.load_time}</b></span>}
          {p.pave_time && <span>🛣️ {t("prog.paveLbl")} <b>{p.pave_time}</b></span>}
        </div>
        {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
        {p.status === "مخطط" && (
          confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-surface p-2 text-xs">
              <span>{confirming === "ملغي" ? t("prog.confirmCancel") : t("prog.confirmDone")}</span>
              <Button type="button" size="sm" disabled={busy} onClick={() => act(confirming)}>{t("prog.yes")}</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>{t("prog.no")}</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming("منفذ")}>{t("prog.done")}</Button>
              <Button type="button" size="sm" variant="outline" className="text-danger" onClick={() => setConfirming("ملغي")}>{t("prog.cancel")}</Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}

function ProgramsTab({ who }: { who: string }) {
  const { t } = useTranslation("boards")
  const { data: ref, error: refErr, retry: refRetry } = useRef_()
  const [rows, setRows] = useState<Program[] | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false); setRows(null)
    fetchPrograms().then(setRows).catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (refErr) return <ErrorBox message={t("error")} onRetry={refRetry} />
  if (err) return <ErrorBox message={t("error")} onRetry={load} />
  if (!ref || !rows) return <LoadingList />

  const today = kwISO(0)
  const upcoming = rows.filter((r) => r.work_date >= today)
  const past = rows.filter((r) => r.work_date < today).reverse()

  const group = (list: Program[]) => {
    const out: { day: string; items: Program[] }[] = []
    list.forEach((r) => {
      const last = out[out.length - 1]
      if (last && last.day === r.work_date) last.items.push(r)
      else out.push({ day: r.work_date, items: [r] })
    })
    return out
  }

  return (
    <div className="flex flex-col gap-3">
      <ProgramForm who={who} ref={ref} onSaved={load} />
      {!rows.length ? (
        <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">{t("prog.none")}</div>
      ) : (
        <>
          {group(upcoming).map((g) => (
            <div key={g.day} className="flex flex-col gap-2">
              <div className={cn("text-sm font-semibold", g.day === today && "text-success")}>{dayLabel(g.day, t)}</div>
              {g.items.map((p) => <ProgramCard key={p.id} p={p} who={who} refresh={load} />)}
            </div>
          ))}
          {past.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-muted-foreground">{t("prog.past")}</div>
              {group(past).map((g) => (
                <div key={g.day} className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground">{dayLabel(g.day, t)}</div>
                  {g.items.map((p) => <ProgramCard key={p.id} p={p} who={who} refresh={load} />)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Tab 3: add a recipient (request → finance approval) ── */

type ItemRow = { mix: string; qty: string; rate: string }
type JustSent = {
  company: string; client: string; contract: string; payment: string; details: string
  items: { mix: string; qty: number; rate: number }[]
  financeName: string; financePhone: string
}

function whatsappUrl(js: JustSent, who: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const msg = encodeURIComponent(
    `${t("req.waBody")}\n` +
    `${t("req.waCompany")}: ${js.company}\n${t("req.waClient")}: ${js.client}\n` +
    (js.contract ? `${t("req.waContract")}: ${js.contract}\n` : "") +
    `${t("req.waPayment")}: ${js.payment || "—"}\n` +
    js.items.map((it) => `- ${it.mix}: ${it.qty} طن × ${it.rate} د.ك`).join("\n") + "\n" +
    (js.details ? `${t("req.waDetails")}: ${js.details}\n` : "") +
    `${t("req.waBy")}: ${who}\n` +
    `${t("req.waApprove")}: ${location.origin}/boards/desk/finance`,
  )
  return `https://wa.me/${js.financePhone}?text=${msg}`
}

function RequestsTab({ who }: { who: string }) {
  const { t } = useTranslation("boards")
  const { data: ref, error: refErr, retry: refRetry } = useRef_()
  const [rows, setRows] = useState<RecipientRequest[] | null>(null)
  const [err, setErr] = useState(false)
  const [justSent, setJustSent] = useState<JustSent | null>(null)

  const [comp, setComp] = useState("")
  const [compNew, setCompNew] = useState("")
  const [client, setClient] = useState("")
  const [contract, setContract] = useState("")
  const [payment, setPayment] = useState("")
  const [items, setItems] = useState<ItemRow[]>([{ mix: "", qty: "", rate: "" }])
  const [details, setDetails] = useState("")
  const [formErr, setFormErr] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    fetchRequests().then(setRows).catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (refErr) return <ErrorBox message={t("error")} onRetry={refRetry} />
  if (!ref) return <LoadingList />

  const NEW = "__new__"
  const companies = ref.clients.map((c) => c.company)

  const send = async () => {
    const company = comp === NEW ? compNew.trim() : comp
    if (!company || !client.trim() || !payment) { setFormErr(t("req.reqFields")); return }
    const started = items.filter((r) => r.mix || r.qty || r.rate)
    const parsed = started.map((r) => ({ mix: r.mix, qty: parseFloat(r.qty) || 0, rate: parseFloat(r.rate) || 0 }))
    if (!parsed.length || parsed.some((it) => !it.mix || it.qty <= 0 || it.rate <= 0)) {
      setFormErr(t("req.reqItems")); return
    }
    setFormErr(""); setBusy(true)
    try {
      const r = await requestSubmit({
        p_company: company, p_client: client.trim(), p_contract: contract.trim(),
        p_payment: payment, p_details: details.trim(), p_by: who, p_items: parsed,
      })
      if (!r?.success) throw new Error(r?.error || "failed")
      // Finance contact for the WhatsApp handoff (best-effort fetch).
      let fm = { name: t("req.financeFallback"), phone: "96566445179" }
      try {
        const { data: fms } = await supabase.from("finance_managers")
          .select("name,phone").eq("active", true).order("id").limit(1)
        if (fms && fms.length) fm = { name: fms[0].name, phone: fms[0].phone || fm.phone }
      } catch { /* fallback contact */ }
      setJustSent({
        company, client: client.trim(), contract: contract.trim(),
        payment, details: details.trim(), items: parsed,
        financeName: fm.name, financePhone: fm.phone,
      })
      setComp(""); setCompNew(""); setClient(""); setContract(""); setPayment("")
      setItems([{ mix: "", qty: "", rate: "" }]); setDetails(""); setBusy(false)
      load()
    } catch {
      setBusy(false); setFormErr(t("req.failed"))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {justSent && (
        <Card className="border-success/40 py-3">
          <CardContent className="flex flex-col gap-2 px-4">
            <div className="text-sm font-semibold text-success">{t("req.sent")}</div>
            <Button type="button" className="w-fit bg-[#25D366] text-white hover:bg-[#1eb857]"
              onClick={() => window.open(whatsappUrl(justSent, who, t), "_blank")}>
              {t("req.whatsapp", { name: justSent.financeName })}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="py-3">
        <CardContent className="flex flex-col gap-3 px-4">
          <h3 className="text-sm font-semibold">{t("req.title")}</h3>
          <div className="rounded-lg bg-secondary/50 p-2 text-xs text-muted-foreground">{t("req.explain")}</div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("req.company")}</Label>
            <Select value={comp} onValueChange={setComp}>
              <SelectTrigger><SelectValue placeholder={t("req.companyPick")} /></SelectTrigger>
              <SelectContent>
                {companies.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                <SelectItem value={NEW}>{t("req.newCompany")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {comp === NEW && (
            <div className="flex flex-col gap-1.5">
              <Label>{t("req.newCompanyName")}</Label>
              <Input value={compNew} placeholder={t("req.newCompanyPh")} onChange={(e) => setCompNew(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{t("req.client")}</Label>
            <Input value={client} placeholder={t("req.clientPh")} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("req.contract")}</Label>
            <Input value={contract} placeholder={t("req.contractPh")} onChange={(e) => setContract(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("req.payment")}</Label>
            <div className="flex gap-1">
              {[t("req.cash"), t("req.credit")].map((p, i) => {
                const val = i === 0 ? "نقدي" : "آجل"
                return (
                  <button key={val} type="button" onClick={() => setPayment(val)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm",
                      payment === val ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
                    )}>
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("req.items")}</Label>
            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 text-xs text-muted-foreground">
              <span>{t("req.mixHead")}</span><span>{t("req.qtyHead")}</span><span>{t("req.rateHead")}</span>
            </div>
            {items.map((r, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                <Select value={r.mix} onValueChange={(v) => setItems((rows) => rows.map((x, j) => j === i ? { ...x, mix: v } : x))}>
                  <SelectTrigger><SelectValue placeholder={t("req.mixPick")} /></SelectTrigger>
                  <SelectContent>{ref.mixTypes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" inputMode="decimal" value={r.qty} placeholder={t("req.qtyPh")}
                  onChange={(e) => setItems((rows) => rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                <Input type="number" inputMode="decimal" value={r.rate} placeholder={t("req.ratePh")}
                  onChange={(e) => setItems((rows) => rows.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="w-fit"
              onClick={() => setItems((rows) => [...rows, { mix: "", qty: "", rate: "" }])}>
              {t("req.addItem")}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("req.details")}</Label>
            <Textarea value={details} placeholder={t("req.detailsPh")} onChange={(e) => setDetails(e.target.value)} />
          </div>
          {formErr && <ErrorBox message={formErr} />}
          <Button type="button" disabled={busy} onClick={send}>
            {busy ? t("req.sending") : t("req.send")}
          </Button>
        </CardContent>
      </Card>

      {err ? <ErrorBox message={t("error")} onRetry={load} /> :
        !rows ? <LoadingList rows={2} /> :
        !rows.length ? <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">{t("req.priorNone")}</div> : (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-muted-foreground">{t("req.prior")}</div>
            {rows.map((r) => <RequestCard key={r.id} r={r} />)}
          </div>
        )}
    </div>
  )
}

/* ── Desk shell ── */

const TABS = ["board", "programs", "requests"] as const
type Tab = typeof TABS[number]

export default function PlantDesk() {
  const { t } = useTranslation("boards")
  const [who, setWho] = useState<string | null>(() => getDeskSession("plant"))
  const [tab, setTab] = useState<Tab>("board")

  if (!who) return <PinGate kind="plant" onSuccess={setWho} />

  const tabLabel: Record<Tab, string> = {
    board: t("desk.tabBoard"), programs: t("desk.tabPrograms"), requests: t("desk.tabRequests"),
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="py-3">
        <CardContent className="flex items-center justify-between gap-2 px-4">
          <div>
            <div className="text-sm font-semibold">{who}</div>
            <div className="text-xs text-muted-foreground">{t("desk.plantSub")}</div>
          </div>
          <Button type="button" variant="outline" size="sm"
            onClick={() => { setDeskSession("plant", null); setWho(null) }}>
            {t("desk.logout")}
          </Button>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === k ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
            )}>
            {tabLabel[k]}
          </button>
        ))}
      </div>
      {tab === "board" && (
        <div className="flex flex-col gap-3">
          <ReportGenerator />
          <PlantBoard embedded />
        </div>
      )}
      {tab === "programs" && <ProgramsTab who={who} />}
      {tab === "requests" && <RequestsTab who={who} />}
    </div>
  )
}
