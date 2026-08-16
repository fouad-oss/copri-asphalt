// مقاولو الباطن — REGISTER pattern: search + sort above a card list, each
// card showing the subcontractor's allocated vs executed with a twin bar and
// the remaining balance. Rows open the subcontractor detail.
//
// qm_sub_totals returns PRE-pct sums like every other view, so the contract
// multiplier is applied here (see the module's standing rule: all money is
// displayed after نسبة العقد).
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
import { kd } from "@/lib/format"
import { contractInfo, subTotals, type SubTotal } from "./data"

type Sort = "executed" | "allocated" | "remaining" | "name" | "activity"

/** Allocated vs executed as two stacked bars on the same scale. */
export function TwinBar({ allocated, executed }: { allocated: number; executed: number }) {
  const max = Math.max(allocated, executed, 1)
  const a = Math.min(100, (allocated / max) * 100)
  const e = Math.min(100, (executed / max) * 100)
  return (
    <div className="space-y-1" aria-hidden>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary/40" style={{ width: `${a}%` }} />
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${e}%` }} />
      </div>
    </div>
  )
}

export function Money({ value }: { value: number }) {
  return <bdi dir="ltr" className="font-mono tabular-nums">{kd(value)}</bdi>
}

export function Subs() {
  const { t } = useTranslation("quantities")
  const [rows, setRows] = useState<SubTotal[] | undefined>()
  const [mult, setMult] = useState(1)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>("executed")

  useEffect(() => {
    let live = true
    Promise.all([subTotals(), contractInfo()])
      .then(([s, c]) => {
        if (!live) return
        setRows(s)
        setMult(1 + c.pct / 100)
      })
      .catch((e) => live && setErr(e?.message || t("app.loadError")))
    return () => { live = false }
  }, [t])

  const filtered = useMemo(() => {
    if (!rows) return []
    // a vendor with neither an allocation nor executed work is flagged for
    // this module but has nothing on THIS project — don't list it
    let out = rows.filter((r) => r.allocatedValue !== 0 || r.executedValue !== 0)
    const needle = q.trim().toLowerCase()
    if (needle) out = out.filter((r) => r.vendorName.toLowerCase().includes(needle))
    return [...out].sort((a, b) => {
      switch (sort) {
        case "name": return a.vendorName.localeCompare(b.vendorName, "ar")
        case "allocated": return b.allocatedValue - a.allocatedValue
        case "remaining":
          return (b.allocatedValue - b.executedValue) - (a.allocatedValue - a.executedValue)
        case "activity":
          return (b.lastTadqiqDate ?? "").localeCompare(a.lastTadqiqDate ?? "")
        default: return b.executedValue - a.executedValue
      }
    })
  }, [rows, q, sort])

  const totals = useMemo(() => ({
    allocated: filtered.reduce((s, r) => s + r.allocatedValue * mult, 0),
    executed: filtered.reduce((s, r) => s + r.executedValue * mult, 0),
  }), [filtered, mult])

  if (err) {
    return <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm text-danger">{err}</div>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={t("subs.search")} className="h-8 w-56 text-sm" />
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="executed">{t("subs.sortExecuted")}</SelectItem>
              <SelectItem value="allocated">{t("subs.sortAllocated")}</SelectItem>
              <SelectItem value="remaining">{t("subs.sortRemaining")}</SelectItem>
              <SelectItem value="activity">{t("subs.sortActivity")}</SelectItem>
              <SelectItem value="name">{t("subs.sortName")}</SelectItem>
            </SelectContent>
          </Select>
          {q && <Button size="sm" variant="ghost" onClick={() => setQ("")}>{t("list.clear")}</Button>}
        </div>
        {rows && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
            <span>{t("subs.showing", { n: filtered.length })}</span>
            <span>{t("subs.sumAllocated")}: <Money value={totals.allocated} /></span>
            <span>{t("subs.sumExecuted")}: <Money value={totals.executed} /></span>
          </div>
        )}
      </div>

      {rows === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? t("subs.empty") : t("subs.noMatch")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const allocated = r.allocatedValue * mult
            const executed = r.executedValue * mult
            const remaining = allocated - executed
            return (
              <Link key={r.vendorId} to={`/quantities/subs/${r.vendorId}`}
                    className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{r.vendorName}</span>
                  <Badge variant="outline">
                    {t("subs.woCount", { n: r.allocatedWos })}
                  </Badge>
                  {r.tadqiqCount > 0 && (
                    <Badge variant="secondary">
                      {t("subs.tadqiqCount", { n: r.tadqiqCount })}
                    </Badge>
                  )}
                  {r.executedValue === 0 && r.allocatedValue !== 0 && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {t("subs.noExecuted")}
                    </Badge>
                  )}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {r.lastTadqiqDate
                      ? <>{t("subs.lastActivity")} <bdi dir="ltr">{r.lastTadqiqDate}</bdi></>
                      : t("subs.neverActive")}
                  </span>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <TwinBar allocated={allocated} executed={executed} />
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span className="text-muted-foreground">
                      {t("subs.allocated")}: <Money value={allocated} />
                    </span>
                    <span className="text-muted-foreground">
                      {t("subs.executed")}: <Money value={executed} />
                    </span>
                    <span className="font-medium">
                      {t("subs.remaining")}: <Money value={remaining} />
                    </span>
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
