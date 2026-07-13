import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ErrorBox, LoadingList } from "@/components/patterns"
import { aggBy, isSingleDay, numFmt, sum, useDash, useDashRange, windowRows } from "./lib"
import { BarList, BoardCard, BoardFooter, BoardHead, KpiGrid, StatusSplit, TrendBars } from "./widgets"

/* ── Project board — asphalt receivals + materials for one Copri project
   (legacy _dashProject). Acceptance = accepted / TOTAL dispatched. ── */

export default function ProjectBoard() {
  const { t } = useTranslation("boards")
  const { proj = "" } = useParams()
  const { data, error, retry } = useDash()
  const [range, setRange] = useDashRange()

  const tonsFmt = (n: number) => numFmt(Math.round(n)) + " " + t("units.tons")

  if (error) return <ErrorBox message={t("error")} onRetry={retry} />
  if (!data) return <LoadingList />

  const rows = windowRows((data.dispatch || []).filter((r) => r.c === data.copri && r.p === proj), range)
  const mats = windowRows((data.materials || []).filter((m) => m.p === proj), range)
  const tons = sum(rows, (r) => r.t)
  const tonsRecv = sum(rows, (r) => r.tr)
  const acc = rows.filter((r) => r.st === 1).length
  const accPct = rows.length ? Math.round((acc / rows.length) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      <BoardHead title={proj} range={range} onChange={setRange} />
      <KpiGrid items={[
        { label: t("kpi.trips"), value: numFmt(rows.length), sub: t("kpi.tripsSent") },
        { label: t("kpi.tonsOut"), value: numFmt(Math.round(tons)) },
        { label: t("kpi.tonsRecv"), value: numFmt(Math.round(tonsRecv)), sub: t("kpi.tonsRecvSub") },
        { label: t("kpi.acceptPct"), value: accPct + "٪", sub: t("kpi.acceptOf", { acc, total: rows.length }) },
      ]} />
      <BoardCard title={t("cards.receiptStatus")}>
        <StatusSplit rows={rows} />
      </BoardCard>
      {!isSingleDay(range) && (
        <BoardCard title={t("cards.daily")}>
          <TrendBars rows={rows} valFn={(r) => r.t} fmt={tonsFmt} />
        </BoardCard>
      )}
      <BoardCard title={t("cards.bySite")}>
        <BarList items={aggBy(rows, (r) => r.s, (r) => r.t).slice(0, 10)} fmt={tonsFmt} />
      </BoardCard>
      <BoardCard title={t("cards.byWO")}>
        <BarList items={aggBy(rows.filter((r) => r.w && r.w !== "*"), (r) => t("cards.woPrefix") + r.w, (r) => r.t).slice(0, 8)} fmt={tonsFmt} />
      </BoardCard>

      {mats.length ? (
        <>
          <KpiGrid items={[
            { label: t("kpi.matReceipts"), value: numFmt(mats.length), sub: t("kpi.matReceiptsUnit") },
            { label: t("kpi.matItems"), value: numFmt(new Set(mats.map((m) => m.item).filter(Boolean)).size), sub: t("kpi.matItemsUnit") },
          ]} />
          <BoardCard title={t("cards.matByCat")}>
            <BarList items={aggBy(mats, (m) => m.cat).slice(0, 8)} />
          </BoardCard>
          <BoardCard title={t("cards.matBySub")}>
            <BarList items={aggBy(mats, (m) => m.sub).slice(0, 8)} />
          </BoardCard>
          <BoardCard title={t("cards.matByRec")}>
            <BarList items={aggBy(mats, (m) => m.rec).slice(0, 8)} />
          </BoardCard>
          <BoardCard title={t("cards.matBySite")}>
            <BarList items={aggBy(mats, (m) => m.s).slice(0, 8)} />
          </BoardCard>
        </>
      ) : (
        <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">{t("cards.matNone")}</div>
      )}
      <BoardFooter data={data} />
    </div>
  )
}
