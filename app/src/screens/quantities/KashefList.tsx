// الكشوفات وأوامر العمل — list with status chip, loc-type badge, line
// count, total after نسبة العقد and an executed-value progress bar.
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { kd } from "@/lib/format"
import { kashefList, type KashefOverview } from "./data"

export function locationLabel(k: KashefOverview, t: (k: string) => string): string {
  if (k.locType === "block") return `${k.area} — ${t("loc.block")} (${k.blockNo})`
  if (k.locType === "street") return `${k.area} — ${k.streetName}`
  return `${k.area} — ${t("loc.misc")}`
}

export function WoBadge({ k }: { k: KashefOverview }) {
  const { t } = useTranslation("quantities")
  return (
    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
      {t("status.wo")} <RefCode className="ms-1">{k.woNo || String(k.kashefNo)}</RefCode>
    </Badge>
  )
}

export function KashefList() {
  const { t } = useTranslation("quantities")
  const [rows, setRows] = useState<KashefOverview[] | undefined>(undefined)
  const [error, setError] = useState(false)
  const [q, setQ] = useState("")

  async function load() {
    setError(false)
    setRows(undefined)
    try {
      setRows(await kashefList())
    } catch {
      setError(true)
    }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim()
    return rows.filter((k) => {
      if (!needle) return true
      const hay = `${k.kashefNo} ${k.area} ${k.blockNo} ${k.streetName} ${k.workType} ${k.woNo}`
      return hay.includes(needle)
    })
  }, [rows, q])

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
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-sm" placeholder={t("list.search")} value={q}
               onChange={(e) => setQ(e.target.value)} />
        <Button asChild size="sm" className="ms-auto">
          <Link to="/quantities/new">{t("nav.newKashef")}</Link>
        </Button>
      </div>

      {rows === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("list.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((k) => {
            const progress = k.subtotal > 0 ? Math.min(100, (k.executedValue / k.subtotal) * 100) : 0
            return (
              <Link key={k.id} to={`/quantities/kashef/${k.id}`}
                className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {t("list.kashefNo")} <RefCode>{k.woNo || String(k.kashefNo)}</RefCode>
                  </span>
                  <Badge variant="outline">{t(`loc.${k.locType}`)}</Badge>
                  {k.closed && <Badge variant="secondary">{t("status.closed")}</Badge>}
                  <span className="text-sm text-muted-foreground">{locationLabel(k, t)}</span>
                  {k.workType && <span className="text-xs text-muted-foreground">· {k.workType}</span>}
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
                      <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                      {kd(k.executedValue)}
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
