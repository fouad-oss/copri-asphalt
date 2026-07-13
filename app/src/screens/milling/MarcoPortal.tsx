import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { EmptyState, ErrorBox, LoadingList, QueueHeader } from "@/components/patterns"
import {
  clearMillSession, fetchMarcoQueue, getMillSession, isKmRange, loadMillingRef,
  MILL_STATUS, millingDecide, setMillSession,
} from "./lib"
import type { MillingRef, Program } from "./lib"
import { PinScreen, PortalShell, ProgramDetails, ProgramHead, reportPath } from "./components"

/* ── Marco portal (office density): schedule approved programs, then start
   them. Queue = approved + scheduled + in-progress, earliest requested
   date first, filterable by project. ── */

const ALL = "__all__"

export default function MarcoPortal() {
  const { t } = useTranslation("milling")
  const [refData, setRefData] = useState<MillingRef | null>(null)
  const [err, setErr] = useState(false)
  const [name, setName] = useState<string | null>(() => getMillSession("marco"))

  const load = useCallback(() => {
    setErr(false)
    loadMillingRef().then(setRefData).catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (err) return <Boot><ErrorBox message={t("common.error")} onRetry={load} /></Boot>
  if (!refData) return <Boot><LoadingList /></Boot>

  if (!name) {
    return (
      <PinScreen
        title={t("pin.marcoTitle")}
        names={refData.marco ? [refData.marco.name] : []}
        validate={(n, p) => !!refData.marco && refData.marco.name === n && refData.marco.pin === p}
        onSuccess={(n) => { setMillSession("marco", n); setName(n) }}
      />
    )
  }

  return (
    <PortalShell title={t("portal.marco")} subtitle={t("portal.marcoSub")} user={name}
      onLogout={() => { clearMillSession("marco"); setName(null) }}>
      <MarcoBoard refData={refData} me={name} />
    </PortalShell>
  )
}

function Boot({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl p-4">{children}</div>
}

function MarcoBoard({ refData, me }: { refData: MillingRef; me: string }) {
  const { t } = useTranslation("milling")
  const [filter, setFilter] = useState(ALL)
  const [progs, setProgs] = useState<Program[] | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    setProgs(null)
    fetchMarcoQueue()
      .then((list) => setProgs([...list].sort((a, b) => String(a.requestedDate).localeCompare(String(b.requestedDate)))))
      .catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = progs?.filter((p) => filter === ALL || p.project === filter) ?? null

  return (
    <>
      <Card className="py-3">
        <CardContent className="flex flex-col gap-1.5 px-4">
          <Label>{t("marco.filter")}</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("marco.all")}</SelectItem>
              {refData.projects.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {err && <ErrorBox message={t("common.error")} onRetry={load} />}
      {!err && !shown && <LoadingList />}
      {shown && (
        <>
          <QueueHeader title={t("marco.queueTitle")} count={shown.length}
            oldestTs={shown.length ? shown[0].submittedAt : null} />
          {!shown.length
            ? <EmptyState title={t("marco.empty")} />
            : shown.map((p) => <MarcoCard key={p.programId} prog={p} refData={refData} me={me} onChange={load} />)}
        </>
      )}
    </>
  )
}

function MarcoCard({ prog, refData, me, onChange }: {
  prog: Program
  refData: MillingRef
  me: string
  onChange: () => void
}) {
  const { t } = useTranslation("milling")
  const [scheduling, setScheduling] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  async function act(decision: "schedule" | "start", withNote: string) {
    setBusy(true)
    try {
      await millingDecide({ programId: prog.programId, decision, by: me, role: "marco", note: withNote })
    } catch {
      toast.error(t("common.actionFail"))
    }
    onChange()
  }

  return (
    <Card className="py-3">
      <CardContent className="flex flex-col gap-1.5 px-4">
        <ProgramHead prog={prog} />
        <ProgramDetails prog={prog} kmRange={isKmRange(refData, prog.project)} />
        {prog.status === MILL_STATUS.scheduled && prog.marcoNote && (
          <div className="text-sm text-muted-foreground"><b>{t("marco.scheduledNote")}:</b> {prog.marcoNote}</div>
        )}

        <div className="mt-1 flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={reportPath(prog.programId)} target="_blank" rel="noreferrer">{t("card.view")}</a>
          </Button>
          {prog.status === MILL_STATUS.approved && !scheduling && (
            <Button size="sm" disabled={busy} onClick={() => setScheduling(true)}>{t("marco.schedule")}</Button>
          )}
          {prog.status === MILL_STATUS.scheduled && (
            <Button size="sm" disabled={busy} onClick={() => act("start", "")}>{t("marco.start")}</Button>
          )}
        </div>

        {scheduling && (
          <div className="mt-1 flex flex-col gap-1.5">
            <Label>{t("marco.scheduleLabel")}</Label>
            <Input placeholder={t("marco.schedulePh")} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => act("schedule", note.trim())}>
                {t("marco.confirmSchedule")}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy}
                onClick={() => { setScheduling(false); setNote("") }}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
