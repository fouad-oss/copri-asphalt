// دفعات الوزارة — payment-certificates dashboard: certified totals vs
// executed, uncertified balance, per-certificate value bars, and the
// certificates register. "دفعة جديدة" starts the generate flow
// (PayCertNew) that bills the uncertified balances from طلبات التدقيق.
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { kd, fmtKWDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  kashefList, paycertList, type KashefOverview, type PayCertOverview,
} from "./data"

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function sourceBadge(source: PayCertOverview["source"], t: (k: string) => string) {
  return source === "mpw"
    ? <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{t("pc.source.mpw")}</Badge>
    : <Badge variant="outline">{t("pc.source.site")}</Badge>
}

export function statusBadge(status: PayCertOverview["status"], t: (k: string) => string) {
  const cls = status === "certified" ? "bg-success/10 text-success hover:bg-success/10"
    : status === "submitted" ? "bg-warning-surface text-warning hover:bg-warning-surface"
    : "bg-secondary text-muted-foreground hover:bg-secondary"
  return <Badge className={cls}>{t(`pc.status.${status}`)}</Badge>
}

export function PayCerts() {
  const { t } = useTranslation("quantities")
  const [data, setData] = useState<{ certs: PayCertOverview[]; wos: KashefOverview[] } | undefined>()
  const [error, setError] = useState(false)

  async function load() {
    setError(false)
    setData(undefined)
    try {
      const [certs, wos] = await Promise.all([paycertList(), kashefList()])
      setData({ certs, wos })
    } catch {
      setError(true)
    }
  }
  useEffect(() => { void load() }, [])

  const view = useMemo(() => {
    if (!data) return null
    const { certs, wos } = data
    const pct = wos[0]?.pct ?? certs[0]?.pct ?? 9
    const mult = 1 + pct / 100
    const certifiedAfter = certs.reduce((s, c) => s + c.totalAfterPct, 0)
    const executedAfter = wos.reduce((s, k) => s + k.executedValue * mult, 0)
    const uncertified = Math.max(0, executedAfter - certifiedAfter)
    const last = certs[0] ?? null   // list is cert_no desc
    const maxCert = Math.max(0, ...certs.map((c) => c.totalAfterPct))
    return { certs, pct, certifiedAfter, executedAfter, uncertified, last, maxCert }
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

  const certsAsc = [...view.certs].sort((a, b) => a.certNo - b.certNo)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t("pc.title")}</h1>
        <Button asChild size="sm" className="ms-auto">
          <Link to="/quantities/paycerts/new">{t("pc.newCert")}</Link>
        </Button>
      </div>

      {/* ── Tiles ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("pc.certifiedTotal")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">{kd(view.certifiedAfter)}</div>
          <div className="mt-2 flex items-center gap-2">
            <Bar value={view.certifiedAfter} max={view.executedAfter} />
            <span className="font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
              {view.executedAfter > 0 ? ((view.certifiedAfter / view.executedAfter) * 100).toFixed(1) : "0"}%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t("pc.ofExecuted")} (<bdi dir="ltr" className="font-mono">{kd(view.executedAfter)}</bdi>)</div>
        </div>

        <div className={cn("rounded-lg border p-3", view.uncertified > 0.5 ? "border-warning/40 bg-warning-surface" : "bg-card")}>
          <div className="text-xs text-muted-foreground">{t("pc.uncertified")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">{kd(view.uncertified)}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">{t("pc.uncertifiedHint")}</div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("pc.certCount")}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums" dir="ltr">{view.certs.length}</div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{t("pc.lastCert")}</div>
          {view.last ? (
            <>
              <div className="mt-1 text-sm font-semibold">
                {t("pc.certNo")} <RefCode>{String(view.last.certNo)}</RefCode>
              </div>
              <div className="mt-1 font-mono text-sm tabular-nums" dir="ltr">{kd(view.last.totalAfterPct)}</div>
              {view.last.periodEnd && (
                <div className="mt-1 text-[11px] text-muted-foreground" dir="ltr">{fmtKWDate(view.last.periodEnd)}</div>
              )}
            </>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">—</div>
          )}
        </div>
      </div>

      {/* ── Per-cert bars ── */}
      {certsAsc.length > 0 && (
        <section className="rounded-lg border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">{t("pc.perCert")}</h2>
          <div className="space-y-2">
            {certsAsc.map((c) => (
              <Link key={c.id} to={`/quantities/paycerts/${c.id}`} className="flex items-center gap-3 text-sm hover:opacity-80">
                <span className="w-10"><RefCode>{String(c.certNo)}</RefCode></span>
                <span className="w-20 font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                  {c.periodEnd ? c.periodEnd.slice(0, 7) : "—"}
                </span>
                <Bar value={c.totalAfterPct} max={view.maxCert} />
                <span className="w-28 text-end font-mono text-xs tabular-nums" dir="ltr">{kd(c.totalAfterPct)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Register ── */}
      {view.certs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("pc.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {view.certs.map((c) => (
            <Link key={c.id} to={`/quantities/paycerts/${c.id}`}
              className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {t("pc.certNo")} <RefCode>{String(c.certNo)}</RefCode>
                </span>
                {sourceBadge(c.source, t)}
                {statusBadge(c.status, t)}
                {c.periodEnd && (
                  <span className="text-xs text-muted-foreground">
                    {t("pc.periodEnd")} <bdi dir="ltr">{fmtKWDate(c.periodEnd)}</bdi>
                  </span>
                )}
                <span className="ms-auto text-xs text-muted-foreground">
                  {c.woCount} {t("pc.wos")} · {c.lineCount} {t("pc.lines")}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">{kd(c.totalAfterPct)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
