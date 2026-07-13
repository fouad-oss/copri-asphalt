import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  MILL_STATUS, MILLING_DEPTHS, millingRevise, millingSubmit, newProgramId, projectByName,
} from "./lib"
import type { MillingRef, Program, ProgramDraft } from "./lib"

/* ── Submission / revision form (engineer, field density).
   Same field set + required rules as the legacy renderMillingProgramForm;
   the RPC payload shape is owned by lib.ts and matches legacy exactly.
   WO stays out of the form (returns as locked auto-fill later). ── */

type LocMode = "blocks" | "named"

export default function ProgramForm({ refData, engineer, existing, onSaved }: {
  refData: MillingRef
  engineer: string
  existing: Program | null
  onSaved: (programId: string, isRevision: boolean) => void
}) {
  const { t } = useTranslation("milling")

  const [project, setProject] = useState(existing?.project || "")
  const [site, setSite] = useState(existing?.site || "")
  const [locMode, setLocMode] = useState<LocMode>(() => {
    if (!existing?.street) return "blocks"
    const named = projectByName(refData, existing.project)?.namedStreets[existing.site] || []
    return named.includes(existing.street) ? "named" : "blocks"
  })
  const [block, setBlock] = useState(existing?.block || "")
  const [street, setStreet] = useState(existing?.street || "")
  const [depth, setDepth] = useState(existing?.depth || "")
  const [area, setArea] = useState(existing?.area === "" || existing == null ? "" : String(existing.area))
  const [machines, setMachines] = useState(existing?.machines === "" || existing == null ? "" : String(existing.machines))
  const [reqDate, setReqDate] = useState(existing?.requestedDate || "")
  const [priority, setPriority] = useState(existing?.priority || "")
  const [notes, setNotes] = useState(existing?.engNotes || "")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const proj = useMemo(() => projectByName(refData, project), [refData, project])
  const kmRange = proj?.locationType === "km_range"
  const named = (proj?.namedStreets[site]) || []
  const effLocMode: LocMode = kmRange ? "blocks" : named.length ? locMode : "blocks"

  function pickProject(name: string) {
    setProject(name)
    setSite("")
    setBlock("")
    setStreet("")
    setLocMode("blocks")
  }
  function pickSite(s: string) {
    setSite(s)
    if (locMode === "named") setStreet("")
  }
  function pickLocMode(m: string) {
    const mode = m as LocMode
    if (mode === effLocMode) return
    setLocMode(mode)
    setBlock("")
    setStreet("")
  }

  async function submit() {
    const d = MILLING_DEPTHS.find((x) => x.label === depth)
    const draft: ProgramDraft = {
      programId: existing ? existing.programId : newProgramId(),
      project,
      workOrder: "",
      site,
      block: block.trim(),
      street: street.trim(),
      depth,
      itemCode: d ? d.code : "",
      area: area.trim(),
      machines: machines.trim(),
      requestedDate: reqDate,
      priority,
      engineerName: engineer,
      notes: notes.trim(),
    }
    if (!draft.project || !draft.site || !draft.depth || !draft.area || !draft.machines || !draft.requestedDate || !draft.priority) {
      setErr(t("form.required"))
      return
    }
    setErr("")
    setBusy(true)
    try {
      if (existing) await millingRevise(draft)
      else await millingSubmit(draft)
      onSaved(draft.programId, !!existing)
    } catch (e: any) {
      setErr(e?.message === "duplicate" ? t("form.duplicate") : t("form.fail"))
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-4 py-4">
        <h2 className="text-base font-semibold">{t(existing ? "form.editTitle" : "form.newTitle")}</h2>

        {existing && existing.status === MILL_STATUS.rejected && existing.pmNote && (
          <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">
            <b>{t("form.pmRejectNote")}:</b> {existing.pmNote}
          </div>
        )}

        <FieldWrap label={t("fields.project")} required>
          <Select value={project || undefined} onValueChange={pickProject}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("fields.pickProject")} /></SelectTrigger>
            <SelectContent>
              {refData.projects.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrap>

        <FieldWrap label={t("fields.site")} required>
          <Select value={site || undefined} onValueChange={pickSite} disabled={!proj}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("fields.pickSite")} /></SelectTrigger>
            <SelectContent>
              {(proj?.sites || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrap>

        {/* Location — km range for highway projects; otherwise block+street
            or a named street picked from the site's list. */}
        {kmRange ? (
          <div className="grid grid-cols-2 gap-2">
            <FieldWrap label={t("fields.kmFrom")}>
              <Input dir="ltr" inputMode="decimal" placeholder={t("fields.kmFromPh")}
                value={block} onChange={(e) => setBlock(e.target.value)} />
            </FieldWrap>
            <FieldWrap label={t("fields.kmTo")}>
              <Input dir="ltr" inputMode="decimal" placeholder={t("fields.kmToPh")}
                value={street} onChange={(e) => setStreet(e.target.value)} />
            </FieldWrap>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {named.length > 0 && (
              <Tabs value={effLocMode} onValueChange={pickLocMode}>
                <TabsList className="w-full">
                  <TabsTrigger value="blocks" className="flex-1">{t("fields.blockStreetTab")}</TabsTrigger>
                  <TabsTrigger value="named" className="flex-1">{t("fields.namedStreetTab")}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {effLocMode === "named" ? (
              <FieldWrap label={t("fields.namedStreetField")}>
                <Select value={street || undefined} onValueChange={setStreet}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("fields.pickStreet")} /></SelectTrigger>
                  <SelectContent>
                    {named.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWrap>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <FieldWrap label={t("fields.block")}>
                  <Input dir="ltr" inputMode="numeric" placeholder={t("fields.blockPh")}
                    value={block} onChange={(e) => setBlock(e.target.value)} />
                </FieldWrap>
                <FieldWrap label={t("fields.street")}>
                  <Input placeholder={t("fields.streetPh")}
                    value={street} onChange={(e) => setStreet(e.target.value)} />
                </FieldWrap>
              </div>
            )}
          </div>
        )}

        <FieldWrap label={t("fields.depth")} required>
          <Select value={depth || undefined} onValueChange={setDepth}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("fields.pickDepth")} /></SelectTrigger>
            <SelectContent>
              {MILLING_DEPTHS.map((d) => <SelectItem key={d.code} value={d.label}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrap>

        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label={t("fields.area")} required>
            <Input dir="ltr" type="number" step="0.01" inputMode="decimal" placeholder="0"
              value={area} onChange={(e) => setArea(e.target.value)} />
          </FieldWrap>
          <FieldWrap label={t("fields.requestedDate")} required>
            <Input dir="ltr" type="date" value={reqDate} onChange={(e) => setReqDate(e.target.value)} />
          </FieldWrap>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label={t("fields.machines")} required>
            <Input dir="ltr" type="number" min="1" step="1" inputMode="numeric" placeholder="1"
              value={machines} onChange={(e) => setMachines(e.target.value)} />
          </FieldWrap>
          <FieldWrap label={t("fields.priority")} required>
            <Select value={priority || undefined} onValueChange={setPriority}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("fields.pickPriority")} /></SelectTrigger>
              <SelectContent>
                {refData.priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldWrap>
        </div>

        <FieldWrap label={t("fields.notes")}>
          <Textarea placeholder={t("fields.notesPh")} className="min-h-16"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldWrap>

        <FieldWrap label={t("fields.engineer")} required>
          <Input readOnly value={engineer} className="bg-secondary" />
        </FieldWrap>

        {err && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{err}</div>}
        <Button disabled={busy} onClick={submit}>
          {busy ? t("form.sending") : t(existing ? "form.resubmit" : "form.submit")}
        </Button>
      </CardContent>
    </Card>
  )
}

function FieldWrap({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}{required && <span className="text-danger"> *</span>}</Label>
      {children}
    </div>
  )
}
