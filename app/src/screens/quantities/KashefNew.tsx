// كشف جديد — Excel upload vs manual entry. The Excel path shows a
// pre-save review (matched lines + anomalies); the manual path is the
// bab→band picker with auto description/rate. Both save through
// qm_kashef_create. A collapsed "historical entry" section lets Fouad
// backfill old kashefs directly in WO status.
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Trash2, TriangleAlert, Upload } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RefCode } from "@/components/patterns"
import { kd, qty as fq } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  bopItems, contractInfo, getContract, itemRef, kashefCreate, kashefList,
  type BopItem, type KashefCreateInput,
} from "./data"
import { SiteFields } from "./SiteFields"
import { ScopeFields } from "./ScopeFields"
import { scopesToWorkType } from "./scopes"
import { checkDate, dateInputProps } from "./dates"
import type { ScopeCode } from "./data"
import { emptySite, siteFromRow, siteModelFor, siteToFields, type SiteState } from "./site"
import {
  candidateSheets, lineDisplayRef, openWorkbook, parseKashefSheet,
  type ParsedKashef,
} from "./kashefImport"
import type { WorkBook } from "xlsx"

interface DraftLine {
  bopItem: BopItem
  qty: number
}

interface HeaderState {
  woNo: string
  site: SiteState
  workType: string        // legacy free text — kept when the Excel sheet carried one and no scope is ticked
  scopes: ScopeCode[]
  description: string
  woDate: string
  duration: string
}

const MODEL = () => siteModelFor(getContract())

function emptyHeader(): HeaderState {
  return { woNo: "", site: emptySite(MODEL()), workType: "", scopes: [], description: "", woDate: "", duration: "" }
}

function HeaderFields({ h, setH, suggestedNo, areas }: {
  h: HeaderState
  setH: React.Dispatch<React.SetStateAction<HeaderState>>
  suggestedNo: number | null
  areas: string[]
}) {
  const { t } = useTranslation("quantities")
  const set = (key: keyof HeaderState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setH((x) => ({ ...x, [key]: e.target.value }))
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <div className="space-y-1">
        <Label>{t("new.kashefNo")}</Label>
        <Input dir="ltr" inputMode="numeric" value={h.woNo} onChange={set("woNo")}
               placeholder={suggestedNo ? String(suggestedNo) : ""} />
      </div>
      <SiteFields model={MODEL()} value={h.site} areas={areas}
                  onChange={(patch) => setH((x) => ({ ...x, site: { ...x.site, ...patch } }))} />
      <div className="space-y-1">
        <Label>{t("new.woDate")}</Label>
        <Input dir="ltr" type="date" value={h.woDate} onChange={set("woDate")} {...dateInputProps()} />
      </div>
      <div className="space-y-1">
        <Label>{t("new.duration")}</Label>
        <Input dir="ltr" inputMode="numeric" value={h.duration} onChange={set("duration")} />
      </div>
      <ScopeFields scopes={h.scopes} description={h.description}
                   onChange={(patch) => setH((x) => ({ ...x, ...patch }))} />
    </div>
  )
}

