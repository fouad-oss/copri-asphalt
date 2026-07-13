import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorBox, LoadingList, RefCode } from "@/components/patterns"
import {
  clearMillSession, fetchByEngineer, getMillSession, isKmRange, loadMillingRef,
  MILL_STATUS, setMillSession,
} from "./lib"
import type { MillingRef, Program } from "./lib"
import { PinScreen, PortalShell, ProgramDetails, ProgramHead, reportPath } from "./components"
import ProgramForm from "./ProgramForm"

/* ── Engineer portal (field density): PIN login → my programs + new
   submission tabs. Editable while pending; rejected → revise-and-resubmit
   (milling_revise flips the status to مراجعة for the PM's re-review). ── */

export default function EngineerPortal() {
  const { t } = useTranslation("milling")
  const [refData, setRefData] = useState<MillingRef | null>(null)
  const [err, setErr] = useState(false)
  const [name, setName] = useState<string | null>(() => getMillSession("engineer"))

  const load = useCallback(() => {
    setErr(false)
    loadMillingRef().then(setRefData).catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (err) return <Boot><ErrorBox message={t("common.error")} onRetry={load} /></Boot>
  if (!refData) return <Boot><LoadingList /></Boot>

  if (!name) {
    return (
      <div className="density-field">
        <PinScreen
          title={t("pin.engineerTitle")}
          names={refData.engineers.map((e) => e.name)}
          validate={(n, p) => refData.engineers.some((e) => e.name === n && e.pin === p)}
          onSuccess={(n) => { setMillSession("engineer", n); setName(n) }}
        />
      </div>
    )
  }

  return (
    <PortalShell field title={t("portal.engineer")} subtitle={t("portal.engineerSub")} user={name}
      onLogout={() => { clearMillSession("engineer"); setName(null) }}>
      <EngineerHome refData={refData} me={name} />
    </PortalShell>
  )
}

function Boot({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl p-4">{children}</div>
}

function EngineerHome({ refData, me }: { refData: MillingRef; me: string }) {
  const { t } = useTranslation("milling")
  const [tab, setTab] = useState<"mine" | "new">("mine")
  const [editing, setEditing] = useState<Program | null>(null)
  const [saved, setSaved] = useState<{ id: string; revision: boolean } | null>(null)

  function onSaved(id: string, revision: boolean) {
    setEditing(null)
    setSaved({ id, revision })
  }
  function backToMine() {
    setSaved(null)
    setEditing(null)
    setTab("mine")
  }

  if (saved) return <SuccessPanel id={saved.id} revision={saved.revision} onBack={backToMine} />
  if (editing) {
    return (
      <>
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setEditing(null)}>
          ← {t("tabs.mine")}
        </Button>
        <ProgramForm refData={refData} engineer={me} existing={editing} onSaved={onSaved} />
      </>
    )
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "new")}>
        <TabsList className="w-full">
          <TabsTrigger value="mine" className="flex-1">{t("tabs.mine")}</TabsTrigger>
          <TabsTrigger value="new" className="flex-1">{t("tabs.newProgram")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "mine"
        ? <MyPrograms refData={refData} me={me} onEdit={setEditing} />
        : <ProgramForm refData={refData} engineer={me} existing={null} onSaved={onSaved} />}
    </>
  )
}

function MyPrograms({ refData, me, onEdit }: {
  refData: MillingRef
  me: string
  onEdit: (p: Program) => void
}) {
  const { t } = useTranslation("milling")
  const [progs, setProgs] = useState<Program[] | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    setProgs(null)
    fetchByEngineer(me)
      .then((list) => setProgs([...list].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))))
      .catch(() => setErr(true))
  }, [me])
  useEffect(() => { load() }, [load])

  if (err) return <ErrorBox message={t("common.error")} onRetry={load} />
  if (!progs) return <LoadingList />
  if (!progs.length) return <EmptyState title={t("card.empty")} />

  return (
    <>
      {progs.map((p) => {
        const editable = (p.status === MILL_STATUS.pending || p.status === MILL_STATUS.rejected) && p.engineer === me
        return (
          <Card key={p.programId} className="py-3">
            <CardContent className="flex flex-col gap-1.5 px-4">
              <ProgramHead prog={p} />
              <ProgramDetails prog={p} kmRange={isKmRange(refData, p.project)} />
              {p.status === MILL_STATUS.rejected && p.pmNote && (
                <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">
                  <b>{t("card.rejectReason")}:</b> {p.pmNote}
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <Button asChild variant="secondary" size="sm">
                  <a href={reportPath(p.programId)} target="_blank" rel="noreferrer">{t("card.view")}</a>
                </Button>
                {editable && (
                  <Button size="sm" onClick={() => onEdit(p)}>
                    {p.status === MILL_STATUS.rejected ? t("card.editResubmit") : t("card.edit")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}

function SuccessPanel({ id, revision, onBack }: { id: string; revision: boolean; onBack: () => void }) {
  const { t } = useTranslation("milling")
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-2xl text-success">✓</div>
        <h2 className="text-lg font-semibold">{t(revision ? "success.resubmitted" : "success.submitted")}</h2>
        <div className="text-sm">{t("success.programNo")}: <RefCode>{id}</RefCode></div>
        <div className="text-sm text-muted-foreground">{t(revision ? "success.resent" : "success.waiting")}</div>
        <Button asChild variant="secondary" className="w-full max-w-xs">
          <a href={reportPath(id)} target="_blank" rel="noreferrer">{t("success.view")}</a>
        </Button>
        <Button className="w-full max-w-xs" onClick={onBack}>{t("success.back")}</Button>
      </CardContent>
    </Card>
  )
}
