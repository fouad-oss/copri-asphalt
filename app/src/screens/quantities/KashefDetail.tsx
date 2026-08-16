// Kashef detail — header meta + actions (approve-as-WO, edit, per-sub
// WO print, changelog) and the items table with the three quantity
// tiers (kashef / allocated / executed) + per-line التوزيع expander.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Pencil, Plus, Printer, Trash2, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { kd, qty as fq, fmtKWDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  allocSet, bopItems, changelog, contractInfo, itemRef, kashefDelete,
  kashefLineSet, kashefOne, kashefSetClosed, kashefUpdate, lineStatus, subcontractors, subLineStatus,
  tadqiqList, type BopItem, type ChangelogRow, type ContractInfo, type KashefOverview,
  type LineStatus, type SubLineStatus, type Subcontractor, type TadqiqRow,
} from "./data"
import { locationLabel } from "./KashefList"
import { printSubWo } from "./subPrint"
import { useNavigate } from "react-router-dom"

interface DetailData {
  k: KashefOverview
  lines: LineStatus[]
  subLines: SubLineStatus[]
  subs: Subcontractor[]
  log: ChangelogRow[]
  tadqiq: TadqiqRow[]
  contract: ContractInfo
  bop: BopItem[]
}

function useDetail(id: number) {
  const [data, setData] = useState<DetailData | null | undefined>(undefined)
  const [error, setError] = useState(false)
  const load = useCallback(async (soft = false) => {
    setError(false)
    if (!soft) setData(undefined)
    try {
      const k = await kashefOne(id)
      if (!k) { setData(null); return }
      const [lines, subLines, subs, log, tq, contract, bop] = await Promise.all([
        lineStatus(id), subLineStatus(id), subcontractors(), changelog(id),
        tadqiqList(id), contractInfo(), bopItems(),
      ])
      setData({ k, lines, subLines, subs, log, tadqiq: tq, contract, bop })
    } catch {
      setError(true)
    }
  }, [id])
  useEffect(() => { void load() }, [load])
  return { data, error, load }
}

function warn(res: any, t: (k: string) => string) {
  if (res?.warnOverAllocated) toast.warning(t("detail.warnOverAlloc"))
  if (res?.warnExecutedOver) toast.warning(t("detail.warnExecOver"))
}

// ── Allocation expander ──────────────────────────────────────────────

