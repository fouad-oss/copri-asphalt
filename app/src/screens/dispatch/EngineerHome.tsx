/* Engineer home — port of legacy renderEngineerHome() (?role=engineer):
   the signed-in engineer's TODAY (Kuwait wall-clock), two tabs — signed
   receipts and loads still in transit to them. A pending load opens the
   receipt confirmation page (/dispatch/note/:id), same flow the QR link
   lands on. Engineer realm PIN gate; data reads are anon like legacy. */

import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { RefCode } from "@/components/patterns"
import { fmtKW } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDispatchRef, allEngineers } from "./reference"
import { cleanPhone, dbEngineerData, kwDayISO, kwDayOf } from "./helpers"
import type { DispatchRow, EngineerData } from "./helpers"
import { clearEngineerSession, getEngineerSession, setEngineerSession } from "./session"
import { ErrorMsg, InfoBox, PinScreen, PortalShell } from "./components"

export default function EngineerHome() {
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
  return <HomeBody engineerName={engineer} onLogout={() => { clearEngineerSession(); setEngineer(null) }} />
}

function HomeBody({ engineerName, onLogout }: { engineerName: string; onLogout: () => void }) {
  const { t, i18n } = useTranslation("dispatch")
  const [tab, setTab] = useState<"received" | "pending">("received")
  const [state, setState] = useState<{ k: "loading" } | { k: "error" } | { k: "ready"; data: EngineerData }>({ k: "loading" })

  const load = useCallback(async () => {
    setState({ k: "loading" })
    try {
      const all = await dbEngineerData(engineerName)
      // Today only (Kuwait) — same client-side filter the legacy home ran.
      const today = kwDayISO(0)
      setState({
        k: "ready",
        data: {
          received: all.received.filter((r) => kwDayOf(r.receipt.tsISO) === today),
          pending: all.pending.filter((p) => kwDayOf(p.tsISO) === today),
        },
      })
    } catch { setState({ k: "error" }) }
  }, [engineerName])
  useEffect(() => { void load() }, [load])

  const todayLabel = new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-KW" : "en-GB", {
    timeZone: "Asia/Kuwait", weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(new Date()).replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 1584))

  const received = state.k === "ready" ? state.data.received : []
  const pending = state.k === "ready" ? state.data.pending : []

  return (
    <PortalShell badge={t("badge.engineerHome")}>
      <InfoBox>{t("engHome.greeting", { name: engineerName })} — {todayLabel}</InfoBox>

      {/* Tabs — counts mirror the legacy chips */}
      <div className="grid grid-cols-2 gap-2">
        <TabButton active={tab === "received"} onClick={() => setTab("received")}
          label={t("engHome.tabReceived")} count={received.length} tone="success" />
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")}
          label={t("engHome.tabPending")} count={pending.length} tone="warning" />
      </div>

      {state.k === "loading" && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Spinner className="size-6" />
          <p>{t("engHome.loading")}</p>
        </div>
      )}
      {state.k === "error" && (
        <div className="flex flex-col gap-3">
          <ErrorMsg>{t("engHome.error")}</ErrorMsg>
          <Button variant="secondary" onClick={() => void load()}>{t("engHome.retry")}</Button>
        </div>
      )}

      {state.k === "ready" && tab === "received" && (
        received.length === 0
          ? <p className="py-10 text-center text-muted-foreground">{t("engHome.emptyReceived")}</p>
          : received.map(({ receipt, dispatch }) => (
            <Card key={receipt.note}><CardContent className="flex flex-col gap-1.5 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("engHome.noteNo")} <RefCode>{receipt.note}</RefCode></span>
                <span className="text-xs text-muted-foreground">{fmtKW(receipt.tsISO)}</span>
              </div>
              <Row l={t("receipt.project")} v={dispatch?.project} />
              <Row l={t("receipt.wo")} v={dispatch?.workOrder} />
              <Row l={t("receipt.mix")} v={dispatch?.mixType} />
              <Row l={t("engHome.weightSent")} v={dispatch ? `${dispatch.weight} ${t("receipt.tons")}` : undefined} />
              <Row l={t("engHome.weightArr")} v={receipt.weightArrival ? `${receipt.weightArrival} ${t("receipt.tons")}` : undefined} />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{t("engHome.decision")}</span>
                <span className={cn("font-bold", receipt.decision === "مقبول" ? "text-success" : "text-danger")}>
                  {receipt.decision === "مقبول" ? t("engHome.accepted") : t("engHome.rejected")}
                </span>
              </div>
              {receipt.remarks && <Row l={t("receipt.remarks")} v={receipt.remarks} />}
            </CardContent></Card>
          ))
      )}

      {state.k === "ready" && tab === "pending" && (
        pending.length === 0
          ? <p className="py-10 text-center text-muted-foreground">{t("engHome.emptyPending")}</p>
          : pending.map((d) => <PendingCard key={d.noteNumber} d={d} />)
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button variant="secondary" onClick={() => void load()}>{t("engHome.refresh")}</Button>
        <Button variant="ghost" onClick={onLogout}>{t("success.logout")}</Button>
      </div>
    </PortalShell>
  )
}

