import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorBox, LoadingList, QueueHeader } from "@/components/patterns"
import {
  clearMillSession, fetchDecided, fetchPMQueue, getMillSession, isKmRange,
  loadMillingRef, millingDecide, setMillSession,
} from "./lib"
import type { MillingRef, PMUser, Program } from "./lib"
import { PinScreen, PortalShell, ProgramDetails, ProgramHead, reportPath } from "./components"

/* ── PM portal (office density, QUEUE pattern): pending + revised programs
   for the PM's own projects, oldest first, inline approve / reject with a
   mandatory rejection reason (the engineer revises against it). ── */

export default function PMPortal() {
  const { t } = useTranslation("milling")
  const [refData, setRefData] = useState<MillingRef | null>(null)
  const [err, setErr] = useState(false)
  const [name, setName] = useState<string | null>(() => getMillSession("pm"))

  const load = useCallback(() => {
    setErr(false)
    loadMillingRef().then(setRefData).catch(() => setErr(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (err) return <Boot><ErrorBox message={t("common.error")} onRetry={load} /></Boot>
  if (!refData) return <Boot><LoadingList /></Boot>

  const pm: PMUser | null = name ? refData.pms.find((x) => x.name === name) || null : null

  if (!name || !pm) {
    return (
      <PinScreen
        title={t("pin.pmTitle")}
        names={refData.pms.map((x) => x.name)}
        validate={(n, p) => refData.pms.some((x) => x.name === n && x.pin === p)}
        onSuccess={(n) => { setMillSession("pm", n); setName(n) }}
      />
    )
  }

  return (
    <PortalShell title={t("portal.pm")} subtitle={t("portal.pmSub")} user={name}
      onLogout={() => { clearMillSession("pm"); setName(null) }}>
      <PMHome refData={refData} pm={pm} />
    </PortalShell>
  )
}

function Boot({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl p-4">{children}</div>
}

function PMHome({ refData, pm }: { refData: MillingRef; pm: PMUser }) {
  const { t } = useTranslation("milling")
  const [tab, setTab] = useState<"pending" | "log">("pending")
  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "log")}>
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1">{t("tabs.pending")}</TabsTrigger>
          <TabsTrigger value="log" className="flex-1">{t("tabs.log")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "pending" ? <PendingQueue refData={refData} pm={pm} /> : <DecidedLog refData={refData} pm={pm} />}
    </>
  )
}

const mine = (pm: PMUser) => (p: Program) => pm.projects.includes(p.project)

function PendingQueue({ refData, pm }: { refData: MillingRef; pm: PMUser }) {
  const { t } = useTranslation("milling")
  const [progs, setProgs] = useState<Program[] | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    setProgs(null)
    fetchPMQueue()
      .then((list) => setProgs(list.filter(mine(pm))
        .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)))))
      .catch(() => setErr(true))
  }, [pm])
  useEffect(() => { load() }, [load])

  if (err) return <ErrorBox message={t("common.error")} onRetry={load} />
  if (!progs) return <LoadingList />

  return (
    <>
      <QueueHeader title={t("pm.queueTitle")} count={progs.length}
        oldestTs={progs.length ? progs[0].submittedAt : null} />
      {!progs.length
        ? <EmptyState title={t("pm.empty")} />
        : progs.map((p) => <PMCard key={p.programId} prog={p} refData={refData} pm={pm} onChange={load} />)}
    </>
  )
}

function PMCard({ prog, refData, pm, onChange }: {
  prog: Program
  refData: MillingRef
  pm: PMUser
  onChange: () => void
}) {
  const { t } = useTranslation("milling")
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")
  const [noteErr, setNoteErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function act(decision: "approve" | "reject") {
    if (decision === "reject" && !note.trim()) { setNoteErr(t("pm.noteRequired")); return }
    setBusy(true)
    try {
      await millingDecide({ programId: prog.programId, decision, by: pm.name, role: "pm", note: note.trim() })
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
        <div className="mt-1 flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={reportPath(prog.programId)} target="_blank" rel="noreferrer">{t("card.view")}</a>
          </Button>
          {!rejecting && (
            <>
              {/* approve = the one accent action on this card */}
              <Button size="sm" disabled={busy} onClick={() => act("approve")}>{t("pm.approve")}</Button>
              <Button size="sm" variant="outline" className="text-danger" disabled={busy}
                onClick={() => { setRejecting(true); setNoteErr("") }}>
                {t("pm.reject")}
              </Button>
            </>
          )}
        </div>
        {rejecting && (
          <div className="mt-1 flex flex-col gap-1.5">
            <Label>{t("pm.rejectLabel")}</Label>
            <Textarea placeholder={t("pm.rejectPh")} className="min-h-16"
              value={note} onChange={(e) => setNote(e.target.value)} />
            {noteErr && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{noteErr}</div>}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("reject")}>
                {t("pm.confirmReject")}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy}
                onClick={() => { setRejecting(false); setNote(""); setNoteErr("") }}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DecidedLog({ refData, pm }: { refData: MillingRef; pm: PMUser }) {
  const { t } = useTranslation("milling")
  const [progs, setProgs] = useState<Program[] | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(() => {
    setErr(false)
    setProgs(null)
    fetchDecided()
      .then((list) => setProgs(list.filter(mine(pm))
        .sort((a, b) => String(b.pmDecidedAt || b.submittedAt).localeCompare(String(a.pmDecidedAt || a.submittedAt)))))
      .catch(() => setErr(true))
  }, [pm])
  useEffect(() => { load() }, [load])

  if (err) return <ErrorBox message={t("common.error")} onRetry={load} />
  if (!progs) return <LoadingList />
  if (!progs.length) return <EmptyState title={t("pm.emptyLog")} />

  return (
    <>
      {progs.map((p) => (
        <Card key={p.programId} className="py-3">
          <CardContent className="flex flex-col gap-1.5 px-4">
            <ProgramHead prog={p} />
            <ProgramDetails prog={p} kmRange={isKmRange(refData, p.project)} />
            {p.pmNote && (
              <div className="text-sm text-muted-foreground"><b>{t("card.note")}:</b> {p.pmNote}</div>
            )}
            <div className="mt-1">
              <Button asChild variant="secondary" size="sm">
                <a href={reportPath(p.programId)} target="_blank" rel="noreferrer">{t("card.view")}</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
