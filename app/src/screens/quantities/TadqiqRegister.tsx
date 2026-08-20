// سجل طلبات التدقيق — every request of the selected project, newest
// first, paged server-side (50 a page). Filter bar (WO / subcontractor /
// serial / date range); each row expands to its items. Recording a new
// request lives at /quantities/tadqiq/new (TadqiqScreen).
import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { fmtKWDate, qty as fq } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  kashefList, subcontractors, tadqiqPage,
  type KashefOverview, type Subcontractor, type TadqiqRegRow,
} from "./data"
import { locationLabel } from "./site"
import { dateInputProps } from "./dates"

const ALL = "__all__"
const PAGE_SIZE = 50

export function TadqiqRegister() {
  const { t, i18n } = useTranslation("quantities")
  const [params, setParams] = useSearchParams()
  const [kashefs, setKashefs] = useState<KashefOverview[]>([])
  const [subs, setSubs] = useState<Subcontractor[]>([])
  const [rows, setRows] = useState<TadqiqRegRow[] | undefined>(undefined)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<Set<number>>(new Set())

  // filters live in the URL so a page reload / back keeps them
  const page = Math.max(0, Number(params.get("p") || 0))
  const kashefId = params.get("wo") || ALL
  const vendorId = params.get("sub") || ALL
  const serial = params.get("q") || ""
  const dateFrom = params.get("from") || ""
  const dateTo = params.get("to") || ""
  const [serialDraft, setSerialDraft] = useState(serial)

  function setParam(key: string, value: string, resetPage = true) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value); else next.delete(key)
    if (resetPage) next.delete("p")
    setParams(next, { replace: true })
  }

  useEffect(() => {
    void kashefList().then(setKashefs).catch(() => {})
    void subcontractors().then(setSubs).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setRows(undefined); setError(false); setOpen(new Set())
    tadqiqPage({
      page, size: PAGE_SIZE,
      kashefId: kashefId !== ALL ? Number(kashefId) : null,
      vendorId: vendorId !== ALL ? Number(vendorId) : null,
      serial, dateFrom: dateFrom || null, dateTo: dateTo || null,
    }).then((r) => { if (alive) { setRows(r.rows); setTotal(r.total) } })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [page, kashefId, vendorId, serial, dateFrom, dateTo])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const woOptions = useMemo(
    () => [...kashefs].sort((a, b) => a.kashefNo - b.kashefNo), [kashefs])
  const dirty = kashefId !== ALL || vendorId !== ALL || serial || dateFrom || dateTo

  function toggle(id: number) {
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t("treg.title")}</h1>
        <span className="text-sm text-muted-foreground">
          <bdi dir="ltr">{total.toLocaleString("en-US")}</bdi> {t("treg.requests")}
        </span>
        <Button asChild size="sm" className="ms-auto">
          <Link to="/quantities/tadqiq/new"><Plus className="size-4" /> {t("tadqiq.newEntry")}</Link>
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <Select value={kashefId} onValueChange={(v) => setParam("wo", v)}>
          <SelectTrigger className="h-8 w-56 text-sm"><SelectValue placeholder={t("tadqiq.kashef")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("tadqiq.kashef")}: {t("list.all")}</SelectItem>
            {woOptions.map((k) => (
              <SelectItem key={k.id} value={String(k.id)}>
                <span className="flex items-center gap-2">
                  <RefCode className="text-xs">{k.woNo || String(k.kashefNo)}</RefCode>
                  <span className="max-w-72 truncate">{locationLabel(k, t)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vendorId} onValueChange={(v) => setParam("sub", v)}>
          <SelectTrigger className="h-8 w-48 text-sm"><SelectValue placeholder={t("tadqiq.sub")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("tadqiq.sub")}: {t("list.all")}</SelectItem>
            {subs.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-8 w-36 text-sm" dir="ltr" placeholder={t("treg.serialSearch")} value={serialDraft}
               onChange={(e) => setSerialDraft(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && setParam("q", serialDraft)}
               onBlur={() => serialDraft !== serial && setParam("q", serialDraft)} />
        <Input className="h-8 w-36 text-sm" dir="ltr" type="date" value={dateFrom} title={t("treg.from")}
               onChange={(e) => setParam("from", e.target.value)} {...dateInputProps()} />
        <Input className="h-8 w-36 text-sm" dir="ltr" type="date" value={dateTo} title={t("treg.to")}
               onChange={(e) => setParam("to", e.target.value)} {...dateInputProps()} />
        {dirty && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => { setSerialDraft(""); setParams({}, { replace: true }) }}>
            {t("list.clear")}
          </Button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">{t("app.loadError")}</div>
      ) : rows === undefined ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t("treg.empty")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("treg.col.date")}</TableHead>
                <TableHead>{t("treg.col.serial")}</TableHead>
                <TableHead>{t("treg.col.wo")}</TableHead>
                <TableHead>{t("treg.col.site")}</TableHead>
                <TableHead>{t("treg.col.sub")}</TableHead>
                <TableHead className="text-end">{t("treg.col.items")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = open.has(r.id)
                const site = [locationLabel(r.site, t), r.streetNo].filter(Boolean).join(" — ")
                return (
                  <FragmentRow key={r.id}>
                    <TableRow className={cn("cursor-pointer", isOpen && "bg-secondary/40")} onClick={() => toggle(r.id)}>
                      <TableCell className="text-muted-foreground">
                        {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </TableCell>
                      <TableCell><bdi dir="ltr" className="font-mono text-xs">{r.date ? fmtKWDate(r.date) : "—"}</bdi></TableCell>
                      <TableCell>
                        {r.serialNo ? <RefCode className="text-xs">{r.serialNo}</RefCode> : <span className="text-muted-foreground">—</span>}
                        {r.opening && <Badge variant="secondary" className="ms-1">{t("tadqiq.opening")}</Badge>}
                      </TableCell>
                      <TableCell>
                        <Link to={`/quantities/kashef/${r.kashefId}`} onClick={(e) => e.stopPropagation()}
                              className="hover:underline">
                          <RefCode className="text-xs">{r.woNo || String(r.kashefNo)}</RefCode>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-72 truncate text-sm" title={site}>{site}</TableCell>
                      <TableCell className="text-sm">{r.vendorName}</TableCell>
                      <TableCell className="text-end text-sm tabular-nums"><bdi dir="ltr">{r.lines.length}</bdi></TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                        <TableCell />
                        <TableCell colSpan={6} className="py-2">
                          {r.note && <div className="mb-2 text-xs text-muted-foreground">{r.note}</div>}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-24">{t("detail.col.ref")}</TableHead>
                                <TableHead>{t("detail.col.desc")}</TableHead>
                                <TableHead className="w-20">{t("detail.col.unit")}</TableHead>
                                <TableHead className="w-28 text-end">{t("detail.col.qty")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.lines.map((l, i) => (
                                <TableRow key={i}>
                                  <TableCell><RefCode className="text-xs">{l.ref}</RefCode></TableCell>
                                  <TableCell className="text-sm">{l.description}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{l.unit}</TableCell>
                                  <TableCell className="text-end font-mono text-sm tabular-nums" dir="ltr">{fq(l.qty)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pager */}
      {rows && total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setParam("p", String(page - 1), false)}>
            {i18n.dir() === "rtl" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
          <span className="text-muted-foreground">
            {t("treg.page")} <bdi dir="ltr">{page + 1}</bdi> / <bdi dir="ltr">{pages}</bdi>
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setParam("p", String(page + 1), false)}>
            {i18n.dir() === "rtl" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
      )}
    </div>
  )
}

// React fragments cannot carry a key inside <TableBody> maps in a typed
// way without the long-form import; this keeps the JSX readable.
function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</> }
