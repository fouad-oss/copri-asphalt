// أوامر العمل — REGISTER pattern: filter bar (search + scope selects +
// value range + sort) above the card list, with a running count and the
// filtered totals. Rows open the work-order detail.
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { kd } from "@/lib/format"
import { cn } from "@/lib/utils"
import { getContract, kashefList, woCertification, type KashefOverview, type WoCertification } from "./data"
import { locationLabel, siteKind, siteModelFor, type SiteKind } from "./site"
import { CATEGORIES, categoriesOf, categoryLabel, workTypeLabel, type ScopeCategory } from "./scopes"

// kept as a re-export: every screen imported it from here before site.ts existed
export { locationLabel }

// site-type filter values per contract model (see site.ts)
const KINDS: Record<ReturnType<typeof siteModelFor>, SiteKind[]> = {
  areas: ["block", "street", "misc"],
  roads: ["range", "spot", "road", "misc"],
}

export function WoBadge({ k }: { k: KashefOverview }) {
  const { t } = useTranslation("quantities")
  return (
    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
      {t("status.wo")} <RefCode className="ms-1">{k.woNo || String(k.kashefNo)}</RefCode>
    </Badge>
  )
}

const ALL = "__all__"
type Sort = "no" | "value" | "executed" | "progress" | "date" | "duration"

function endDateOf(k: KashefOverview): string | null {
  if (!k.woDate || k.durationDays == null) return null
  const d = new Date(k.woDate + "T00:00:00")
  d.setDate(d.getDate() + k.durationDays)
  return d.toISOString().slice(0, 10)
}

function overdueDays(k: KashefOverview): number | null {
  const end = endDateOf(k)
  if (!end || k.closed) return null
  const days = Math.floor((Date.now() - new Date(end + "T00:00:00").getTime()) / 86400000)
  return days > 0 ? days : null
}

