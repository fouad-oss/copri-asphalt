import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ErrorBox, LoadingList, RefCode } from "@/components/patterns"
import { fmtKW, qty } from "@/lib/format"
import { aggBy, fetchProjectMaterials, numFmt, useDashRange, windowRows, type MaterialReceipt } from "./lib"
import { BarList, BoardCard, BoardHead, KpiGrid } from "./widgets"
import { openMaterialsReport } from "./report"

/* ── Accountant board — itemized material deliveries for one project
   (legacy _dashAcct). Reads material_receipts directly: the slim dash
   payload drops rate, receipt id, photo and remarks, all of which the
   accountant needs for audit. ── */

const CHUNK = 60

function MatRow({ r }: { r: MaterialReceipt }) {
  const { t } = useTranslation("boards")
  const loc = `${r.site}${r.block ? ` ق${r.block}` : ""}${r.street ? ` ش${r.street}` : ""}`
  return (
    <div className="border-b pb-2 text-sm last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{r.material || "—"}</span>
        <span className="shrink-0 tabular-nums">{r.quantity == null ? "—" : qty(r.quantity)} {r.unit || ""}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{fmtKW(r.ts)} · {r.category || "—"} · {loc}</div>
      <div className="text-xs text-muted-foreground">
        {t("acct.supplier")}: {r.supplier || "—"} · {t("acct.sub")}: {r.subcontractor || "—"} · {t("acct.receiver")}: {r.receiver || "—"}
      </div>
      {(r.receipt_id || r.photo_url || r.remarks) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {r.receipt_id && <RefCode className="text-xs">{r.receipt_id}</RefCode>}
          {r.photo_url && (
            <a href={r.photo_url} target="_blank" rel="noopener noreferrer" className="text-info underline">
              {t("acct.photo")}
            </a>
          )}
          {r.remarks && <span>{r.remarks}</span>}
        </div>
      )}
    </div>
  )
}

export default function AcctBoard() {
  const { t } = useTranslation("boards")
  const { proj = "" } = useParams()
  const [range, setRange] = useDashRange()
  const [all, setAll] = useState<MaterialReceipt[] | null>(null)
  const [err, setErr] = useState(false)
  const [shown, setShown] = useState(CHUNK)

  const load = useCallback(() => {
    setErr(false)
    fetchProjectMaterials(proj).then(setAll).catch(() => setErr(true))
  }, [proj])
  useEffect(() => { load() }, [load])

  if (err) return <ErrorBox message={t("error")} onRetry={load} />
  if (!all) return <LoadingList />

  const rows = windowRows(all, range)
  const visible = rows.slice(0, shown)

  return (
    <div className="flex flex-col gap-3">
      <BoardHead title={t("acct.title", { proj })} range={range} onChange={setRange} />
      <KpiGrid items={[
        { label: t("kpi.matReceipts"), value: numFmt(rows.length), sub: t("kpi.matReceiptsUnit") },
        { label: t("kpi.matItems"), value: numFmt(new Set(rows.map((r) => r.material).filter(Boolean)).size), sub: t("kpi.matItemsUnit") },
        { label: t("kpi.matSubs"), value: numFmt(new Set(rows.map((r) => r.subcontractor).filter(Boolean)).size) },
        { label: t("kpi.matSups"), value: numFmt(new Set(rows.map((r) => r.supplier).filter(Boolean)).size) },
      ]} />
      <BoardCard title={t("acct.log", { n: numFmt(rows.length) })}>
        <Button type="button" variant="outline" size="sm" className="w-fit"
          onClick={() => { if (rows.length) openMaterialsReport(proj, rows) }}>
          {rows.length ? t("acct.print") : t("acct.printNone")}
        </Button>
        {!rows.length ? (
          <div className="text-sm text-muted-foreground">{t("acct.none")}</div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {visible.map((r) => <MatRow key={r.id} r={r} />)}
            </div>
            {shown < rows.length && (
              <Button type="button" variant="outline" size="sm" className="w-fit"
                onClick={() => setShown((s) => s + CHUNK)}>
                {t("acct.more", { n: numFmt(rows.length - shown) })}
              </Button>
            )}
          </>
        )}
      </BoardCard>
      <BoardCard title={t("acct.byCat")}>
        <BarList items={aggBy(rows, (r) => r.category).slice(0, 10)} />
      </BoardCard>
      <BoardCard title={t("acct.bySub")}>
        <BarList items={aggBy(rows, (r) => r.subcontractor).slice(0, 10)} />
      </BoardCard>
      <BoardCard title={t("acct.bySup")}>
        <BarList items={aggBy(rows, (r) => r.supplier).slice(0, 10)} />
      </BoardCard>
      <BoardCard title={t("acct.byItem")}>
        <BarList items={aggBy(rows, (r) => (r.material || "—") + (r.unit ? ` (${r.unit})` : ""), (r) => r.quantity || 0).slice(0, 12)} />
      </BoardCard>
      <BoardCard title={t("acct.byRec")}>
        <BarList items={aggBy(rows, (r) => r.receiver).slice(0, 10)} />
      </BoardCard>
    </div>
  )
}