export function KashefNew() {
  const { t } = useTranslation("quantities")
  const nav = useNavigate()
  const [bop, setBop] = useState<BopItem[] | null>(null)
  const [pct, setPct] = useState(0)
  const [suggestedNo, setSuggestedNo] = useState<number | null>(null)
  const [areas, setAreas] = useState<string[]>([])
  const [h, setH] = useState<HeaderState>(emptyHeader())
  const [busy, setBusy] = useState(false)

  // manual lines
  const [lines, setLines] = useState<DraftLine[]>([])
  const [bab, setBab] = useState("")
  const [item, setItem] = useState("")
  const [q, setQ] = useState("")

  // excel state
  const fileRef = useRef<HTMLInputElement>(null)
  const [wb, setWb] = useState<WorkBook | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [parsed, setParsed] = useState<ParsedKashef | null>(null)
  const [parsing, setParsing] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [b, c, list] = await Promise.all([bopItems(), contractInfo(), kashefList()])
        setBop(b)
        setPct(c.pct)
        // suggest the next WO number below the 900-range placeholders
        const next = list.reduce((m, k) => (k.kashefNo < 900 ? Math.max(m, k.kashefNo) : m), 0) + 1
        setSuggestedNo(next)
        setAreas([...new Set(list.map((k) => k.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")))
        setH((x) => ({ ...x, woNo: x.woNo || String(next) }))
      } catch {
        toast.error(t("app.loadError"))
      }
    })()
  }, [t])

  const babs = useMemo(() => (bop ? [...new Set(bop.map((b) => b.bab))].sort((a, b) => a - b) : []), [bop])
  const bands = useMemo(
    () => (bop ?? []).filter((b) => String(b.bab) === bab && !lines.some((l) => l.bopItem.id === b.id)),
    [bop, bab, lines])
  const selected = (bop ?? []).find((b) => String(b.id) === item)

  const effectiveLines: DraftLine[] = parsed
    ? parsed.lines.filter((l) => !l.skip && l.bopItem).map((l) => ({ bopItem: l.bopItem!, qty: l.qty }))
    : lines
  const subtotal = effectiveLines.reduce((s, l) => s + l.qty * l.bopItem.rate, 0)

  function addManual() {
    const num = Number(q)
    if (!selected || !isFinite(num) || num < 0) return
    setLines((ls) => [...ls, { bopItem: selected, qty: num }])
    setItem(""); setQ("")
  }

  async function onFile(f: File | null) {
    if (!f || !bop) return
    setParsing(true)
    setParsed(null)
    setWb(null)
    try {
      const book = await openWorkbook(f)
      const cands = candidateSheets(book)
      if (cands.length === 0) throw new Error("no kashef sheet")
      setWb(book)
      setSheets(cands)
      if (cands.length === 1) applySheet(book, cands[0])
    } catch {
      toast.error(t("new.parseFailed"))
    } finally {
      setParsing(false)
    }
  }

  function applySheet(book: WorkBook, name: string) {
    if (!bop) return
    try {
      const p = parseKashefSheet(book, name, bop)
      setParsed(p)
      setH((x) => ({
        ...x,
        site: siteFromRow({
          area: p.area || x.site.area, locType: p.locType, blockNo: p.blockNo,
          streetName: p.streetName, locationText: p.locationText,
          kmFrom: p.kmFrom, kmTo: p.kmTo, direction: p.direction,
        }, MODEL()),
        workType: p.workType || x.workType,
      }))
    } catch {
      toast.error(t("new.parseFailed"))
    }
  }

  async function save() {
    const woNo = Number(h.woNo)
    if (!isFinite(woNo) || woNo < 1) { toast.error(t("new.kashefNo")); return }
    if (effectiveLines.length === 0) { toast.error(t("new.noLines")); return }
    const site = siteToFields(h.site, MODEL())
    if (!site.ok) { toast.error(t(site.error)); return }
    const dateErr = checkDate(h.woDate)
    if (dateErr) { toast.error(t(dateErr)); return }
    if (busy) return
    setBusy(true)
    try {
      const duration = Number(h.duration)
      const input: KashefCreateInput = {
        woNo,
        ...site.f,
        workType: h.scopes.length ? scopesToWorkType(h.scopes) : h.workType.trim(),
        scopes: h.scopes,
        description: h.description.trim(),
        woDate: h.woDate || null,
        durationDays: isFinite(duration) && duration > 0 ? duration : null,
        lines: effectiveLines.map((l) => ({ bopItemId: l.bopItem.id, qty: l.qty })),
      }
      const res = await kashefCreate(input)
      toast.success(t("new.created"))
      nav(`/quantities/kashef/${res.id}`)
    } catch (e: any) {
      toast.error(e?.message || t("app.loadError"))
    } finally {
      setBusy(false)
    }
  }

  if (!bop) {
    return <div className="flex justify-center py-16"><Spinner className="size-6" /></div>
  }

  const problems = parsed?.lines.filter((l) => l.issue) ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("new.title")}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("new.header")}</CardTitle></CardHeader>
        <CardContent>
          <HeaderFields h={h} setH={setH} suggestedNo={suggestedNo} areas={areas} />
        </CardContent>
      </Card>

      <Tabs defaultValue="excel">
        <TabsList>
          <TabsTrigger value="excel">{t("new.excel")}</TabsTrigger>
          <TabsTrigger value="manual">{t("new.manual")}</TabsTrigger>
        </TabsList>

        {/* ── Excel fork ── */}
        <TabsContent value="excel" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.xlsm" className="hidden"
                   onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> {t("new.dropFile")}
            </Button>
            {parsing && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" /> {t("new.parsing")}</span>}
            {wb && sheets.length > 1 && (
              <div className="flex items-center gap-2">
                <Label className="text-sm">{t("new.sheetPick")}</Label>
                <Select value={parsed?.sheet ?? ""} onValueChange={(v) => applySheet(wb, v)}>
                  <SelectTrigger className="w-64"><SelectValue placeholder={t("new.sheetPick")} /></SelectTrigger>
                  <SelectContent>
                    {sheets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {sheets.length > 1 && <p className="w-full text-xs text-muted-foreground">{t("new.sheetPickHint")}</p>}
          </div>

          {parsed && (
            <>
              {parsed.pct !== null && Math.abs(parsed.pct - pct) > 0.005 && (
                <div className="rounded-md border border-warning/50 bg-warning-surface p-3 text-sm">
                  <TriangleAlert className="me-1 inline size-4 text-warning" />
                  {t("new.importPct")}: <bdi dir="ltr">+{parsed.pct.toFixed(2)}%</bdi> ≠ <bdi dir="ltr">+{pct.toFixed(2)}%</bdi>
                </div>
              )}
              {problems.length > 0 && (
                <Card className="border-warning/50">
                  <CardHeader><CardTitle className="text-sm">{t("new.problems")} ({problems.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {problems.map((l) => (
                      <div key={l.rowIndex} className="flex flex-wrap items-center gap-2 rounded bg-warning-surface px-2 py-1.5 text-xs">
                        <RefCode>{lineDisplayRef(l)}</RefCode>
                        <span className="max-w-md truncate">{l.desc}</span>
                        {l.issue === "unknown_id" ? (
                          <span className="font-semibold text-danger">{t("new.unknownId")}</span>
                        ) : (
                          <span>
                            {t("new.rateDiffers")} — {t("new.fileRate")}: <bdi dir="ltr" className="font-mono">{l.fileRate}</bdi>،{" "}
                            {t("new.bopRate")}: <bdi dir="ltr" className="font-mono">{l.bopItem!.rate}</bdi>
                          </span>
                        )}
                        {l.issue === "unknown_id" && (
                          <label className="ms-auto flex items-center gap-1">
                            <Checkbox checked={l.skip}
                              onCheckedChange={(v) => setParsed((p) => p && ({
                                ...p,
                                lines: p.lines.map((x) => x.rowIndex === l.rowIndex ? { ...x, skip: v === true } : x),
                              }))} />
                            {t("new.skipLine")}
                          </label>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              <ReviewTable parsed={parsed} />
            </>
          )}
        </TabsContent>

        {/* ── Manual fork ── */}
        <TabsContent value="manual" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
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
              <Select value={item} onValueChange={setItem} disabled={!bab}>
                <SelectTrigger className="h-9 w-80"><SelectValue placeholder={t("new.chooseBand")} /></SelectTrigger>
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
              <div className="pb-2 text-xs text-muted-foreground">
                {selected.unit} · <span dir="ltr" className="font-mono">{kd(selected.rate)}</span>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t("new.qty")}</Label>
              <Input className="h-9 w-28" dir="ltr" inputMode="decimal" value={q}
                     onChange={(e) => setQ(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && addManual()} />
            </div>
            <Button className="h-9" disabled={!selected || !q.trim()} onClick={addManual}>
              <Plus className="size-4" /> {t("new.add")}
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("new.noLines")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("detail.col.ref")}</TableHead>
                    <TableHead>{t("detail.col.desc")}</TableHead>
                    <TableHead className="text-center">{t("detail.col.qty")}</TableHead>
                    <TableHead className="text-center">{t("detail.col.unit")}</TableHead>
                    <TableHead className="text-center">{t("detail.col.rate")}</TableHead>
                    <TableHead className="text-center">{t("detail.col.total")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={l.bopItem.id}>
                      <TableCell><RefCode>{itemRef(l.bopItem)}</RefCode></TableCell>
                      <TableCell className="max-w-md whitespace-normal break-words text-sm">{l.bopItem.description}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums" dir="ltr">{fq(l.qty)}</TableCell>
                      <TableCell className="text-center text-sm">{l.bopItem.unit}</TableCell>
                      <TableCell className="text-center font-mono text-sm tabular-nums" dir="ltr">{kd(l.bopItem.rate)}</TableCell>
                      <TableCell className="text-center font-mono text-sm tabular-nums" dir="ltr">{kd(l.qty * l.bopItem.rate)}</TableCell>
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
        </TabsContent>
      </Tabs>

      {/* Totals + save */}
      <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-4">
        <div className="text-sm">
          <span className="text-muted-foreground">{t("detail.subtotal")}: </span>
          <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(subtotal)}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">{t("detail.afterPct")} (<bdi dir="ltr">+{pct.toFixed(2)}%</bdi>): </span>
          <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(subtotal * (1 + pct / 100))}</span>
        </div>
        <Button className="ms-auto" disabled={busy || effectiveLines.length === 0} onClick={() => void save()}>
          {busy ? <Spinner className="size-4" /> : t("new.create")}
        </Button>
      </div>
    </div>
  )
}

function ReviewTable({ parsed }: { parsed: ParsedKashef }) {
  const { t } = useTranslation("quantities")
  const matched = parsed.lines.filter((l) => !l.skip && l.bopItem)
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">
        {t("new.matched")} ({matched.length})
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("detail.col.ref")}</TableHead>
            <TableHead>{t("detail.col.desc")}</TableHead>
            <TableHead className="text-center">{t("detail.col.qty")}</TableHead>
            <TableHead className="text-center">{t("detail.col.unit")}</TableHead>
            <TableHead className="text-center">{t("detail.col.rate")}</TableHead>
            <TableHead className="text-center">{t("detail.col.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matched.map((l) => (
            <TableRow key={l.rowIndex} className={cn(l.issue === "rate_differs" && "bg-warning-surface/50")}>
              <TableCell><RefCode>{lineDisplayRef(l)}</RefCode></TableCell>
              <TableCell className="max-w-md whitespace-normal break-words text-sm">{l.bopItem!.description}</TableCell>
              <TableCell className="text-center font-mono tabular-nums" dir="ltr">{fq(l.qty)}</TableCell>
              <TableCell className="text-center text-sm">{l.bopItem!.unit}</TableCell>
              <TableCell className="text-center font-mono text-sm tabular-nums" dir="ltr">{kd(l.bopItem!.rate)}</TableCell>
              <TableCell className="text-center font-mono text-sm tabular-nums" dir="ltr">{kd(l.qty * l.bopItem!.rate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