export function KashefList() {
  const { t, i18n } = useTranslation("quantities")
  const [rows, setRows] = useState<KashefOverview[] | undefined>(undefined)
  const [certs, setCerts] = useState<WoCertification[]>([])
  const [error, setError] = useState(false)

  const [q, setQ] = useState("")
  const [status, setStatus] = useState<"open" | "closed" | typeof ALL>(ALL)
  const [area, setArea] = useState<string>(ALL)
  const [workType, setWorkType] = useState<string>(ALL)
  const [locType, setLocType] = useState<string>(ALL)
  const [minValue, setMinValue] = useState("")
  const [maxValue, setMaxValue] = useState("")
  const [onlyDelayed, setOnlyDelayed] = useState(false)
  const [onlyAwaiting, setOnlyAwaiting] = useState(false)
  const [sort, setSort] = useState<Sort>("no")

  async function load() {
    setError(false)
    setRows(undefined)
    try {
      // certification standing is optional (0044) — the list works without it
      const [list, cert] = await Promise.all([
        kashefList(), woCertification().catch(() => [] as WoCertification[]),
      ])
      setRows(list)
      setCerts(cert)
    } catch {
      setError(true)
    }
  }
  useEffect(() => { void load() }, [])

  const awaitingIds = useMemo(() => {
    const s = new Set<number>()
    for (const c of certs) if (c.closed && c.uncertifiedValue > 0.0005) s.add(c.kashefId)
    return s
  }, [certs])

  const options = useMemo(() => {
    const areas = new Set<string>()
    const cats = new Set<ScopeCategory>()
    for (const k of rows ?? []) {
      if (k.area) areas.add(k.area)
      for (const c of categoriesOf(k)) cats.add(c)
    }
    return {
      areas: [...areas].sort((a, b) => a.localeCompare(b, "ar")),
      // scope categories in taxonomy order, only those present
      types: CATEGORIES.map((c) => c.code).filter((c) => cats.has(c)),
    }
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim()
    const min = Number(minValue)
    const max = Number(maxValue)
    const out = rows.filter((k) => {
      if (needle) {
        const hay = `${k.kashefNo} ${k.area} ${k.blockNo} ${k.streetName} ${k.locationText} ${k.description} ${k.workType} ${k.woNo}`
        if (!hay.includes(needle)) return false
      }
      if (status === "open" && k.closed) return false
      if (status === "closed" && !k.closed) return false
      if (area !== ALL && k.area !== area) return false
      if (workType !== ALL && !categoriesOf(k).includes(workType as ScopeCategory)) return false
      if (locType !== ALL && siteKind(k) !== locType) return false
      if (minValue && isFinite(min) && k.totalAfterPct < min) return false
      if (maxValue && isFinite(max) && k.totalAfterPct > max) return false
      if (onlyDelayed && overdueDays(k) == null) return false
      if (onlyAwaiting && !awaitingIds.has(k.id)) return false
      return true
    })
    const mult = 1 + (rows[0]?.pct ?? 9) / 100
    out.sort((a, b) => {
      switch (sort) {
        case "value": return b.totalAfterPct - a.totalAfterPct
        case "executed": return b.executedValue * mult - a.executedValue * mult
        case "progress": {
          const pa = a.subtotal > 0 ? a.executedValue / a.subtotal : 0
          const pb = b.subtotal > 0 ? b.executedValue / b.subtotal : 0
          return pb - pa
        }
        case "date": return (b.woDate || "").localeCompare(a.woDate || "")
        case "duration": return (b.durationDays ?? 0) - (a.durationDays ?? 0)
        default: return b.kashefNo - a.kashefNo
      }
    })
    return out
  }, [rows, q, status, area, workType, locType, minValue, maxValue,
      onlyDelayed, onlyAwaiting, sort, awaitingIds])

  const totals = useMemo(() => {
    const mult = 1 + (rows?.[0]?.pct ?? 9) / 100
    return {
      value: filtered.reduce((s, k) => s + k.totalAfterPct, 0),
      executed: filtered.reduce((s, k) => s + k.executedValue * mult, 0),
    }
  }, [filtered, rows])

  const dirty = q !== "" || status !== ALL || area !== ALL || workType !== ALL ||
    locType !== ALL || minValue !== "" || maxValue !== "" || onlyDelayed || onlyAwaiting ||
    sort !== "no"

  function clearAll() {
    setQ(""); setStatus(ALL); setArea(ALL); setWorkType(ALL); setLocType(ALL)
    setMinValue(""); setMaxValue(""); setOnlyDelayed(false); setOnlyAwaiting(false); setSort("no")
  }

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

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 max-w-xs" placeholder={t("list.search")} value={q}
                 onChange={(e) => setQ(e.target.value)} />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue placeholder={t("list.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("list.status")}: {t("list.all")}</SelectItem>
              <SelectItem value="open">{t("list.statusOpen")}</SelectItem>
              <SelectItem value="closed">{t("list.statusClosed")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder={t("list.area")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("list.area")}: {t("list.all")}</SelectItem>
              {options.areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={workType} onValueChange={setWorkType}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder={t("list.workType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("list.workType")}: {t("list.all")}</SelectItem>
              {options.types.map((a) => <SelectItem key={a} value={a}>{categoryLabel(a, i18n.language)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={locType} onValueChange={setLocType}>
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue placeholder={t("list.locType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("list.locType")}: {t("list.all")}</SelectItem>
              {KINDS[siteModelFor(getContract())].map((l) => (
                <SelectItem key={l} value={l}>{t(`loc.${l}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild size="sm" className="ms-auto">
            <Link to="/quantities/new">{t("nav.newKashef")}</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("list.valueFrom")}</span>
          <Input className="h-8 w-28 text-sm" dir="ltr" inputMode="decimal"
                 value={minValue} onChange={(e) => setMinValue(e.target.value)} />
          <span className="text-xs text-muted-foreground">{t("list.valueTo")}</span>
          <Input className="h-8 w-28 text-sm" dir="ltr" inputMode="decimal"
                 value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />

          <Button size="sm" variant={onlyDelayed ? "default" : "outline"}
                  onClick={() => setOnlyDelayed((v) => !v)}>
            {t("list.onlyDelayed")}
          </Button>
          {certs.length > 0 && (
            <Button size="sm" variant={onlyAwaiting ? "default" : "outline"}
                    onClick={() => setOnlyAwaiting((v) => !v)}>
              {t("list.onlyAwaiting")}
            </Button>
          )}

          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-44 text-sm ms-auto">
              <SelectValue placeholder={t("list.sort")} />
            </SelectTrigger>
            <SelectContent>
              {([["no", "sortNo"], ["value", "sortValue"], ["executed", "sortExecuted"],
                 ["progress", "sortProgress"], ["date", "sortDate"],
                 ["duration", "sortDuration"]] as const).map(([v, key]) => (
                <SelectItem key={v} value={v}>{t("list.sort")}: {t(`list.${key}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={clearAll}>{t("list.clear")}</Button>
          )}
        </div>

        {rows && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
            <span>{t("list.showing", { n: filtered.length, total: rows.length })}</span>
            <span>
              {t("list.sumValue")}:{" "}
              <bdi dir="ltr" className="font-mono tabular-nums">{kd(totals.value)}</bdi>
            </span>
            <span>
              {t("list.sumExecuted")}:{" "}
              <bdi dir="ltr" className="font-mono tabular-nums">{kd(totals.executed)}</bdi>
            </span>
          </div>
        )}
      </div>

      {rows === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? t("list.empty") : t("list.noMatch")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((k) => {
            const progress = k.subtotal > 0 ? Math.min(100, (k.executedValue / k.subtotal) * 100) : 0
            const late = overdueDays(k)
            return (
              <Link key={k.id} to={`/quantities/kashef/${k.id}`}
                className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {t("list.kashefNo")} <RefCode>{k.woNo || String(k.kashefNo)}</RefCode>
                  </span>
                  <Badge variant="outline">{t(`loc.${siteKind(k)}`)}</Badge>
                  {k.closed && <Badge variant="secondary">{t("status.closed")}</Badge>}
                  {late != null && (
                    <Badge className="bg-danger-surface text-danger hover:bg-danger-surface">
                      {t("list.delayedBadge")} <bdi dir="ltr" className="ms-1">{late}</bdi> {t("list.days")}
                    </Badge>
                  )}
                  {awaitingIds.has(k.id) && (
                    <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">
                      {t("list.onlyAwaiting")}
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">{locationLabel(k, t)}</span>
                  {workTypeLabel(k, i18n.language) && <span className="text-xs text-muted-foreground">· {workTypeLabel(k, i18n.language)}</span>}
                  {k.durationDays != null && (
                    <span className="text-xs text-muted-foreground">
                      · {t("list.duration")}: <bdi dir="ltr">{k.durationDays}</bdi> {t("list.days")}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {k.lineCount} {t("list.lines")} · {k.tadqiqCount} {t("list.tadqiqCount")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t("list.totalAfterPct")}: </span>
                    <span className="font-mono font-semibold tabular-nums" dir="ltr">{kd(k.totalAfterPct)}</span>
                  </div>
                  <div className="flex min-w-40 flex-1 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className={cn("h-full rounded-full", k.closed ? "bg-success" : "bg-primary")}
                           style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                      {kd(k.executedValue * (1 + k.pct / 100))}
                    </span>
                    <span className="text-xs text-muted-foreground">{t("list.executed")}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
