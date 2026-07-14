import { useState } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { RefCode } from "@/components/patterns"
import { fmtKW, qty } from "@/lib/format"
import { cn } from "@/lib/utils"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import LangToggle from "@/components/LangToggle"
import { MILL_STATUS, STATUS_CODE } from "./lib"
import type { AuditEvent, Program } from "./lib"

/* ── Milling shared UI: status/priority badges (module vocabulary differs
   from the pipeline's), program details block, audit-trail timeline,
   shared PIN screen and the portal shell. ── */

export function MillStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("milling")
  const tone =
    status === MILL_STATUS.rejected
      ? "bg-danger-surface text-danger"
      : status === MILL_STATUS.pending || status === MILL_STATUS.review
        ? "bg-warning-surface text-warning"
        : "bg-success/10 text-success" // approved / scheduled / progress / complete
  const code = STATUS_CODE[status]
  return (
    <Badge variant="secondary" className={cn("font-normal", tone)}>
      {code ? t(`status.${code}`) : status || "—"}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "حرج"
      ? "bg-danger-surface text-danger"
      : priority === "عاجل"
        ? "bg-warning-surface text-warning"
        : "bg-secondary text-muted-foreground"
  return <Badge variant="secondary" className={cn("font-normal", tone)}>{priority || "—"}</Badge>
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 text-sm last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{value ?? "—"}</span>
    </div>
  )
}

/** Program details block — reused by cards and the public report. */
export function ProgramDetails({ prog, kmRange }: { prog: Program; kmRange: boolean }) {
  const { t } = useTranslation("milling")
  const loc = kmRange
    ? [prog.block, prog.street].filter(Boolean).join(" — ")
    : [prog.block ? `ق ${prog.block}` : "", prog.street ? `ش ${prog.street}` : ""].filter(Boolean).join(" / ")
  return (
    <div className="flex flex-col">
      <DetailRow label={t("fields.project")} value={prog.project || "—"} />
      {prog.workOrder && <DetailRow label={t("fields.workOrder")} value={<RefCode>{prog.workOrder}</RefCode>} />}
      <DetailRow label={t("fields.site")} value={prog.site || "—"} />
      {loc && <DetailRow label={t(kmRange ? "fields.kmRange" : "fields.blockStreetLabel")} value={loc} />}
      <DetailRow label={t("fields.depth")} value={prog.depth || "—"} />
      <DetailRow label={t("fields.area")} value={prog.area === "" ? "—" : <RefCode>{qty(prog.area)}</RefCode>} />
      {prog.machines !== "" && <DetailRow label={t("fields.machinesShort")} value={<RefCode>{String(prog.machines)}</RefCode>} />}
      {prog.priority && <DetailRow label={t("fields.priority")} value={prog.priority} />}
      <DetailRow label={t("fields.requestedDate")} value={prog.requestedDate ? <RefCode>{prog.requestedDate}</RefCode> : "—"} />
      <DetailRow label={t("fields.engineer")} value={prog.engineer || "—"} />
      {prog.engNotes && <DetailRow label={t("fields.notes")} value={prog.engNotes} />}
    </div>
  )
}

/** Append-only audit jsonb rendered as a readable timeline. */
export function AuditTrail({ audit }: { audit: AuditEvent[] }) {
  const { t, i18n } = useTranslation("milling")
  const label = (key: string, raw: string) =>
    i18n.exists(`milling:audit.${key}`) ? t(`audit.${key}`) : raw
  if (!audit.length) return null
  return (
    <div className="mt-2 flex flex-col gap-2">
      {audit.map((ev, i) => (
        <div key={i} className="rounded-md border-s-4 border-success bg-secondary/60 px-3 py-1.5">
          <div className="text-sm font-semibold">
            {label(ev.action, ev.action)} — {ev.by || ""}{ev.role ? ` (${label(ev.role, ev.role)})` : ""}
          </div>
          <div className="text-xs text-muted-foreground">{fmtKW(ev.ts)}</div>
          {ev.note && <div className="mt-0.5 text-sm text-muted-foreground">« {ev.note} »</div>}
        </div>
      ))}
    </div>
  )
}

/** Program-id + status + priority header row, shared by every card. */
export function ProgramHead({ prog }: { prog: Program }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <RefCode className="text-sm">{prog.programId}</RefCode>
        <MillStatusBadge status={prog.status} />
      </div>
      <div><PriorityBadge priority={prog.priority} /></div>
    </>
  )
}

export function reportPath(programId: string) {
  return `/milling/report/${encodeURIComponent(programId)}`
}

/* ── Shared PIN screen (engineer / PM / Marco) ── */

export function PinScreen({ title, names, validate, onSuccess }: {
  title: string
  names: string[]
  validate: (name: string, pin: string) => boolean
  onSuccess: (name: string) => void
}) {
  const { t } = useTranslation("milling")
  const [name, setName] = useState(names.length === 1 ? names[0] : "")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [attempts, setAttempts] = useState(0)

  function enter() {
    if (!name) { setErr(t("pin.needName")); return }
    if (!pin.trim()) { setErr(t("pin.needPin")); return }
    if (validate(name, pin.trim())) { onSuccess(name) }
    else { setErr(t("pin.wrong")); setPin(""); setAttempts((a) => a + 1) }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex justify-end"><LangToggle /></div>
          <div className="flex flex-col items-center gap-1 py-2">
            <img src={logoInk} alt="COPRI" className="h-10 w-auto" />
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="text-xs text-muted-foreground">{t("pin.hint")}</div>
          </div>
          {!names.length && (
            <div className="rounded-md bg-warning-surface p-2 text-sm text-warning">{t("pin.noneConfigured")}</div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{t("pin.name")}</Label>
            <Select value={name || undefined} onValueChange={setName}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("pin.pickName")} /></SelectTrigger>
              <SelectContent>
                {names.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mill-pin">{t("pin.pin")}</Label>
            <Input id="mill-pin" type="password" dir="ltr" inputMode="numeric" maxLength={6}
              placeholder="••••" value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enter()} />
          </div>
          {err && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{err}</div>}
          {attempts >= 3 && (
            <div className="text-xs text-warning">{t("pin.attempts", { n: attempts })}</div>
          )}
          <Button disabled={!names.length} onClick={enter}>{t("pin.enter")}</Button>
        </CardContent>
      </Card>
    </div>
  )
}

/* ── Portal shell: identity header + logout; field density opt-in ── */

export function PortalShell({ title, subtitle, user, onLogout, field, children }: {
  title: string
  subtitle: string
  user: string
  onLogout: () => void
  field?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation("milling")
  return (
    <div className={cn("min-h-dvh bg-background", field && "density-field")}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
        <Card className="py-3 print:hidden">
          <CardContent className="flex items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-3">
              <img src={logoInk} alt="COPRI" className="h-6 w-auto" />
              <div>
                <div className="text-sm font-semibold">{user || title}</div>
                <div className="text-xs text-muted-foreground">{subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <LangToggle />
              <Button variant="secondary" size="sm" onClick={onLogout}>{t("common.logout")}</Button>
            </div>
          </CardContent>
        </Card>
        {children}
      </div>
    </div>
  )
}
