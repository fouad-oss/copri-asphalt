// Payment-certificate detail — header (source/status/period/note), lines
// grouped per work order with inline qty editing, totals after نسبة
// العقد, Arabic printout, and logged deletion.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Printer, Trash2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { kd, qty as fq, fmtKWDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  contractInfo, itemRef, paycertDelete, paycertLineDetail, paycertLineSet, paycertOne,
  paycertUpdate, type ContractInfo, type PayCertLineDetail, type PayCertOverview,
} from "./data"
import { sourceBadge, statusBadge } from "./PayCerts"
import { printCert } from "./certPrint"

interface DetailData {
  c: PayCertOverview
  lines: PayCertLineDetail[]
  contract: ContractInfo
}

function EditDialog({ c, onDone }: { c: PayCertOverview; onDone: () => void }) {
  const { t } = useTranslation("quantities")
  const [open, setOpen] = useState(false)
  const [no, setNo] = useState(String(c.certNo))
  const [period, setPeriod] = useState(c.periodEnd ?? "")
  const [note, setNote] = useState(c.note)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await paycertUpdate(c.id, { cert_no: no, period_end: period, note })
      toast.success(t("detail.saved"))
      setOpen(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setNo(String(c.certNo)); setPeriod(c.periodEnd ?? ""); setNote(c.note) } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{t("pc.edit")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pc.editTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("pc.certNo")}</Label>
            <Input dir="ltr" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("pc.periodEnd")}</Label>
            <Input dir="ltr" type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("pc.noteField")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button disabled={busy} onClick={() => void save()}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PayCertDetail() {
  const { t } = useTranslation("quantities")
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const nav = useNavigate()
  const [data, setData] = useState<DetailData | null | undefined>(undefined)
  const [error, setError] = useState(false)
  const [qtyEdits, setQtyEdits] = useState<Record<number, string>>({})

  const load = useCallback(async (soft = false) => {
    setError(false)
    if (!soft) setData(undefined)
    try {
      const c = await paycertOne(id)
      if (!c) { setData(null); return }
      const [lines, contract] = await Promise.all([paycertLineDetail(id), contractInfo()])
      setData({ c, lines, contract })
    } catch {
      setError(true)
    }
  }, [id])
  useEffect(() => { void load() }, [load])
  const refresh = () => void load(true)

  const groups = useMemo(() => {
    if (!data) return []
    const m = new Map<string, { label: string; area: string; lines: PayCertLineDetail[] }>()
    for (const l of data.lines) {
      const key = l.kashefId != null ? String(l.kashefNo) : "—"
      const g = m.get(key) ?? {
        label: l.kashefId != null ? (l.woNo || String(l.kashefNo)) : "",
        area: l.area, lines: [],
      }
      g.lines.push(l)
      m.set(key, g)
    }
    return [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
  }, [data])

  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
        {t("app.loadError")}{" "}
        <Button variant="outline" size="sm" className="ms-2" onClick={() => void load()}>
          {t("app.retry")}
        </Button>
      </div>
    )
  }
  if (data === undefined) return <Skeleton className="h-96 w-full rounded-lg" />
  if (data === null) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("pc.notFound")} · <Link className="underline" to="/quantities/paycerts">{t("pc.back")}</Link>
      </div>
    )
  }

  const { c, contract } = data

  async function saveQty(l: PayCertLineDetail, value: string) {
    const num = Number(value)
    if (!isFinite(num) || num < 0) return
    try {
      await paycertLineSet(c.id, l.kashefId, l.bopItemId, num === 0 ? null : num)
      toast.success(t("detail.saved"))
      setQtyEdits((e) => { const n = { ...e }; delete n[l.id]; return n })
      refresh()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  async function setStatus(status: string) {
    try {
      await paycertUpdate(c.id, { status })
      toast.success(t("detail.saved"))
      refresh()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  async function remove() {
    if (!window.confirm(t("pc.deleteConfirm"))) return
    try {
      await paycertDelete(c.id)
      nav("/quantities/paycerts")
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  function doPrint() {
    const endOf = (l: PayCertLineDetail) => {
      if (!l.woDate || l.durationDays == null) return null
      const d = new Date(l.woDate + "T00:00:00")
      d.setDate(d.getDate() + l.durationDays)
      return d.toISOString().slice(0, 10)
    }
    const fy = (() => {
      const ref = c.periodEnd ? new Date(c.periodEnd + "T00:00:00") : new Date()
      const y = ref.getMonth() + 1 >= 4 ? ref.getFullYear() : ref.getFullYear() - 1
      return `${y}/${y + 1}`
    })()
    printCert({
      contractNo: contract.contractNo, contractName: contract.name,
      contractor: contract.contractor, pct: c.pct,
      certNo: c.certNo, periodEnd: c.periodEnd,
      date: new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kuwait" }),
      fiscalYear: fy,
      wos: groups.map(([, g]) => {
        const f = g.lines[0]
        return {
          woNo: g.label || "—",
          site: [g.area, f?.locType === "block" ? `قطعة ${f.blockNo}` : f?.streetName,
                 f?.workType].filter(Boolean).join(" — "),
          woDate: f?.woDate ?? null,
          durationDays: f?.durationDays ?? null,
          endDate: f ? endOf(f) : null,
          dailyPenalty: f?.dailyPenalty ?? null,
          woValue: g.lines.reduce((s, l) => s + (l.woQty ?? 0) * l.rate, 0) * (1 + c.pct / 100),
          lines: g.lines.map((l) => ({
            ref: itemRef(l), desc: l.description, qty: l.qty, unit: l.unit,
            rate: l.rate, remaining: l.qtyRemaining,
          })),
        }
      }),
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">
            {t("pc.certNo")} <RefCode>{String(c.certNo)}</RefCode>
          </h1>
          {sourceBadge(c.source, t)}
          {statusBadge(c.status, t)}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Select value={c.status} onValueChange={(v) => void setStatus(v)}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["draft", "submitted", "certified"] as const).map((s) => (
                  <SelectItem key={s} value={s}>{t(`pc.status.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <EditDialog c={c} onDone={refresh} />
            <Button size="sm" variant="outline" onClick={doPrint}>
              <Printer className="size-3.5" /> {t("pc.print")}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <div><span className="text-muted-foreground">{t("detail.contract")}: </span><bdi dir="ltr" className="font-mono">{contract.contractNo}</bdi></div>
          {c.periodEnd && (
            <div><span className="text-muted-foreground">{t("pc.periodEnd")}: </span><span dir="ltr">{fmtKWDate(c.periodEnd)}</span></div>
          )}
          <div><span className="text-muted-foreground">{t("pc.createdAt")}: </span><span dir="ltr">{fmtKWDate(c.createdAt)}</span></div>
          {c.note && <div className="col-span-2"><span className="text-muted-foreground">{t("pc.noteField")}: </span>{c.note}</div>}
        </div>
        <div className="mt-3 flex flex-wrap gap-6 border-t pt-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t("detail.subtotal")}: </span>
            <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(c.subtotal)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("detail.afterPct")} (<bdi dir="ltr">+{c.pct.toFixed(2)}%</bdi>): </span>
            <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(c.totalAfterPct)}</span>
          </div>
          <Button size="sm" variant="ghost" className="ms-auto text-danger hover:text-danger" onClick={() => void remove()}>
            <Trash2 className="size-3.5" /> {t("pc.delete")}
          </Button>
        </div>
      </div>

      {groups.map(([key, g]) => {
        const sub = g.lines.reduce((s, l) => s + l.qty * l.rate, 0)
        return (
          <section key={key} className="overflow-x-auto rounded-lg border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <span className="text-sm font-semibold">
                {g.label
                  ? <>{t("pc.woSection")} <RefCode>{g.label}</RefCode></>
                  : t("pc.outOfWo")}
              </span>
              {g.area && <span className="text-xs text-muted-foreground">{g.area}</span>}
              <span className="ms-auto font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">{kd(sub)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="w-20 px-3 py-1.5 text-start font-normal">{t("detail.col.ref")}</th>
                  <th className="px-3 py-1.5 text-start font-normal">{t("detail.col.desc")}</th>
                  <th className="px-3 py-1.5 text-center font-normal">{t("detail.col.qty")}</th>
                  <th className="px-3 py-1.5 text-center font-normal">{t("detail.col.unit")}</th>
                  <th className="px-3 py-1.5 text-center font-normal">{t("detail.col.rate")}</th>
                  <th className="px-3 py-1.5 text-end font-normal">{t("detail.col.total")}</th>
                  <th className="px-3 py-1.5 text-center font-normal">{t("pc.cumulative")}</th>
                  <th className="px-3 py-1.5 text-center font-normal">{t("pc.remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => {
                  const editing = qtyEdits[l.id] !== undefined
                  const computed = Math.round(l.qty * l.rate * 1000) / 1000
                  const printedDiffers = l.amount > 0 && Math.abs(l.amount - computed) > 0.005
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-1.5"><RefCode>{itemRef(l)}</RefCode></td>
                      <td className="max-w-md px-3 py-1.5">{l.description}</td>
                      <td className="px-3 py-1.5 text-center">
                        {editing ? (
                          <span className="inline-flex items-center gap-1">
                            <Input autoFocus className="h-7 w-24 text-sm" dir="ltr" inputMode="decimal"
                              value={qtyEdits[l.id]}
                              onChange={(e) => setQtyEdits((x) => ({ ...x, [l.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") void saveQty(l, qtyEdits[l.id]) }} />
                            <Button size="sm" className="h-7" onClick={() => void saveQty(l, qtyEdits[l.id])}>
                              {t("common.save")}
                            </Button>
                          </span>
                        ) : (
                          <button type="button" title={t("detail.editQty")}
                            className="font-mono tabular-nums underline-offset-2 hover:underline" dir="ltr"
                            onClick={() => setQtyEdits((x) => ({ ...x, [l.id]: String(l.qty) }))}>
                            {fq(l.qty)}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">{l.unit}</td>
                      <td className="px-3 py-1.5 text-center font-mono tabular-nums" dir="ltr">{kd(l.rate)}</td>
                      <td className="px-3 py-1.5 text-end font-mono tabular-nums" dir="ltr">
                        {kd(computed)}
                        {printedDiffers && (
                          <span title={`${t("pc.printedAmount")} (${kd(l.amount)})`}>
                            <TriangleAlert className="ms-1 inline size-3.5 text-warning" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                        {fq(l.qtyCumulative)}
                      </td>
                      <td className={cn("px-3 py-1.5 text-center font-mono text-xs tabular-nums",
                                        l.qtyRemaining < -0.0005 ? "font-semibold text-warning" : "text-muted-foreground")} dir="ltr">
                        {l.woQty != null ? fq(l.qtyRemaining) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
