import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ErrorBox, LoadingList } from "@/components/patterns"
import { aggBy, isSingleDay, numFmt, sum, useDash, useDashRange, windowRows } from "./lib"
import { BarList, BoardCard, BoardFooter, BoardHead, KpiGrid, TrendBars, TripsPanel } from "./widgets"

/* ── Plant board — everything dispatched from the plant, any client
   (legacy _dashPlant). Single-day views: the trips KPI expands a
   per-dispatch drill-down card instead of a chart. ── */

export default function PlantBoard({ embedded }: { embedded?: boolean }) {
  const { t } = useTranslation("boards")
  const { data, error, retry } = useDash()
  const [range, setRange] = useDashRange()
  const [tripsOpen, setTripsOpen] = useState(false)

  const tonsFmt = (n: number) => numFmt(Math.round(n)) + " " + t("units.tons")

  if (error) return <ErrorBox message={t("error")} onRetry={retry} />
  if (!data) return <LoadingList />

  const rows = windowRows(data.dispatch, range)
  const tons = sum(rows, (r) => r.t)
  const clients = new Set(rows.map((r) => r.c).filter(Boolean)).size
  const single = isSingleDay(range)

  return (
    <div className="flex flex-col gap-3">
      <BoardHead title={t("plantTitle")} range={range} onChange={setRange} embedded={embedded} />
      <KpiGrid items={[
        {
          label: t("kpi.trips"), value: numFmt(rows.length),
          sub: single ? t("kpi.tripsDrill") : t("kpi.tripsUnit"),
          onClick: single ? () => setTripsOpen((o) => !o) : undefined,
        },
        { label: t("kpi.tonsOut"), value: numFmt(Math.round(tons)) },
        { label: t("kpi.clients"), value: numFmt(clients), sub: t("kpi.clientsUnit") },
        { label: t("kpi.avgLoad"), value: rows.length ? (tons / rows.length).toFixed(1) : "0", sub: t("kpi.avgLoadUnit") },
      ]} />
      {single && tripsOpen && <TripsPanel range={range} />}
      <BoardCard title={t("cards.byCompany")}>
        <BarList items={aggBy(rows, (r) => r.c, (r) => r.t).slice(0, 8)} fmt={tonsFmt} />
      </BoardCard>
      {!single && (
        <BoardCard title={t("cards.daily")}>
          <TrendBars rows={rows} valFn={(r) => r.t} fmt={tonsFmt} />
        </BoardCard>
      )}
      <BoardCard title={t("cards.bySite")}>
        <BarList items={aggBy(rows, (r) => r.s, (r) => r.t).slice(0, 10)} fmt={tonsFmt} />
      </BoardCard>
      <BoardCard title={t("cards.byPlant")}>
        <BarList items={aggBy(rows, (r) => r.pl, (r) => r.t)} fmt={tonsFmt} />
      </BoardCard>
      <BoardCard title={t("cards.byTransport")}>
        <BarList items={aggBy(rows, (r) => r.n, (r) => r.t)} fmt={tonsFmt} />
      </BoardCard>
      <BoardCard title={t("cards.byMix")}>
        <BarList items={aggBy(rows, (r) => r.m, (r) => r.t).slice(0, 8)} fmt={tonsFmt} />
      </BoardCard>
      <BoardFooter data={data} />
    </div>
  )
}
