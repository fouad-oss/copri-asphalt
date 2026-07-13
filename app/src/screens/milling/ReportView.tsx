import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { EmptyState, ErrorBox, LoadingList } from "@/components/patterns"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import { fetchProgram, isKmRange, loadMillingRef } from "./lib"
import type { MillingRef, Program } from "./lib"
import { AuditTrail, ProgramDetails, ProgramHead } from "./components"

/* ── Public program report (/milling/report/:id — NO PIN, like the legacy
   ?millingReport= link): printable / shareable card with the full details
   and the append-only audit trail. Exports carry the logo + company line
   (skill §brand). ── */

export default function ReportView() {
  const { t } = useTranslation("milling")
  const { id } = useParams()
  const [prog, setProg] = useState<Program | null | undefined>(undefined)
  const [refData, setRefData] = useState<MillingRef | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    setProg(undefined)
    fetchProgram(id || "").then(setProg).catch(() => setErr(true))
    // Reference data only refines the location label (km vs block/street) —
    // the report must render even if it fails.
    loadMillingRef().then(setRefData).catch(() => {})
  }, [id])
  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <img src={logoInk} alt="COPRI" className="h-8 w-auto" />
          <h1 className="text-base font-semibold">{t("portal.report")}</h1>
        </div>

        {err && <ErrorBox message={t("common.error")} onRetry={load} />}
        {!err && prog === undefined && <LoadingList rows={2} />}
        {!err && prog === null && <EmptyState title={t("report.notFound")} />}

        {prog && (
          <>
            <Card className="py-4">
              <CardContent className="flex flex-col gap-1.5 px-4">
                <ProgramHead prog={prog} />
                <ProgramDetails prog={prog} kmRange={isKmRange(refData, prog.project)} />
                <Separator className="my-2" />
                <h2 className="text-sm font-semibold">{t("report.audit")}</h2>
                <AuditTrail audit={prog.audit} />
              </CardContent>
            </Card>
            <Button className="print:hidden" onClick={() => window.print()}>{t("report.print")}</Button>
            <div className="pb-4 text-center text-xs text-muted-foreground">
              COPRI Construction Enterprises W.L.L. · Founded 1969
            </div>
          </>
        )}
      </div>
    </div>
  )
}
