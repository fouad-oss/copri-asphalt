/* Engineer receipt confirmation — port of legacy renderReceipt() (?note=…,
   now /dispatch/note/:id). Engineer PIN gate → dispatch summary card →
   confirm form → confirm_receipt RPC (atomic: inserts the receipt AND
   reflects the decision on the dispatch row). One-time link: blocked with
   who/when if the note was already receipted. Lookup semantics preserved:
   a SUCCESSFUL lookup that finds nothing is a wrong note number (clear
   stop); a NETWORK failure stays lenient — the engineer can still confirm. */

import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { RefCode } from "@/components/patterns"
import { fmtKW } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDispatchRef, allEngineers } from "./reference"
import { cleanPhone, dbCheckReceipt, dbDispatchByNote, dbSubmitReceipt } from "./helpers"
import type { DispatchRow } from "./helpers"
import { getEngineerSession, setEngineerSession } from "./session"
import { ErrorMsg, FieldGroup, InfoBox, PickSelect, PinScreen, PortalShell, SectionTitle } from "./components"

type Phase =
  | { k: "loading" }
  | { k: "notFound" }
  | { k: "already"; engineer: string; tsISO: string }
  | { k: "form"; dispatch: DispatchRow | null }   // null = lookup failed (lenient)
  | { k: "done"; decision: string }

export default function ReceiptNote() {
  const { id = "" } = useParams()
  const { t } = useTranslation("dispatch")
  const { cfg } = useDispatchRef()
  const [engineer, setEngineer] = useState<string | null>(() => getEngineerSession()?.name ?? null)

  if (!engineer) {
    return (
      <PortalShell badge={t("badge.engineerLogin")}>
        <PinScreen title={t("pin.engineerTitle")} people={allEngineers(cfg)}
          onSuccess={(name) => { setEngineerSession(name); setEngineer(name) }} />
      </PortalShell>
    )
  }
  return <ReceiptBody note={id} engineerName={engineer} />
}