function TabButton({ active, onClick, label, count, tone }: {
  active: boolean; onClick: () => void; label: string; count: number; tone: "success" | "warning"
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold",
        active ? "border-primary bg-primary/5 text-foreground" : "bg-card text-muted-foreground",
      )}>
      {label}
      <span className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold text-white",
        tone === "success" ? "bg-success" : "bg-warning",
      )}>
        {count}
      </span>
    </button>
  )
}

function Row({ l, v }: { l: string; v?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{l}</span>
      <span className="text-end font-medium">{v || "—"}</span>
    </div>
  )
}

function PendingCard({ d }: { d: DispatchRow }) {
  const { t } = useTranslation("dispatch")
  return (
    <Card className="border-warning/60"><CardContent className="flex flex-col gap-1.5 px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{t("engHome.noteNo")} <RefCode>{d.noteNumber || ""}</RefCode></span>
        <span className="rounded-full bg-warning-surface px-2.5 py-0.5 text-xs font-semibold text-warning">
          {t("receipt.transit")}
        </span>
      </div>
      <Row l={t("receipt.project")} v={d.project} />
      <Row l={t("receipt.wo")} v={d.workOrder} />
      <Row l={t("receipt.plant")} v={d.plant} />
      <Row l={t("receipt.naqel")} v={d.naqel} />
      <Row l={t("receipt.driver")} v={d.driverName} />
      <Row l={t("receipt.mix")} v={d.mixType} />
      <Row l={t("engHome.weightSent")} v={d.weight ? `${d.weight} ${t("receipt.tons")}` : undefined} />
      <Row l={t("receipt.tempSent")} v={d.tempDispatch ? `${d.tempDispatch}${t("receipt.degC")}` : undefined} />
      <Row l={t("receipt.site")} v={d.isMisc ? t("receipt.misc") : d.site} />
      {d.driverPhone && (
        <div className="mt-1 grid grid-cols-2 gap-2" dir="ltr">
          <Button asChild variant="secondary" className="h-11">
            <a href={`tel:${cleanPhone(d.driverPhone)}`}>{t("receipt.callDriver")}</a>
          </Button>
          <Button asChild className="h-11 bg-[#25D366] text-white hover:bg-[#1faa52]">
            <a href={`https://wa.me/${cleanPhone(d.driverPhone)}`} target="_blank" rel="noreferrer">
              {t("receipt.whatsapp")}
            </a>
          </Button>
        </div>
      )}
      <Button asChild className="mt-1 h-11">
        <Link to={`/dispatch/note/${encodeURIComponent(d.noteNumber || "")}`}>{t("engHome.confirm")}</Link>
      </Button>
    </CardContent></Card>
  )
}
