import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { RefCode, ErrorBox } from "@/components/patterns"
import { fmtKW } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  aggDays, currentDay, fetchDayLoads, fmtKWTime, isSingleDay, numFmt, todayStr,
  type AggItem, type DashPayload, type DashRange, type DayLoad, type DispatchRow, type RangeMode,
} from "./lib"

/* ── Shared board UI: numbers and bars beat charts (skill DASHBOARD rule).
   All aggregations render as thin-bar lists, never chart-library charts. ── */

const RANGE_KEYS: RangeMode[] = ["today", "day", "range", "all"]

export function RangeTabs({ range, onChange }: { range: DashRange; onChange: (p: Partial<DashRange>) => void }) {
  const { t } = useTranslation("boards")
  const today = todayStr()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {RANGE_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => onChange({ mode: k })}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              range.mode === k ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
            )}>
            {t(`ranges.${k}`)}
          </button>
        ))}
      </div>
      {range.mode === "day" && (
        <Input type="date" value={range.day} max={today} className="w-fit"
          onChange={(e) => e.target.value && onChange({ day: e.target.value })} />
      )}
      {range.mode === "range" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("ranges.from")}</span>
          <Input type="date" value={range.from} max={today} className="w-fit"
            onChange={(e) => e.target.value && onChange({ from: e.target.value })} />
          <span>{t("ranges.to")}</span>
          <Input type="date" value={range.to} max={today} className="w-fit"
            onChange={(e) => e.target.value && onChange({ to: e.target.value })} />
        </div>
      )}
    </div>
  )
}

export function BoardHead({ title, range, onChange, embedded }: {
  title: string; range: DashRange; onChange: (p: Partial<DashRange>) => void; embedded?: boolean
}) {
  const { t } = useTranslation("boards")
  return (
    <div className="flex flex-col gap-2">
      {!embedded && (
        <Link to="/boards/home" className="w-fit rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary/60">
          {t("back")}
        </Link>
      )}
      <h2 className="text-base font-semibold">{title}</h2>
      <RangeTabs range={range} onChange={onChange} />
    </div>
  )
}

/* KPI tiles — MetricStrip look, plus sub-line and optional drill-down click. */
export type Kpi = { label: string; value: ReactNode; sub?: string; onClick?: () => void }

export function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((k, i) => {
        const inner = (
          <>
            <div className="text-lg font-semibold tabular-nums">{k.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{k.label}</div>
            {k.sub ? <div className="text-[11px] text-muted-foreground/80">{k.sub}</div> : null}
          </>
        )
        return k.onClick ? (
          <button key={i} type="button" onClick={k.onClick}
            className="rounded-lg border bg-card p-3 text-start hover:bg-secondary/40">
            {inner}
          </button>
        ) : (
          <div key={i} className="rounded-lg border bg-card p-3">{inner}</div>
        )
      })}
    </div>
  )
}

export function BoardCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-2 px-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {children}
      </CardContent>
    </Card>
  )
}

