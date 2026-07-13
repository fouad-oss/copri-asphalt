import { useTranslation } from "react-i18next"
import { ErrorBox, LoadingList } from "@/components/patterns"
import {
  aggBy, isSingleDay, numFmt, sum, thresholds, useDash, useDashRange, useRef_, windowRows,
} from "./lib"
import { BarList, BoardCard, BoardFooter, BoardHead, KpiGrid, StatusSplit, TrendBars } from "./widgets"

/* ── Exec board — top-level management view across all units
   (legacy _dashExec). Acceptance excludes non-Copri clients. ── */

export default function ExecBoard() {
  const { t } = useTranslation("boards")
  const { data, error, retry } = useDash()
  const { data: ref } = useRef_()   // thresholds are best-effort; defaults apply
  const [range, setRange] = useDashRange()

  const tonsFmt = (n: number) => numFmt(Math.round(n)) + " " + t("units.tons")

  if (error) return <ErrorBox message={t("error")} onRetry={retry} />
  if (!data) return <LoadingList />

  const rows = windowRows(data.dispatch, range)
  const copriRows = rows.filter((r) => r.c === data.copri)
  const mats = windowRows(data.materials, range)
  const tons = sum(rows, (r) => r.t)
  const copriTons = sum(copriRows, (r) => r.t)
  const acc = copriRows.filter((r) => r.st === 1).length
  const accPct = copriRows.length ? Math.round((acc / copriRows.length) * 100) : 0

  // Quality flags (confirmed receipts only) — thresholds from app_settings.
  const th = thresholds(ref)
  const wShort = copriRows.filter((r) => r.dw != null && r.dw <= -th.weightShortage).length
  const tDrop = copriRows.filter((r) => r.dt != null && r.dt <= -th.tempDropWarning).length
  const dwArr = copriRows.filter((r) => r.dw != null)
  const dtArr = copriRows.filter((r) => r.dt != null)
  const avgDw = dwArr.length ? (sum(dwArr, (r) => r.dw) / dwArr.length).toFixed(2) : "0"
  const avgDt = dtArr.length ? (sum(dtArr, (r) => r.dt) / dtArr.length).toFixed(1) : "0"

  return (
    <div className="flex flex-col gap-3">
      <BoardHead title={t("execTitle")} range={range} onChange={setRange} />
      <KpiGrid items={[
        { label: t("kpi.totalTons"), value: numFmt(Math.round(tons)), sub: numFmt(rows.length) + " " + t("kpi.tripsUnit") },
        { label: t("kpi.copriTons"), value: numFmt(Math.round(copriTons)), sub: t("kpi.copriTonsSub") },
        { label: t("kpi.otherTons"), value: numFmt(Math.round(tons - copriTons)), sub: t("kpi.otherTonsSub") },
        { label: t("kpi.acceptCopri"), value: accPct + "٪", sub: t("kpi.acceptOf", { acc, total: copriRows.length }) },
      ]} />
      <BoardCard title={t("cards.byProject")}>
        <BarList items={aggBy(rows, (r) => r.p, (r) => r.t).slice(0, 8)} fmt={tonsFmt} />
      </BoardCard>
      {!isSingleDay(range) && (
        <BoardCard title={t("cards.daily")}>
          <TrendBars rows={rows} valFn={(r) => r.t} fmt={tonsFmt} />
        </BoardCard>
      )}
      <BoardCard title={t("cards.receiptStatusCopri")}>
        <StatusSplit rows={copriRows} />
      </BoardCard>
      <BoardCard title={t("cards.quality")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t("quality.shipments", { n: wShort }), t("quality.shortWeight", { v: th.weightShortage })],
            [t("quality.tons", { v: avgDw }), t("quality.avgDw")],
            [t("quality.shipments", { n: tDrop }), t("quality.tempDrop", { v: th.tempDropWarning })],
            [t("quality.deg", { v: avgDt }), t("quality.avgDt")],
          ].map(([v, l], i) => (
            <div key={i} className="rounded-lg border bg-card p-3">
              <div className="text-sm font-semibold tabular-nums">{v}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </BoardCard>
      {mats.length > 0 && (
        <BoardCard title={t("cards.matByProject")}>
          <BarList items={aggBy(mats, (m) => m.p).slice(0, 8)} />
        </BoardCard>
      )}
      <BoardFooter data={data} />
    </div>
  )
}
