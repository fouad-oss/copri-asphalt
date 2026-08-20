// مقاول باطن — DETAIL pattern: header + metric strip, then the work orders
// this subcontractor is on. A row expands to its lines (allocated vs executed
// per BOP item), which is the level the QA reconciles at.
//
// Values from qm_sub_totals / qm_sub_wo_totals are PRE-pct; the contract
// multiplier is applied here. Quantities are never multiplied — only money.
import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RefCode } from "@/components/patterns"
import { kd } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  contractInfo, itemRef, subLinesFor, subTotals, subWoTotals,
  type SubLineStatus, type SubTotal, type SubWoTotal,
} from "./data"
import { Money, TwinBar } from "./Subs"

function Tile({ label, value, tinted }: { label: string; value: string; tinted?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", tinted && "border-primary/40 bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold">
        <bdi dir="ltr" className="font-mono tabular-nums">{value}</bdi>
      </div>
    </div>
  )
}

function Qty({ value }: { value: number }) {
  return (
    <bdi dir="ltr" className="font-mono tabular-nums">
      {value.toLocaleString("en-US", { maximumFractionDigits: 3 })}
    </bdi>
  )
}

function LineTable({ vendorId, kashefId }: { vendorId: number; kashefId: number }) {
  const { t } = useTranslation("quantities")
  const [lines, setLines] = useState<SubLineStatus[] | undefined>()

  useEffect(() => {
    let live = true
    subLinesFor(vendorId, kashefId)
      .then((l) => live && setLines(l))
      .catch(() => live && setLines([]))
    return () => { live = false }
  }, [vendorId, kashefId])

  if (lines === undefined) return <Skeleton className="h-16 w-full rounded" />
  if (lines.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">{t("subs.noLines")}</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th className="p-2 text-start font-normal">{t("detail.col.ref")}</th>
            <th className="p-2 text-start font-normal">{t("detail.col.unit")}</th>
            <th className="p-2 text-end font-normal">{t("subs.allocatedQty")}</th>
            <th className="p-2 text-end font-normal">{t("subs.executedQty")}</th>
            <th className="p-2 text-end font-normal">{t("subs.remainingQty")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const rem = l.allocated - l.executed
            return (
              <tr key={l.kashefLineId} className="border-b last:border-0">
                <td className="max-w-md p-2">
                  <RefCode>{itemRef(l)}</RefCode>
                  <span className="ms-2 text-muted-foreground">{l.description}</span>
                </td>
                <td className="p-2">{l.unit}</td>
                <td className="p-2 text-end"><Qty value={l.allocated} /></td>
                <td className="p-2 text-end"><Qty value={l.executed} /></td>
                <td className={cn("p-2 text-end", rem < 0 && "text-danger")}>
                  <Qty value={rem} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function SubDetail() {
  const { t } = useTranslation("quantities")
  const { vendorId } = useParams()
  const id = Number(vendorId)
  const [sub, setSub] = useState<SubTotal | null | undefined>()
  const [wos, setWos] = useState<SubWoTotal[] | undefined>()
  const [mult, setMult] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([subTotals(), subWoTotals(id), contractInfo()])
      .then(([all, w, c]) => {
        if (!live) return
        setSub(all.find((s) => s.vendorId === id) ?? null)
        setWos(w)
        setMult(1 + c.pct / 100)
      })
      .catch((e) => live && setErr(e?.message || t("app.loadError")))
    return () => { live = false }
  }, [id, t])

  const totals = useMemo(() => {
    const allocated = (sub?.allocatedValue ?? 0) * mult
    const executed = (sub?.executedValue ?? 0) * mult
    return { allocated, executed, remaining: allocated - executed }
  }, [sub, mult])

  if (err) {
    return <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm text-danger">{err}</div>
  }
  if (sub === undefined || wos === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }
  if (sub === null) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("subs.notFound")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/quantities/subs">← {t("subs.back")}</Link>
        </Button>
        <h2 className="text-lg font-semibold">{sub.vendorName}</h2>
        <Badge variant="outline">{t("subs.woCount", { n: wos.length })}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Tile label={t("subs.allocated")} value={kd(totals.allocated)} />
        <Tile label={t("subs.executed")} value={kd(totals.executed)} />
        <Tile label={t("subs.remaining")} value={kd(totals.remaining)} tinted />
        <Tile label={t("subs.tadqiqTile")} value={String(sub.tadqiqCount)} />
      </div>
      <p className="text-[11px] text-muted-foreground">{t("dash.afterPctNote")}</p>

      {wos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("subs.noWos")}
        </div>
      ) : (
        <div className="space-y-2">
          {wos.map((w) => {
            const allocated = w.allocatedValue * mult
            const executed = w.executedValue * mult
            const isOpen = open === w.kashefId
            return (
              <div key={w.kashefId} className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <Link to={`/quantities/kashef/${w.kashefId}`}
                        className="text-sm font-semibold hover:underline">
                    {t("list.kashefNo")} <RefCode>{w.woNo || String(w.kashefNo)}</RefCode>
                  </Link>
                  {w.closed && <Badge variant="secondary">{t("status.closed")}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {w.locationText || w.area}
                  </span>
                  <div className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">
                      {t("subs.allocated")}: <Money value={allocated} />
                    </span>
                    <span className="text-muted-foreground">
                      {t("subs.executed")}: <Money value={executed} />
                    </span>
                    <Button size="sm" variant="ghost"
                            onClick={() => setOpen(isOpen ? null : w.kashefId)}>
                      {isOpen ? t("subs.hideLines") : t("subs.showLines", { n: w.allocatedLines })}
                    </Button>
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <TwinBar allocated={allocated} executed={executed} />
                </div>
                {isOpen && (
                  <div className="border-t">
                    <LineTable vendorId={id} kashefId={w.kashefId} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