function AllocPanel({ line, subLines, subs, onSaved }: {
  line: LineStatus
  subLines: SubLineStatus[]
  subs: Subcontractor[]
  onSaved: () => void
}) {
  const { t } = useTranslation("quantities")
  const mine = subLines.filter((s) => s.bopItemId === line.bopItemId)
  const [addVendor, setAddVendor] = useState("")
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  async function save(vendorId: number, value: string) {
    const v = value.trim()
    const num = v === "" ? null : Number(v)
    if (num !== null && (!isFinite(num) || num < 0)) return
    setBusy(true)
    try {
      const res = await allocSet(line.kashefLineId, vendorId, num === 0 ? null : num)
      warn(res, t)
      toast.success(t("detail.saved"))
      setEdits((e) => { const n = { ...e }; delete n[vendorId]; return n })
      setAddVendor("")
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    } finally {
      setBusy(false)
    }
  }

  const unallocated = subs.filter((s) => !mine.some((m) => m.vendorId === s.id && m.allocated > 0))

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">{t("detail.allocFor")}</div>
      <div className="space-y-1.5">
        {mine.filter((m) => m.allocated > 0 || m.executed > 0).map((m) => {
          const remaining = m.allocated - m.executed
          const editing = edits[m.vendorId] !== undefined
          return (
            <div key={m.vendorId} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="min-w-40 font-medium">{m.vendorName}</span>
              <span className="text-xs text-muted-foreground">
                {t("detail.allocated")}:{" "}
                {editing ? (
                  <span className="inline-flex items-center gap-1">
                    <Input autoFocus className="h-7 w-24 text-sm" dir="ltr" inputMode="decimal"
                      value={edits[m.vendorId]}
                      onChange={(e) => setEdits((x) => ({ ...x, [m.vendorId]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") void save(m.vendorId, edits[m.vendorId]) }} />
                    <Button size="sm" className="h-7" disabled={busy}
                      onClick={() => void save(m.vendorId, edits[m.vendorId])}>{t("common.save")}</Button>
                  </span>
                ) : (
                  <button type="button" className="font-mono tabular-nums underline-offset-2 hover:underline" dir="ltr"
                    onClick={() => setEdits((x) => ({ ...x, [m.vendorId]: String(m.allocated || "") }))}>
                    {fq(m.allocated)} <Pencil className="ms-0.5 inline size-3" />
                  </button>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("detail.executedShort")}: <span className={cn("font-mono tabular-nums", m.executed > m.allocated && "font-semibold text-danger")} dir="ltr">{fq(m.executed)}</span>
                {m.executed > m.allocated && <TriangleAlert className="ms-1 inline size-3 text-danger" />}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("detail.remaining")}: <span className="font-mono tabular-nums" dir="ltr">{fq(remaining)}</span>
              </span>
            </div>
          )
        })}
        {mine.filter((m) => m.allocated > 0 || m.executed > 0).length === 0 && (
          <div className="text-xs text-muted-foreground">—</div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={addVendor} onValueChange={setAddVendor}>
          <SelectTrigger className="h-8 w-56 text-sm"><SelectValue placeholder={t("detail.chooseSub")} /></SelectTrigger>
          <SelectContent>
            {unallocated.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {addVendor && (
          <>
            <Input className="h-8 w-28 text-sm" dir="ltr" inputMode="decimal" placeholder={t("detail.allocQty")}
              value={edits[-1] ?? ""}
              onChange={(e) => setEdits((x) => ({ ...x, [-1]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") void save(Number(addVendor), edits[-1] ?? "") }} />
            <Button size="sm" className="h-8" disabled={busy || !(edits[-1] ?? "").trim()}
              onClick={() => void save(Number(addVendor), edits[-1] ?? "")}>
              <Plus className="size-3.5" /> {t("detail.addSub")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Add-line row (bab → band picker) ─────────────────────────────────

function AddLineRow({ kashefId, bop, existing, onSaved }: {
  kashefId: number
  bop: BopItem[]
  existing: Set<number>
  onSaved: () => void
}) {
  const { t } = useTranslation("quantities")
  const [bab, setBab] = useState("")
  const [item, setItem] = useState("")
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const babs = useMemo(() => [...new Set(bop.map((b) => b.bab))].sort((a, b) => a - b), [bop])
  const bands = useMemo(
    () => bop.filter((b) => String(b.bab) === bab && !existing.has(b.id)),
    [bop, bab, existing])
  const selected = bop.find((b) => String(b.id) === item)

  async function add() {
    const num = Number(q)
    if (!selected || !isFinite(num) || num < 0) return
    setBusy(true)
    try {
      await kashefLineSet(kashefId, selected.id, num)
      toast.success(t("detail.saved"))
      setBab(""); setItem(""); setQ("")
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <div className="space-y-1">
        <Label className="text-xs">{t("new.bab")}</Label>
        <Select value={bab} onValueChange={(v) => { setBab(v); setItem("") }}>
          <SelectTrigger className="h-8 w-24 text-sm"><SelectValue placeholder={t("new.chooseBab")} /></SelectTrigger>
          <SelectContent>
            {babs.map((b) => <SelectItem key={b} value={String(b)}>{String(b)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("new.band")}</Label>
        <Select value={item} onValueChange={setItem} disabled={!bab}>
          <SelectTrigger className="h-8 w-72 text-sm"><SelectValue placeholder={t("new.chooseBand")} /></SelectTrigger>
          <SelectContent>
            {bands.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                <span dir="ltr" className="font-mono">{itemRef(b)}</span> — {b.description.slice(0, 60)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && (
        <div className="pb-1 text-xs text-muted-foreground">
          {selected.unit} · <span dir="ltr" className="font-mono">{kd(selected.rate)}</span>
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">{t("new.qty")}</Label>
        <Input className="h-8 w-28 text-sm" dir="ltr" inputMode="decimal" value={q}
               onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && void add()} />
      </div>
      <Button size="sm" className="h-8" disabled={busy || !selected || !q.trim()} onClick={() => void add()}>
        <Plus className="size-3.5" /> {t("detail.addLine")}
      </Button>
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────

function EditDialog({ k, onDone }: { k: KashefOverview; onDone: () => void }) {
  const { t } = useTranslation("quantities")
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setF({
      kashef_no: String(k.kashefNo), area: k.area, loc_type: k.locType,
      block_no: k.blockNo, street_name: k.streetName, work_type: k.workType,
      kashef_date: k.kashefDate,
      wo_no: k.woNo, wo_date: k.woDate ?? "",
      duration_days: k.durationDays != null ? String(k.durationDays) : "",
      location_text: k.locationText,
      km_from: k.kmFrom != null ? String(k.kmFrom) : "",
      km_to: k.kmTo != null ? String(k.kmTo) : "",
      direction: k.direction,
    })
  }, [open, k])

  async function submit() {
    setBusy(true)
    try {
      await kashefUpdate(k.id, f)
      toast.success(t("detail.saved"))
      setOpen(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    } finally {
      setBusy(false)
    }
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [key]: e.target.value }))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{t("detail.edit")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("detail.editTitle")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t("new.kashefNo")}</Label>
            <Input dir="ltr" inputMode="numeric" value={f.kashef_no ?? ""} onChange={set("kashef_no")} />
          </div>
          <div className="space-y-1">
            <Label>{t("new.kashefDate")}</Label>
            <Input dir="ltr" type="date" value={f.kashef_date ?? ""} onChange={set("kashef_date")} />
          </div>
          <div className="space-y-1">
            <Label>{f.loc_type === "chainage" ? t("new.road") : t("new.area")}</Label>
            <Input value={f.area ?? ""} onChange={set("area")} />
          </div>
          <div className="space-y-1">
            <Label>{t("new.locType")}</Label>
            <Select value={f.loc_type ?? ""} onValueChange={(v) => setF((x) => ({ ...x, loc_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="block">{t("loc.block")}</SelectItem>
                <SelectItem value="street">{t("loc.street")}</SelectItem>
                <SelectItem value="misc">{t("loc.misc")}</SelectItem>
                <SelectItem value="chainage">{t("loc.chainage")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {f.loc_type === "block" && (
            <div className="space-y-1">
              <Label>{t("new.blockNo")}</Label>
              <Input dir="ltr" value={f.block_no ?? ""} onChange={set("block_no")} />
            </div>
          )}
          {f.loc_type === "street" && (
            <div className="space-y-1">
              <Label>{t("new.streetName")}</Label>
              <Input value={f.street_name ?? ""} onChange={set("street_name")} />
            </div>
          )}
          {f.loc_type === "chainage" && (
            <>
              <div className="space-y-1 col-span-2 lg:col-span-3">
                <Label>{t("new.locationText")}</Label>
                <Input value={f.location_text ?? ""} onChange={set("location_text")} />
              </div>
              <div className="space-y-1">
                <Label>{t("new.kmFrom")}</Label>
                <Input dir="ltr" inputMode="decimal" value={f.km_from ?? ""} onChange={set("km_from")} />
              </div>
              <div className="space-y-1">
                <Label>{t("new.kmTo")}</Label>
                <Input dir="ltr" inputMode="decimal" value={f.km_to ?? ""} onChange={set("km_to")} />
              </div>
              <div className="space-y-1">
                <Label>{t("new.direction")}</Label>
                <Input value={f.direction ?? ""} onChange={set("direction")} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>{t("new.workType")}</Label>
            <Input value={f.work_type ?? ""} onChange={set("work_type")} />
          </div>
          <div className="space-y-1">
            <Label>{t("detail.woNoField")}</Label>
            <Input dir="ltr" value={f.wo_no ?? ""} onChange={set("wo_no")} />
          </div>
          <div className="space-y-1">
            <Label>{t("detail.woDateField")}</Label>
            <Input dir="ltr" type="date" value={f.wo_date ?? ""} onChange={set("wo_date")} />
          </div>
          <div className="space-y-1">
            <Label>{t("new.duration")}</Label>
            <Input dir="ltr" inputMode="numeric" value={f.duration_days ?? ""} onChange={set("duration_days")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button disabled={busy} onClick={() => void submit()}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Changelog panel ──────────────────────────────────────────────────

function ChangelogPanel({ log }: { log: ChangelogRow[] }) {
  const { t } = useTranslation("quantities")
  if (log.length === 0) {
    return <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{t("detail.changelogEmpty")}</div>
  }
  return (
    <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border p-2">
      {log.map((r) => (
        <div key={r.id} className={cn("rounded px-2 py-1.5 text-xs",
          r.action === "warning" ? "bg-warning-surface" : "odd:bg-muted/40")}>
          <span className="font-semibold">{t(`log.${r.action}`)}</span>
          {r.field && <span className="text-muted-foreground"> · {t(`log.field.${r.field}`, { defaultValue: r.field })}</span>}
          {r.lineRef && <> · <bdi className="font-mono" dir="ltr">{r.lineRef}</bdi></>}
          {(r.oldValue || r.newValue) && (
            <span className="text-muted-foreground"> · {r.oldValue || "—"} ← {r.newValue || "—"}</span>
          )}
          <span className="float-start text-muted-foreground" dir="ltr">
            {fmtKWDate(r.createdAt)} {r.actorEmail && `· ${r.actorEmail}`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────

export function KashefDetail() {
  const { id } = useParams()
  const { t } = useTranslation("quantities")
  const nav = useNavigate()
  const { data, error, load } = useDetail(Number(id))
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [qtyEdits, setQtyEdits] = useState<Record<number, string>>({})
  const [printVendor, setPrintVendor] = useState("")

  const refresh = useCallback(() => void load(true), [load])

  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
        {t("app.loadError")}{" "}
        <Button variant="outline" size="sm" className="ms-2" onClick={() => void load()}>{t("app.retry")}</Button>
      </div>
    )
  }
  if (data === undefined) return <Skeleton className="h-96 w-full rounded-lg" />
  if (data === null) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("detail.notFound")} · <Link className="underline" to="/quantities/list">{t("detail.back")}</Link>
      </div>
    )
  }

  const { k, lines, subLines, subs, log, contract, bop } = data
  const existingIds = new Set(lines.map((l) => l.bopItemId))
  const printableSubs = subs.filter((s) => subLines.some((m) => m.vendorId === s.id && m.allocated > 0))

  async function saveQty(line: LineStatus, value: string) {
    const num = Number(value)
    if (!isFinite(num) || num < 0) return
    try {
      const res = await kashefLineSet(k.id, line.bopItemId, num)
      warn(res, t)
      toast.success(t("detail.saved"))
      setQtyEdits((e) => { const n = { ...e }; delete n[line.kashefLineId]; return n })
      refresh()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  async function removeLine(line: LineStatus) {
    if (!window.confirm(t("detail.removeLineConfirm"))) return
    try {
      await kashefLineSet(k.id, line.bopItemId, null)
      toast.success(t("detail.saved"))
      refresh()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  async function toggleClosed() {
    try {
      await kashefSetClosed(k.id, !k.closed)
      toast.success(t("detail.saved"))
      refresh()
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  async function removeKashef() {
    if (!window.confirm(t("detail.deleteConfirm"))) return
    try {
      await kashefDelete(k.id)
      nav("/quantities/list")
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  function doPrint(vendorId: string) {
    const v = subs.find((s) => String(s.id) === vendorId)
    if (!v) return
    const linesFor = subLines
      .filter((m) => m.vendorId === v.id && m.allocated > 0)
      .sort((a, b) => a.bab - b.bab || a.band - b.band)
      .map((m) => ({ ref: itemRef(m), desc: m.description, qty: m.allocated, unit: m.unit, rate: m.rate }))
    printSubWo({
      contractNo: contract.contractNo, contractName: contract.name,
      contractor: contract.contractor, pct: contract.pct,
      kashefNo: k.kashefNo, woNo: k.woNo,
      location: locationLabel(k, t), workType: k.workType,
      vendorName: v.name,
      date: new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kuwait" }),
      lines: linesFor,
    })
    setPrintVendor("")
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">
            {t("list.kashefNo")} <RefCode>{k.woNo || String(k.kashefNo)}</RefCode>
          </h1>
          <Badge variant="outline">{t(`loc.${k.locType}`)}</Badge>
          {k.closed && <Badge variant="secondary">{t("status.closed")}</Badge>}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <EditDialog k={k} onDone={refresh} />
            {printableSubs.length > 0 ? (
              <Select value={printVendor} onValueChange={doPrint}>
                <SelectTrigger className="h-8 w-52 text-sm">
                  <Printer className="size-3.5" />
                  <SelectValue placeholder={t("detail.printSub")} />
                </SelectTrigger>
                <SelectContent>
                  {printableSubs.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Button size="sm" variant="outline" disabled title={t("detail.printSubEmpty")}>
                <Printer className="size-3.5" /> {t("detail.printSub")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowLog((s) => !s)}>
              {t("detail.changelog")} {showLog ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <div><span className="text-muted-foreground">{t("detail.contract")}: </span><bdi dir="ltr" className="font-mono">{contract.contractNo}</bdi></div>
          <div><span className="text-muted-foreground">{t("detail.location")}: </span>{locationLabel(k, t)}</div>
          <div><span className="text-muted-foreground">{t("detail.workType")}: </span>{k.workType || "—"}</div>
          {k.woDate && (
            <div><span className="text-muted-foreground">{t("detail.woDate")}: </span><span dir="ltr">{k.woDate}</span></div>
          )}
          <div>
            <span className="text-muted-foreground">{t("detail.duration")}: </span>
            {k.durationDays != null ? <><bdi dir="ltr">{k.durationDays}</bdi> {t("detail.days")}</> : "—"}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-6 border-t pt-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t("detail.subtotal")}: </span>
            <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(k.subtotal)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("detail.afterPct")} (<bdi dir="ltr">+{k.pct.toFixed(2)}%</bdi>): </span>
            <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(k.totalAfterPct)}</span>
          </div>
          <span className="ms-auto flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => void toggleClosed()}>
              {k.closed ? t("detail.reopen") : t("detail.markClosed")}
            </Button>
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => void removeKashef()}>
              <Trash2 className="size-3.5" /> {t("detail.delete")}
            </Button>
          </span>
        </div>
      </div>

      {showLog && <ChangelogPanel log={log} />}

      {/* Items table */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t("detail.col.ref")}</TableHead>
              <TableHead>{t("detail.col.desc")}</TableHead>
              <TableHead className="text-center">{t("detail.col.qty")}</TableHead>
              <TableHead className="text-center">{t("detail.col.unit")}</TableHead>
              <TableHead className="text-center">{t("detail.col.rate")}</TableHead>
              <TableHead className="text-center">{t("detail.col.total")}</TableHead>
              <TableHead className="text-center">{t("detail.col.allocated")}</TableHead>
              <TableHead className="text-center">{t("detail.col.executed")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const overAlloc = l.allocatedTotal > l.qty
              const overExec = l.executedTotal > l.allocatedTotal
              const editing = qtyEdits[l.kashefLineId] !== undefined
              return (
                <Fragment key={l.kashefLineId}>
                  <TableRow className="cursor-pointer"
                    onClick={() => setExpanded(expanded === l.kashefLineId ? null : l.kashefLineId)}>
                    <TableCell><RefCode>{itemRef(l)}</RefCode></TableCell>
                    <TableCell className="max-w-md text-sm">{l.description}</TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      {editing ? (
                        <span className="inline-flex items-center gap-1">
                          <Input autoFocus className="h-7 w-24 text-sm" dir="ltr" inputMode="decimal"
                            value={qtyEdits[l.kashefLineId]}
                            onChange={(e) => setQtyEdits((x) => ({ ...x, [l.kashefLineId]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") void saveQty(l, qtyEdits[l.kashefLineId]) }} />
                          <Button size="sm" className="h-7" onClick={() => void saveQty(l, qtyEdits[l.kashefLineId])}>
                            {t("common.save")}
                          </Button>
                        </span>
                      ) : (
                        <button type="button" title={t("detail.editQty")}
                          className="font-mono tabular-nums underline-offset-2 hover:underline" dir="ltr"
                          onClick={() => setQtyEdits((x) => ({ ...x, [l.kashefLineId]: String(l.qty) }))}>
                          {fq(l.qty)}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">{l.unit}</TableCell>
                    <TableCell className="text-center font-mono text-sm tabular-nums" dir="ltr">{kd(l.rate)}</TableCell>
                    <TableCell className="text-center font-mono text-sm tabular-nums" dir="ltr">{kd(l.lineTotal)}</TableCell>
                    <TableCell className={cn("text-center font-mono text-sm tabular-nums", overAlloc && "font-semibold text-warning")} dir="ltr">
                      {fq(l.allocatedTotal)}
                      {overAlloc && <TriangleAlert className="ms-1 inline size-3.5" />}
                    </TableCell>
                    <TableCell className={cn("text-center font-mono text-sm tabular-nums", overExec && "font-semibold text-danger")} dir="ltr">
                      {fq(l.executedTotal)}
                      {overExec && <TriangleAlert className="ms-1 inline size-3.5" />}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 px-1.5 text-muted-foreground"
                        title={t("detail.removeLine")} onClick={() => void removeLine(l)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded === l.kashefLineId && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/20 p-3">
                        <AllocPanel line={l} subLines={subLines} subs={subs} onSaved={refresh} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AddLineRow kashefId={k.id} bop={bop} existing={existingIds} onSaved={refresh} />
    </div>
  )
}
