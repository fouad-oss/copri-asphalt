// الرئيسية — quantities home dashboard (DASHBOARD pattern): leads with
// the WOs waiting on the QA (delayed / nearing end / recorded warnings),
// then executed-vs-project progress, area & work-type breakdowns, the
// per-sub table and the monthly tadqiq activity bars. All KD values are
// shown AFTER نسبة العقد (Fouad's decision, 2026-08-14); the overview
// views return pre-pct sums, so the contract multiplier is applied here.
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { TriangleAlert, CircleCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { kd, fmtKWDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  kashefList, subTotals, monthlyExec, woFlags, contractProgress, woCertification,
  type KashefOverview, type SubTotal, type MonthlyExec, type WoFlags,
  type ContractProgress, type WoCertification,
} from "./data"
import { locationLabel } from "./KashefList"
import { categoryLabel, primaryCategory } from "./scopes"

const NEARING_DAYS = 20
const ACTIVE_DAYS = 60
const TREND_FROM = "2026-08-01" // opening balances collapse history before this

interface Data {
  wos: KashefOverview[]
  subs: SubTotal[]
  monthly: MonthlyExec[]
  flags: WoFlags[]
  progress: ContractProgress | null
  certStanding: WoCertification[]
}

function dayDiff(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(fromIso + "T00:00:00").getTime()) / 86400000)
}

function endDateOf(k: KashefOverview): string | null {
  if (!k.woDate || k.durationDays == null) return null
  const d = new Date(k.woDate + "T00:00:00")
  d.setDate(d.getDate() + k.durationDays)
  return d.toISOString().slice(0, 10)
}

