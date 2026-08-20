// طلبات التدقيق — entry form (kashef → sub → date → adaptive location
// → line entry with the sub's balance surfaced) + the saved-requests
// list for the picked kashef. Items outside the kashef or past the
// sub's allocation are allowed with explicit warnings, never blocked.
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Trash2, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { qty as fq } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  bopItems, itemRef, kashefList, subcontractors, subLineStatus, tadqiqCreate,
  tadqiqDelete, tadqiqList, type BopItem, type KashefOverview, type SubLineStatus,
  type Subcontractor, type TadqiqRow,
} from "./data"
import { locationLabel, WoBadge } from "./KashefList"
import { checkDate, dateInputProps } from "./dates"

interface DraftLine {
  bopItem: BopItem
  qty: number
  outOfKashef: boolean
  overAllocation: boolean
}

export function TadqiqScreen() {
  const { t } = useTranslation("quantities")
  const [kashefs, setKashefs] = useState<KashefOverview[] | null>(null)
  const [subs, setSubs] = useState<Subcontractor[]>([])
  const [bop, setBop] = useState<BopItem[] | null>(null)

  const [kashefId, setKashefId] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [date, setDate] = useState("")
  const [serial, setSerial] = useState("")
  const [streetNo, setStreetNo] = useState("")
  const [note, setNote] = useState("")
  const [opening, setOpening] = useState(false)

  const [subLines, setSubLines] = useState<SubLineStatus[] | null>(null)
  const [history, setHistory] = useState<TadqiqRow[] | null>(null)

  const [lines, setLines] = useState<DraftLine[]>([])
  const [bab, setBab] = useState("")
  const [item, setItem] = useState("")
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)

  const kashef = kashefs?.find((k) => String(k.id) === kashefId) ?? null

  useEffect(() => {
    void (async () => {
      try {
        const [ks, ss, b] = await Promise.all([kashefList(), subcontractors(), bopItems()])
        setKashefs(ks); setSubs(ss); setBop(b)
      } catch {
        toast.error(t("app.loadError"))
      }
    })()
  }, [t])

  const loadKashefData = useCallback(async (id: number) => {
    setSubLines(null); setHistory(null)
    try {
      const [sl, h] = await Promise.all([subLineStatus(id), tadqiqList(id)])
      setSubLines(sl); setHistory(h)
    } catch {
      toast.error(t("app.loadError"))
    }
  }, [t])

  useEffect(() => {
    setLines([]); setBab(""); setItem(""); setQ(""); setStreetNo("")
    if (kashefId) void loadKashefData(Number(kashefId))
  }, [kashefId, loadKashefData])

  // bab → band picker: the chosen sub's ALLOCATED lines surface first,
  // then the kashef's other lines, then the rest of the BOP.
  const rank = useCallback((b: BopItem): number => {
    if (!subLines) return 2
    const mine = subLines.find((s) => s.bopItemId === b.id && String(s.vendorId) === vendorId)
    if (mine && mine.allocated > 0) return 0
    if (subLines.some((s) => s.bopItemId === b.id)) return 1
    return 2
  }, [subLines, vendorId])

  const babs = useMemo(() => (bop ? [...new Set(bop.map((b) => b.bab))].sort((a, b) => a - b) : []), [bop])
  const bands = useMemo(() => {
    if (!bop) return []
    return bop
      .filter((b) => String(b.bab) === bab)
      .map((b) => ({ b, rank: rank(b) }))
      .sort((x, y) => x.rank - y.rank || x.b.band - y.b.band)
  }, [bop, bab, rank])

  const selected = (bop ?? []).find((b) => String(b.id) === item)
  const balance = useMemo(() => {
    if (!selected || !subLines || !vendorId) return null
    const mine = subLines.find((s) => s.bopItemId === selected.id && String(s.vendorId) === vendorId)
    const inKashef = subLines.some((s) => s.bopItemId === selected.id)
    if (!inKashef) return { outOfKashef: true, allocated: 0, executed: 0 }
    return { outOfKashef: false, allocated: mine?.allocated ?? 0, executed: mine?.executed ?? 0 }
  }, [selected, subLines, vendorId])

  const pendingExtra = useMemo(() => {
    if (!selected) return 0
    return lines.filter((l) => l.bopItem.id === selected.id).reduce((s, l) => s + l.qty, 0)
  }, [lines, selected])

  function addLine() {
    const num = Number(q)
    if (!selected || !balance || !isFinite(num) || num <= 0) return
    const executedAfter = balance.executed + pendingExtra + num
    setLines((ls) => [...ls, {
      bopItem: selected, qty: num,
      outOfKashef: balance.outOfKashef,
      overAllocation: !balance.outOfKashef && executedAfter > balance.allocated,
    }])
    setItem(""); setQ("")
  }

  async function submit() {
    if (!kashef || !vendorId || !date || lines.length === 0 || busy) return
    if (kashef.locType === "block" && !streetNo.trim()) { toast.error(t("tadqiq.streetNo")); return }
    const dateErr = checkDate(date, true)
    if (dateErr) { toast.error(t(dateErr)); return }
    setBusy(true)
    try {
      const res = await tadqiqCreate({
        kashefId: kashef.id, vendorId: Number(vendorId), date,
        serial: serial.trim(),
        streetNo: kashef.locType === "block" ? streetNo.trim() : "",
        note: note.trim(), opening,
        lines: lines.map((l) => ({ bopItemId: l.bopItem.id, qty: l.qty })),
      })
      toast.success(t("tadqiq.submitted"))
      const warnings = res?.warnings ?? []
      if (Array.isArray(warnings) && warnings.length > 0) {
        toast.warning(`${t("tadqiq.warnings")}: ${warnings.length}`)
      }
      setLines([]); setNote(""); setOpening(false); setQ(""); setItem(""); setSerial("")
      void loadKashefData(kashef.id)
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm(t("tadqiq.deleteConfirm"))) return
    try {
      await tadqiqDelete(id)
      toast.success(t("tadqiq.deleted"))
      if (kashef) void loadKashefData(kashef.id)
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    }
  }

  if (!kashefs || !bop) {
    return <div className="flex justify-center py-16"><Spinner className="size-6" /></div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("tadqiq.title")}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("tadqiq.newEntry")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>{t("tadqiq.kashef")}</Label>
              <Select value={kashefId} onValueChange={setKashefId}>
                <SelectTrigger><SelectValue placeholder={t("tadqiq.chooseKashef")} /></SelectTrigger>
                <SelectContent>
                  {kashefs.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      <span className="flex items-center gap-2">
                        <span dir="ltr" className="font-mono">{k.status === "wo" && k.woNo ? k.woNo : `#${k.kashefNo}`}</span>
                        <span className="max-w-72 truncate">{locationLabel(k, t)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("tadqiq.sub")}</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder={t("tadqiq.chooseSub")} /></SelectTrigger>
                <SelectContent>
                  {subs.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("tadqiq.date")}</Label>
              <Input dir="ltr" type="date" value={date} onChange={(e) => setDate(e.target.value)} {...dateInputProps()} />
            </div>
            <div className="space-y-1">
              <Label>{t("tadqiq.serial")}</Label>
              <Input dir="ltr" value={serial} placeholder={t("tadqiq.serialPh")}
                     onChange={(e) => setSerial(e.target.value)} />
            </div>
            {kashef?.locType === "block" && (
              <div className="space-y-1">
                <Label>{t("tadqiq.streetNo")}</Label>
                <Input value={streetNo} placeholder={t("tadqiq.streetNoPh")}
                       onChange={(e) => setStreetNo(e.target.value)} />
              </div>
            )}
            {kashef?.locType === "street" && (
              <div className="space-y-1">
                <Label>{t("tadqiq.streetNo")}</Label>
                <Input readOnly value={kashef.streetName} title={t("tadqiq.streetInherited")} />
              </div>
            )}
            <div className="space-y-1">
              <Label>{t("tadqiq.note")} <span className="text-xs text-muted-foreground">({t("common.optional")})</span></Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={opening} onCheckedChange={(v) => setOpening(v === true)} />
              {t("tadqiq.opening")}
            </label>
          </div>

          {kashef && vendorId && (
            <div className="space-y-3 border-t pt-3">
              <div className="text-sm font-semibold">{t("tadqiq.lines")}</div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("new.bab")}</Label>
                  <Select value={bab} onValueChange={(v) => { setBab(v); setItem("") }}>
                    <SelectTrigger className="h-9 w-24"><SelectValue placeholder={t("new.chooseBab")} /></SelectTrigger>
                    <SelectContent>
                      {babs.map((b) => <SelectItem key={b} value={String(b)}>{String(b)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("new.band")}</Label>
                  <Select value={item} onValueChange={setItem} disabled={!bab || !subLines}>
                    <SelectTrigger className="h-9 w-80"><SelectValue placeholder={t("new.chooseBand")} /></SelectTrigger>
                    <SelectContent>
                      {bands.map(({ b, rank: r }) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          <span dir="ltr" className="font-mono">{itemRef(b)}</span>
                          {r === 0 && " ★"}
                          {" — "}{b.description.slice(0, 55)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("tadqiq.qty")}</Label>
                  <Input className="h-9 w-28" dir="ltr" inputMode="decimal" value={q}
                         onChange={(e) => setQ(e.target.value)}
                         onKeyDown={(e) => e.key === "Enter" && addLine()} />
                </div>
                <Button className="h-9" disabled={!selected || !q.trim()} onClick={addLine}>
                  <Plus className="size-4" /> {t("tadqiq.add")}
                </Button>
              </div>

              {selected && balance && (
                <div className={cn("rounded-md border p-3 text-sm",
                  balance.outOfKashef ? "border-warning/50 bg-warning-surface" : "bg-muted/30")}>
                  {balance.outOfKashef ? (
                    <span><TriangleAlert className="me-1 inline size-4 text-warning" /> {t("tadqiq.outOfKashef")}</span>
                  ) : (
                    <div className="flex flex-wrap gap-5">
                      <span className="text-xs font-semibold text-muted-foreground">{t("tadqiq.balance")}:</span>
                      <span className="text-xs">{t("tadqiq.allocated")}: <b className="font-mono tabular-nums" dir="ltr">{fq(balance.allocated)}</b></span>
                      <span className="text-xs">{t("tadqiq.executed")}: <b className="font-mono tabular-nums" dir="ltr">{fq(balance.executed + pendingExtra)}</b></span>
                      <span className="text-xs">{t("tadqiq.remaining")}: <b className="font-mono tabular-nums" dir="ltr">{fq(balance.allocated - balance.executed - pendingExtra)}</b></span>
                      {balance.allocated === 0 && (
                        <span className="text-xs text-warning"><TriangleAlert className="me-1 inline size-3.5" /> {t("tadqiq.notAllocated")}</span>
                      )}
                      {q && isFinite(Number(q)) && Number(q) > 0 &&
                        balance.executed + pendingExtra + Number(q) > balance.allocated && (
                        <span className="text-xs text-warning"><TriangleAlert className="me-1 inline size-3.5" /> {t("tadqiq.overWarn")}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {lines.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("detail.col.ref")}</TableHead>
                        <TableHead>{t("detail.col.desc")}</TableHead>
                        <TableHead className="text-center">{t("tadqiq.qty")}</TableHead>
                        <TableHead className="text-center">{t("detail.col.unit")}</TableHead>
                        <TableHead />
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell><RefCode>{itemRef(l.bopItem)}</RefCode></TableCell>
                          <TableCell className="max-w-md text-sm">{l.bopItem.description}</TableCell>
                          <TableCell className="text-center font-mono tabular-nums" dir="ltr">{fq(l.qty)}</TableCell>
                          <TableCell className="text-center text-sm">{l.bopItem.unit}</TableCell>
                          <TableCell className="text-xs">
                            {l.outOfKashef && <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">{t("log.field.out_of_kashef")}</Badge>}
                            {l.overAllocation && <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">{t("log.field.over_allocation")}</Badge>}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 px-1.5 text-muted-foreground"
                              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end">
                <Button disabled={busy || !date || lines.length === 0} onClick={() => void submit()}>
                  {busy ? <Spinner className="size-4" /> : t("tadqiq.submit")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History for the picked kashef */}
      {kashef && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {t("tadqiq.history")}
              <WoBadge k={kashef} />
              <span className="min-w-0 flex-1 truncate text-sm font-normal text-muted-foreground" title={locationLabel(kashef, t)}>{locationLabel(kashef, t)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history === null ? (
              <div className="flex justify-center py-6"><Spinner className="size-5" /></div>
            ) : history.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("tadqiq.historyEmpty")}
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((h) => {
                  const flagged = h.lines.filter((l) => l.outOfKashef || l.overAllocation).length
                  return (
                    <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
                      <span dir="ltr" className="font-mono text-xs">{h.date}</span>
                      {h.serialNo && <RefCode className="text-xs">{h.serialNo}</RefCode>}
                      <span className="font-medium">{h.vendorName}</span>
                      {h.streetNo && <span className="text-xs text-muted-foreground">{h.streetNo}</span>}
                      <span className="text-xs text-muted-foreground">{h.lines.length} {t("tadqiq.linesCount")}</span>
                      {h.opening && <Badge variant="secondary">{t("tadqiq.opening")}</Badge>}
                      {flagged > 0 && (
                        <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">
                          <TriangleAlert className="me-1 size-3" /> {flagged} {t("tadqiq.flagged")}
                        </Badge>
                      )}
                      {h.note && <span className="text-xs text-muted-foreground">· {h.note}</span>}
                      <Button variant="ghost" size="sm" className="ms-auto h-7 px-1.5 text-muted-foreground"
                        title={t("tadqiq.delete")} onClick={() => void remove(h.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