/* Horizontal thin-bar list — the workhorse of every board (legacy _dashBars). */
export function BarList({ items, fmt, tone = "info" }: {
  items: AggItem[]; fmt?: (n: number) => string; tone?: "info" | "success" | "warning" | "danger"
}) {
  const max = Math.max(...items.map((x) => x.value), 1)
  const fill = { info: "bg-info", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone]
  if (!items.length) return <div className="text-sm text-muted-foreground">—</div>
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((x) => (
        <div key={x.name} className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{x.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{fmt ? fmt(x.value) : numFmt(x.value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.max(2, Math.round((x.value / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* Receipt-status split (accepted / pending / rejected) with legend. */
export function StatusSplit({ rows }: { rows: DispatchRow[] }) {
  const { t } = useTranslation("boards")
  const acc = rows.filter((r) => r.st === 1).length
  const rej = rows.filter((r) => r.st === 2).length
  const pend = rows.length - acc - rej
  const items = [
    { name: t("st.accepted"), value: acc, cls: "bg-success" },
    { name: t("st.pending"), value: pend, cls: "bg-warning" },
    { name: t("st.rejected"), value: rej, cls: "bg-danger" },
  ]
  const max = Math.max(acc, pend, rej, 1)
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((x) => (
        <div key={x.name} className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{x.name}</span>
            <span className="tabular-nums text-muted-foreground">{numFmt(x.value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full", x.cls)} style={{ width: `${Math.max(2, Math.round((x.value / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* Daily series as a scrollable bar list — replaces the legacy SVG trend. */
export function TrendBars({ rows, valFn, fmt }: {
  rows: DispatchRow[]; valFn: (r: DispatchRow) => number; fmt?: (n: number) => string
}) {
  const days = aggDays(rows, valFn)
  if (!days.length) return <div className="text-sm text-muted-foreground">—</div>
  const max = Math.max(...days.map((d) => d.tons), 1)
  return (
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pe-1">
      {days.map((d) => (
        <div key={d.date} className="flex items-center gap-2 text-sm">
          <RefCode className="w-20 shrink-0 text-xs text-muted-foreground">{d.date.slice(5)}</RefCode>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(2, Math.round((d.tons / max) * 100))}%` }} />
          </div>
          <span className="w-16 shrink-0 text-end tabular-nums text-muted-foreground">{fmt ? fmt(d.tons) : numFmt(d.tons)}</span>
        </div>
      ))}
    </div>
  )
}

/* Trip-by-trip drill-down (single-day views): expandable card fetched
   straight from dispatch_loads — the slim payload has no notes/times. */
const TRIP_TONE: Record<string, string> = {
  "مرفوض": "bg-danger-surface text-danger",
  "مقبول": "bg-success/10 text-success",
}

export function TripsPanel({ range }: { range: DashRange }) {
  const { t } = useTranslation("boards")
  const day = currentDay(range)
  const [loads, setLoads] = useState<DayLoad[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    setLoads(null); setErr(false)
    fetchDayLoads(day).then((l) => { if (live) setLoads(l) }).catch(() => { if (live) setErr(true) })
    return () => { live = false }
  }, [day])
  return (
    <BoardCard title={t("trips.title", { day })}>
      {err ? <ErrorBox message={t("trips.error")} /> :
        !loads ? <div className="text-sm text-muted-foreground">{t("loading")}</div> :
        !loads.length ? <div className="text-sm text-muted-foreground">{t("trips.none")}</div> : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pe-1">
            {loads.map((d) => (
              <div key={d.note} className="border-b pb-2 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RefCode>{d.note}</RefCode>
                  <RefCode className="text-xs text-muted-foreground">{fmtKWTime(d.ts)}</RefCode>
                  {d.status ? (
                    <Badge variant="secondary" className={cn("font-normal", TRIP_TONE[d.status] || "bg-secondary text-muted-foreground")}>
                      {t(`chip.${d.status}`, { defaultValue: d.status })}
                    </Badge>
                  ) : null}
                  <span className="ms-auto tabular-nums">{d.weight == null ? "—" : d.weight} {t("trips.tons")}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {d.company} — {d.project} · {d.site}{d.block ? ` ق${d.block}` : ""}{d.street ? ` ش${d.street}` : ""} · {d.mix}{d.plant ? ` · ${d.plant}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
    </BoardCard>
  )
}

export function BoardFooter({ data }: { data: DashPayload }) {
  const { t } = useTranslation("boards")
  let when = ""
  try { when = fmtKW(data.generatedAt) } catch { /* decorative */ }
  return when ? <div className="text-center text-xs text-muted-foreground">{t("updated", { when })}</div> : null
}

/* Status chip for programs / recipient requests (Arabic DB literals). */
const CHIP_TONE: Record<string, string> = {
  "مخطط": "bg-success/10 text-success",
  "منفذ": "bg-secondary text-muted-foreground",
  "ملغي": "bg-danger-surface text-danger",
  "قيد المراجعة": "bg-warning-surface text-warning",
  "موافَق عليه": "bg-success/10 text-success",
  "مرفوض": "bg-danger-surface text-danger",
}

export function Chip({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation("boards")
  return (
    <Badge variant="secondary" className={cn("font-normal", (status && CHIP_TONE[status]) || "bg-secondary text-muted-foreground")}>
      {status ? t(`chip.${status}`, { defaultValue: status }) : "—"}
    </Badge>
  )
}

/* Recipient-request card — shared by the plant desk (read-only) and the
   finance desk (which slots decision controls into `children`). */
export function RequestCard({ r, children }: { r: import("./lib").RecipientRequest; children?: ReactNode }) {
  const { t } = useTranslation("boards")
  const items = Array.isArray(r.items) ? r.items : []
  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{r.client}</span>
          <Chip status={r.status} />
        </div>
        <div className="text-xs text-muted-foreground">
          {r.company}
          {r.contract ? ` · ${t("req.contractLbl", { c: r.contract })}` : ""}
          {r.payment ? ` · ${r.payment}` : ""}
        </div>
        {items.length > 0 && (
          <div className="text-xs">
            {items.map((it, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {t("req.itemLine", { mix: it.mix, qty: it.qty, rate: it.rate })}
              </span>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {t("req.byLine", { by: r.requested_by || "—", when: fmtKW(r.created_at) })}
        </div>
        {r.details && <div className="text-xs text-muted-foreground">{r.details}</div>}
        {r.office_note && (
          <div className="text-xs"><strong>{t("req.officeReply")}</strong> {r.office_note}</div>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

export { isSingleDay }