function ReceiptBody({ note, engineerName }: { note: string; engineerName: string }) {
  const { t } = useTranslation("dispatch")
  const { cfg } = useDispatchRef()
  const [phase, setPhase] = useState<Phase>({ k: "loading" })

  // Receipt form state
  const [tempArr, setTempArr] = useState("")
  const [decision, setDecision] = useState("")          // "مقبول" | "مرفوض" (DB literals)
  const [reason, setReason] = useState("")
  const [remarks, setRemarks] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setPhase({ k: "loading" })
    let dispatch: DispatchRow | null = null
    let lookupFailed = false
    try { dispatch = await dbDispatchByNote(note) }
    catch { lookupFailed = true }   // network error — show what we have

    if (!dispatch && !lookupFailed) { setPhase({ k: "notFound" }); return }

    // One-time link check — block if already receipted.
    if (dispatch) {
      try {
        const st = await dbCheckReceipt(note)
        if (st.alreadyReceived) {
          setPhase({ k: "already", engineer: st.engineer || "", tsISO: st.tsISO || "" })
          return
        }
      } catch { /* network issue — allow to proceed */ }
    }
    setPhase({ k: "form", dispatch })
  }, [note])
  useEffect(() => { void load() }, [load])

  async function submit(dispatch: DispatchRow | null) {
    if (!engineerName) { setErr(t("receipt.errEngineer")); return }
    if (!tempArr) { setErr(t("receipt.errTemp")); return }
    if (!decision) { setErr(t("receipt.errDecision")); return }
    if (decision === "مرفوض" && !reason) { setErr(t("receipt.errReason")); return }
    setErr("")
    setBusy(true)
    try {
      await dbSubmitReceipt({
        noteNumber: note,
        engineerName,
        // WO is fixed by the dispatch location — a read-only display of the
        // originating dispatch's value; never re-derived or edited here.
        workOrder: dispatch ? dispatch.workOrder || "*" : "*",
        decision,
        // Arrival weight defaults to the dispatched weight (plant scale) —
        // the engineer no longer enters it.
        weightArrival: dispatch ? dispatch.weight : "",
        tempArrival: tempArr,
        remarks: decision === "مرفوض" ? reason : remarks,
      })
      setPhase({ k: "done", decision })
    } catch {
      setBusy(false)
      setErr(t("receipt.errSubmit"))
    }
  }

  const badge = t("badge.receipt")

  if (phase.k === "loading") {
    return (
      <PortalShell badge={badge}>
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Spinner className="size-6" />
          <p>{t("receipt.loading")}</p>
        </div>
      </PortalShell>
    )
  }

  if (phase.k === "notFound") {
    return (
      <PortalShell badge={badge}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-danger-surface text-3xl text-danger">؟</div>
          <h2 className="text-xl font-semibold">{t("receipt.notFound")}</h2>
          <p>{t("receipt.notFoundP", { note })}</p>
          <InfoBox className="text-start">{t("receipt.notFoundHint")}</InfoBox>
        </div>
      </PortalShell>
    )
  }

  if (phase.k === "already") {
    return (
      <PortalShell badge={badge}>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">✓</div>
          <h2 className="text-xl font-semibold">{t("receipt.already")}</h2>
          <p>{t("receipt.alreadyNote", { note })}</p>
          <p>{t("receipt.alreadyBy", { name: phase.engineer })}</p>
          <p>{t("receipt.alreadyAt", { t: fmtKW(phase.tsISO) })}</p>
        </div>
      </PortalShell>
    )
  }

  if (phase.k === "done") {
    const accepted = phase.decision === "مقبول"
    return (
      <PortalShell badge={badge}>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className={cn(
            "flex size-16 items-center justify-center rounded-full text-3xl",
            accepted ? "bg-success/10 text-success" : "bg-danger-surface text-danger",
          )}>
            {accepted ? "✓" : "✗"}
          </div>
          <h2 className="text-xl font-semibold">{accepted ? t("receipt.accepted") : t("receipt.rejectedDone")}</h2>
          <p><RefCode>{note}</RefCode></p>
          <p className="text-sm text-muted-foreground">{t("receipt.signed", { t: fmtKW(new Date().toISOString()) })}</p>
        </div>
      </PortalShell>
    )
  }

  const dispatch = phase.dispatch
  const tempDiff = dispatch && tempArr ? Math.abs(Number(tempArr) - Number(dispatch.tempDispatch)) : null
  const summaryRows: [string, string][] = dispatch ? [
    [t("receipt.project"), dispatch.project || "—"],
    [t("receipt.contract"), dispatch.contract || "—"],
    [t("receipt.wo"), dispatch.workOrder || "—"],
    [t("receipt.note"), dispatch.noteNumber || "—"],
    [t("receipt.loadNo"), String(dispatch.loadNumber || "—")],
    [t("receipt.plant"), dispatch.plant || "—"],
    [t("receipt.truck"), dispatch.truckNumber || "—"],
    [t("receipt.naqel"), dispatch.naqel || "—"],
    [t("receipt.driver"), dispatch.driverName || "—"],
    [t("receipt.mix"), dispatch.mixType || "—"],
    [t("receipt.weightSent"), `${dispatch.weight} ${t("receipt.tons")}`],
    [t("receipt.tempSent"), `${dispatch.tempDispatch}${t("receipt.degC")}`],
    [t("receipt.site"), dispatch.site || "—"],
    ...(dispatch.locationType === "km_range"
      ? [[t("receipt.kmFrom"), dispatch.block || "—"], [t("receipt.kmTo"), dispatch.street || "—"]] as [string, string][]
      : dispatch.locationType === "named"
        ? [[t("receipt.namedName"), dispatch.block || "—"]] as [string, string][]
        : [[t("receipt.block"), dispatch.block || "—"], [t("receipt.street"), dispatch.street || "—"]] as [string, string][]),
    [t("receipt.departed"), fmtKW(dispatch.tsISO)],
  ] : []

  return (
    <PortalShell badge={badge}>
      {/* ── Summary card ── */}
      <Card><CardContent className="flex flex-col gap-2 px-4 py-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold">{t("receipt.summary")}</h2>
          <span className="rounded-full bg-warning-surface px-2.5 py-0.5 text-sm font-semibold text-warning">
            {t("receipt.transit")}
          </span>
        </div>
        {dispatch ? (
          summaryRows.map(([l, v]) => (
            <div key={l} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 text-sm last:border-b-0">
              <span className="text-muted-foreground">{l}</span>
              <span className="text-end font-medium">{v || "—"}</span>
            </div>
          ))
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <span className="text-muted-foreground">{t("receipt.note")}</span>
              <span className="font-medium"><RefCode>{note}</RefCode></span>
            </div>
            <InfoBox>{t("receipt.noData")}</InfoBox>
          </>
        )}
        {/* Contact the driver directly if a number was recorded */}
        {dispatch && dispatch.driverPhone && (
          <div className="mt-2 grid grid-cols-2 gap-2" dir="ltr">
            <Button asChild variant="secondary" className="h-11">
              <a href={`tel:${cleanPhone(dispatch.driverPhone)}`}>{t("receipt.callDriver")}</a>
            </Button>
            <Button asChild className="h-11 bg-[#25D366] text-white hover:bg-[#1faa52]">
              <a href={`https://wa.me/${cleanPhone(dispatch.driverPhone)}`} target="_blank" rel="noreferrer">
                {t("receipt.whatsapp")}
              </a>
            </Button>
          </div>
        )}
      </CardContent></Card>

      {/* ── Confirm form ── */}
      <Card><CardContent className="flex flex-col gap-4 px-4 py-4">
        <SectionTitle>{t("receipt.confirmSection")}</SectionTitle>

        <FieldGroup label={t("receipt.engineer")} required>
          <Input className="h-12" value={engineerName} disabled />
        </FieldGroup>

        {/* WO stays a read-only display of the originating dispatch's value */}
        <FieldGroup label={t("receipt.wo")} hint={t("receipt.woAutoHint")}>
          <Input className="h-12 bg-secondary font-semibold" dir="ltr"
            value={dispatch ? dispatch.workOrder || "*" : "*"} readOnly />
        </FieldGroup>

        <FieldGroup label={t("receipt.tempArr")} required>
          <Input className="h-12" dir="ltr" type="number" inputMode="numeric"
            placeholder={t("receipt.tempArrPh")}
            value={tempArr} onChange={(e) => setTempArr(e.target.value)} />
          {tempDiff != null && (
            <div className={cn(
              "text-sm font-medium",
              tempDiff > cfg.tempDropWarning ? "text-warning" : "text-success",
            )}>
              {t("receipt.tempDelta", { d: tempDiff })} {tempDiff > cfg.tempDropWarning ? t("receipt.deltaBig") : "✓"}
            </div>
          )}
        </FieldGroup>

        <FieldGroup label={t("receipt.decision")} required>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDecision("مقبول")}
              className={cn(
                "h-12 rounded-md border text-base font-semibold",
                decision === "مقبول" ? "border-success bg-success/10 text-success" : "bg-card text-muted-foreground",
              )}>
              {t("receipt.accept")}
            </button>
            <button type="button" onClick={() => setDecision("مرفوض")}
              className={cn(
                "h-12 rounded-md border text-base font-semibold",
                decision === "مرفوض" ? "border-danger bg-danger-surface text-danger" : "bg-card text-muted-foreground",
              )}>
              {t("receipt.reject")}
            </button>
          </div>
        </FieldGroup>

        {decision === "مرفوض" && (
          <FieldGroup label={t("receipt.reason")} required>
            <PickSelect value={reason} onChange={setReason}
              options={cfg.rejectionReasons} placeholder={t("receipt.pickReason")} />
          </FieldGroup>
        )}
        {decision === "مقبول" && (
          <FieldGroup label={t("receipt.remarks")}>
            <Textarea rows={2} placeholder={t("receipt.remarksPh")} value={remarks}
              onChange={(e) => setRemarks(e.target.value)} />
          </FieldGroup>
        )}

        {err && <ErrorMsg>{err}</ErrorMsg>}

        <Button size="lg" disabled={busy}
          className={cn("h-12 text-base", decision === "مرفوض" && "bg-danger text-white hover:bg-danger/90")}
          onClick={() => void submit(dispatch)}>
          {busy ? t("receipt.saving") : decision === "مرفوض" ? t("receipt.confirmReject") : t("receipt.confirm")}
        </Button>
      </CardContent></Card>
    </PortalShell>
  )
}