function Bar({ value, max, warn }: { value: number; max: number; warn?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full", warn ? "bg-warning" : "bg-primary")}
           style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Dashboard() {
  const { t, i18n } = useTranslation("quantities")
  const [data, setData] = useState<Data | undefined>(undefined)
  const [error, setError] = useState(false)

  async function load() {
    setError(false)
    setData(undefined)
    try {
      // The last two come from later migrations; if they are not applied
      // yet the rest of the dashboard should still render.
      const [wos, subs, monthly, flags, progress, certStanding] = await Promise.all([
        kashefList(), subTotals(), monthlyExec(), woFlags(),
        contractProgress().catch(() => null),
        woCertification().catch(() => [] as WoCertification[]),
      ])
      setData({ wos, subs, monthly, flags, progress, certStanding })
    } catch {
      setError(true)
    }
  }
  useEffect(() => { void load() }, [])

  const view = useMemo(() => {
    if (!data) return null
    const { wos, subs, monthly, flags, progress, certStanding } = data
    const pct = wos[0]?.pct ?? 9
    const mult = 1 + pct / 100
    const today = new Date()

    // The ministry's tracking report measures نسبة الإنجاز المالي against
    // contract + change orders; fall back to the contract row if 0042 is
    // not pasted yet.
    const projectAfter = progress?.totalValue || (wos[0]?.contractValue ?? 0) * mult
    const executedAfter = wos.reduce((s, k) => s + k.executedValue * mult, 0)
    const woValueAfter = wos.reduce((s, k) => s + k.totalAfterPct, 0)
    const openWos = wos.filter((k) => !k.closed)
    const closedCount = wos.length - openWos.length

    const withEnd = openWos
      .map((k) => ({ k, end: endDateOf(k) }))
      .filter((x): x is { k: KashefOverview; end: string } => x.end !== null)
    const delayed = withEnd
      .filter((x) => dayDiff(x.end, today) > 0)
      .sort((a, b) => dayDiff(b.end, today) - dayDiff(a.end, today))
    const nearing = withEnd
      .filter((x) => dayDiff(x.end, today) <= 0 && dayDiff(x.end, today) >= -NEARING_DAYS)
      .sort((a, b) => dayDiff(b.end, today) - dayDiff(a.end, today))

    const flagMap = new Map(flags.map((f) => [f.kashefId, f]))
    const flagged = openWos
      .map((k) => ({ k, f: flagMap.get(k.id) }))
      .filter((x): x is { k: KashefOverview; f: WoFlags } =>
        !!x.f && (x.f.overAllocLines > 0 || x.f.execOverAllocLines > 0 || x.f.outOfWoLines > 0))
    const attention = new Set<number>([
      ...delayed.map((x) => x.k.id), ...nearing.map((x) => x.k.id), ...flagged.map((x) => x.k.id),
    ])

    // Finished work still waiting to be billed: closed WOs whose executed
    // value exceeds what the ministry has certified so far.
    const woById = new Map(wos.map((k) => [k.id, k]))
    const awaitingCert = certStanding
      .filter((c) => c.closed && c.uncertifiedValue * mult > 0.5 && woById.has(c.kashefId))
      .map((c) => ({ c, k: woById.get(c.kashefId)! }))
      .sort((a, b) => b.c.uncertifiedValue - a.c.uncertifiedValue)
    const awaitingTotal = awaitingCert.reduce((s, x) => s + x.c.uncertifiedValue * mult, 0)

    const subsOpen = subs.filter((s) => s.allocatedValue - s.executedValue > 0.0005)
    const subsActive = subs.filter(
      (s) => s.lastTadqiqDate && dayDiff(s.lastTadqiqDate, today) <= ACTIVE_DAYS)
    const subRows = subs
      .filter((s) => s.allocatedValue > 0 || s.executedValue > 0)
      .sort((a, b) => b.executedValue - a.executedValue)

    function breakdown(key: (k: KashefOverview) => string) {
      const m = new Map<string, { n: number; total: number; exec: number }>()
      for (const k of wos) {
        const g = key(k) || "—"
        const row = m.get(g) ?? { n: 0, total: 0, exec: 0 }
        row.n += 1; row.total += k.totalAfterPct; row.exec += k.executedValue * mult
        m.set(g, row)
      }
      return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
    }

    const trend = monthly
      .filter((m) => !m.opening && m.month >= TREND_FROM)
      .map((m) => ({ ...m, after: m.execValue * mult }))
    const trendMax = Math.max(0, ...trend.map((m) => m.after))

    return {
      pct, mult, projectAfter, executedAfter, woValueAfter,
      openCount: openWos.length, closedCount, total: wos.length,
      delayed, nearing, flagged, attention,
      subsOpen, subsActive, subRows,
      byArea: breakdown((k) => k.area),
      // one bucket per WO — its primary scope category (first in taxonomy order)
      byType: breakdown((k) => { const c = primaryCategory(k); return c ? categoryLabel(c, i18n.language) : "" }),
      trend, trendMax, today, progress, awaitingCert, awaitingTotal,
    }
  }, [data, i18n.language])

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
  if (!view) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  const progressPct = view.projectAfter > 0 ? (view.executedAfter / view.projectAfter) * 100 : 0

  function WoRow({ k, trail }: { k: KashefOverview; trail: React.ReactNode }) {
    return (
      <Link to={`/quantities/kashef/${k.id}`}
        className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40">
        <RefCode>{k.woNo || String(k.kashefNo)}</RefCode>
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={locationLabel(k, t)}>{locationLabel(k, t)}</span>
        {k.workType && <span className="hidden text-xs text-muted-foreground sm:inline">· {k.workType}</span>}
        <span className="ms-auto flex items-center gap-2">{trail}</span>
      </Link>
    )
  }

  const prog = view.progress
  const timePct = prog?.timePct != null ? prog.timePct * 100 : null

  return (
    <div className="space-y-4">
      {/* ── Contract strip — mirrors the ministry tracking report header ── */}
      {prog && (
        <div className="rounded-lg border bg-card p-3">
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">{t("dash.contractValue")}</div>
              <div className="font-mono text-sm font-semibold tabular-nums" dir="ltr">{kd(prog.totalValue)}</div>
              {prog.changeOrdersValue > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {t("dash.changeOrders")}: <bdi dir="ltr" className="font-mono">{kd(prog.changeOrdersValue)}</bdi>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("dash.finPct")}</div>
              <div className="flex items-center gap-2">
                <Bar value={view.executedAfter} max={prog.totalValue} />
                <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">
                  {progressPct.toFixed(2)}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("dash.timePct")}</div>
              <div className="flex items-center gap-2">
                <Bar value={prog.elapsedDays} max={prog.durationDays ?? 0}
                     warn={timePct != null && timePct > progressPct} />
                <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">
                  {timePct != null ? `${timePct.toFixed(2)}%` : "—"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                <bdi dir="ltr">{prog.elapsedDays.toLocaleString("en-US")}</bdi> /{" "}
                <bdi dir="ltr">{(prog.durationDays ?? 0).toLocaleString("en-US")}</bdi> {t("dash.day")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("dash.woCounts")}</div>
              <div className="text-sm">
                <bdi dir="ltr" className="font-mono font-semibold">{prog.woCount}</bdi> {t("dash.issued")}
                {" · "}
                <bdi dir="ltr" className="font-mono">{prog.woClosed}</bdi> {t("dash.closedWos")}
                {" · "}
                <bdi dir="ltr" className="font-mono">{prog.woOpen}</bdi> {t("dash.openWos")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Metric strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("dash.executedOfProject")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">{kd(view.executedAfter)}</div>
          <div className="mt-2 flex items-center gap-2">
            <Bar value={view.executedAfter} max={view.projectAfter} />
            <span className="font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
              {progressPct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t("dash.projectValue")}: <bdi dir="ltr" className="font-mono">{kd(view.projectAfter)}</bdi>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("dash.woValue")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">{kd(view.woValueAfter)}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            <bdi dir="ltr">{view.openCount}</bdi> {t("dash.openWos")} · <bdi dir="ltr">{view.closedCount}</bdi> {t("dash.closedWos")}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t("dash.afterPctNote")} (<bdi dir="ltr">+{view.pct.toFixed(2)}%</bdi>)</div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("dash.activeSubs")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">{view.subsOpen.length}</div>
          <div className="mt-2 text-xs text-muted-foreground">{t("dash.withOpenBalance")}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            <bdi dir="ltr">{view.subsActive.length}</bdi> {t("dash.activeRecent", { days: ACTIVE_DAYS })}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("dash.awaitingCert")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">
            {kd(view.awaitingTotal)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <bdi dir="ltr">{view.awaitingCert.length}</bdi> {t("dash.awaitingCertWos")}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t("dash.awaitingCertHint")}</div>
        </div>

        <div className={cn("rounded-lg border p-3",
          view.attention.size > 0 ? "border-warning/40 bg-warning-surface" : "bg-card")}>
          <div className="text-xs text-muted-foreground">{t("dash.needsAttention")}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-lg font-semibold tabular-nums" dir="ltr">{view.attention.size}</span>
            {view.attention.size > 0
              ? <TriangleAlert className="size-4 text-warning" />
              : <CircleCheck className="size-4 text-success" />}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{t("dash.ofWos", { n: view.total })}</div>
        </div>
      </div>

      {/* ── Problem lists ── */}
      {view.attention.size === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("dash.allClear")}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {view.delayed.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">
                {t("dash.delayed")} <span className="font-normal text-muted-foreground">· {t("dash.delayedHint")}</span>
              </h2>
              {view.delayed.map(({ k, end }) => (
                <WoRow key={k.id} k={k} trail={
                  <>
                    <span className="text-xs text-muted-foreground" dir="ltr">{fmtKWDate(end)}</span>
                    <Badge className="bg-danger-surface text-danger hover:bg-danger-surface">
                      {t("dash.overdueBy", { days: dayDiff(end, view.today) })}
                    </Badge>
                  </>
                } />
              ))}
            </section>
          )}
          {view.nearing.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">
                {t("dash.nearingEnd")} <span className="font-normal text-muted-foreground">· {t("dash.nearingHint", { days: NEARING_DAYS })}</span>
              </h2>
              {view.nearing.map(({ k, end }) => (
                <WoRow key={k.id} k={k} trail={
                  <>
                    <span className="text-xs text-muted-foreground" dir="ltr">{fmtKWDate(end)}</span>
                    <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">
                      {t("dash.daysLeft", { days: -dayDiff(end, view.today) })}
                    </Badge>
                  </>
                } />
              ))}
            </section>
          )}
          {view.flagged.length > 0 && (
            <section className="space-y-2 lg:col-span-2">
              <h2 className="text-sm font-semibold">{t("dash.warnings")}</h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {view.flagged.map(({ k, f }) => (
                  <WoRow key={k.id} k={k} trail={
                    <span className="flex flex-wrap items-center gap-1">
                      {f.overAllocLines > 0 && (
                        <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">
                          <bdi dir="ltr">{f.overAllocLines}</bdi>&nbsp;{t("dash.warnOverAlloc")}
                        </Badge>
                      )}
                      {f.execOverAllocLines > 0 && (
                        <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">
                          <bdi dir="ltr">{f.execOverAllocLines}</bdi>&nbsp;{t("dash.warnExecOver")}
                        </Badge>
                      )}
                      {f.outOfWoLines > 0 && (
                        <Badge className="bg-warning-surface text-warning hover:bg-warning-surface">
                          <bdi dir="ltr">{f.outOfWoLines}</bdi>&nbsp;{t("dash.warnOutOfWo")}
                        </Badge>
                      )}
                    </span>
                  } />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Finished, awaiting certification ── */}
      {view.awaitingCert.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            {t("dash.awaitingCert")}{" "}
            <span className="font-normal text-muted-foreground">· {t("dash.awaitingCertHint")}</span>
          </h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {view.awaitingCert.slice(0, 12).map(({ c, k }) => (
              <Link key={c.kashefId} to={`/quantities/kashef/${c.kashefId}`}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40">
                <RefCode>{k.woNo || String(k.kashefNo)}</RefCode>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={locationLabel(k, t)}>{locationLabel(k, t)}</span>
                <span className="ms-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {c.lastCertNo != null
                      ? <>{t("dash.lastCert")} <bdi dir="ltr">{c.lastCertNo}</bdi></>
                      : t("dash.neverCertified")}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">
                    {kd(c.uncertifiedValue * view.mult)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {view.awaitingCert.length > 12 && (
            <div className="text-xs text-muted-foreground">
              {t("dash.andMore", { n: view.awaitingCert.length - 12 })}
            </div>
          )}
          <div>
            <Button asChild variant="outline" size="sm">
              <Link to="/quantities/paycerts/new">{t("pc.newCert")}</Link>
            </Button>
          </div>
        </section>
      )}

      {/* ── Breakdowns ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {([["dash.byArea", view.byArea], ["dash.byWorkType", view.byType]] as const).map(([title, rows]) => (
          <section key={title} className="rounded-lg border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">{t(title)}</h2>
            <div className="space-y-2">
              {rows.map(([name, r]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <span className="w-28 truncate">{name}</span>
                  <span className="w-10 text-xs text-muted-foreground" dir="ltr">{r.n} {t("dash.wosCol")}</span>
                  <Bar value={r.exec} max={r.total} />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                    {kd(r.exec)} / {kd(r.total)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Subcontractors ── */}
      <section className="overflow-x-auto rounded-lg border bg-card">
        <h2 className="border-b px-3 py-2 text-sm font-semibold">{t("dash.subs")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start font-normal">{t("dash.subCol")}</th>
              <th className="px-3 py-2 text-center font-normal">{t("dash.subWos")}</th>
              <th className="px-3 py-2 text-end font-normal">{t("dash.allocatedCol")}</th>
              <th className="px-3 py-2 text-end font-normal">{t("dash.executedCol")}</th>
              <th className="px-3 py-2 text-end font-normal">{t("dash.remainingCol")}</th>
              <th className="px-3 py-2 text-end font-normal">{t("dash.lastActivity")}</th>
            </tr>
          </thead>
          <tbody>
            {view.subRows.map((s) => {
              const remaining = (s.allocatedValue - s.executedValue) * view.mult
              const active = s.lastTadqiqDate && dayDiff(s.lastTadqiqDate, view.today) <= ACTIVE_DAYS
              return (
                <tr key={s.vendorId} className="border-t">
                  <td className="px-3 py-1.5">
                    {s.vendorName}
                    {active && (
                      <Badge className="ms-2 bg-success/10 text-success hover:bg-success/10">
                        {t("dash.activeChip")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono tabular-nums" dir="ltr">{s.allocatedWos}</td>
                  <td className="px-3 py-1.5 text-end font-mono tabular-nums" dir="ltr">{kd(s.allocatedValue * view.mult)}</td>
                  <td className="px-3 py-1.5 text-end font-mono tabular-nums" dir="ltr">{kd(s.executedValue * view.mult)}</td>
                  <td className={cn("px-3 py-1.5 text-end font-mono tabular-nums", remaining < 0 && "font-semibold text-warning")} dir="ltr">
                    {kd(remaining)}
                  </td>
                  <td className="px-3 py-1.5 text-end text-xs text-muted-foreground" dir="ltr">
                    {s.lastTadqiqDate ? fmtKWDate(s.lastTadqiqDate) : t("dash.noActivity")}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* ── Monthly activity ── */}
      <section className="rounded-lg border bg-card p-3">
        <h2 className="text-sm font-semibold">
          {t("dash.trend")} <span className="font-normal text-muted-foreground">· {t("dash.trendHint")}</span>
        </h2>
        {view.trend.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("dash.trendEmpty")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {view.trend.map((m) => (
              <div key={m.month} className="flex items-center gap-3 text-sm">
                <span className="w-16 font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                  {m.month.slice(0, 7)}
                </span>
                <Bar value={m.after} max={view.trendMax} />
                <span className="w-28 text-end font-mono text-xs tabular-nums" dir="ltr">{kd(m.after)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="text-center">
        <Button asChild variant="outline" size="sm">
          <Link to="/quantities/list">{t("dash.viewAll")}</Link>
        </Button>
      </div>
    </div>
  )
}
