/* Shared dispatch-portal chrome + primitives — CAPTURE pattern (field
   density: 16px body via .density-field on the portal root, 48px touch
   targets, one column). Logo: small, start-aligned, once per screen. */

import { useState } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useDispatchRef } from "./reference"
import logo from "@/assets/brand/copri-logo.png"
import LangToggle from "@/components/LangToggle"

export function PortalShell({ badge, children }: { badge: string; children: ReactNode }) {
  const { t } = useTranslation("dispatch")
  const { cfg, refresh, refreshing } = useDispatchRef()
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-4 py-2.5">
          <img src={logo} alt="COPRI" className="h-8 w-auto" />
          <div className="flex items-center gap-2">
            <LangToggle />
            <span className="rounded-md bg-secondary px-2.5 py-1 text-sm font-semibold text-secondary-foreground">
              {badge}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              title={t("common.refresh")}
              aria-label={t("common.refresh")}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-4">
        {children}
      </main>
      <footer className="border-t py-3 text-center text-sm text-muted-foreground">
        {cfg.footerText}
      </footer>
    </div>
  )
}

/** Neutral info box (legacy .info-box) — muted surface, NOT a warning tint. */
export function InfoBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground", className)}>
      {children}
    </div>
  )
}

export function ErrorMsg({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-danger-surface px-3 py-2.5 text-sm font-medium text-danger">{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="border-b pb-2 text-base font-semibold">{children}</h2>
}

/** One labeled field, one column (CAPTURE). 48px control height. */
export function FieldGroup({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** Pre-scoped picker (no unbounded pickers on field screens). */
export function PickSelect({ value, onChange, options, placeholder, ltr }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; ltr?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-12 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {ltr ? <bdi dir="ltr">{o}</bdi> : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ── PIN gate — shared by the clerk (plant) and engineer (site) realms.
   Validates client-side against the ref_payload staff lists (legacy v1
   posture — real auth comes with the Supabase Auth phase). PINs never
   touch the URL; only the resolved name persists (sessionStorage). ── */
export function PinScreen({ title, people, onSuccess }: {
  title: string
  people: { name: string; pin: string }[]
  onSuccess: (name: string) => void
}) {
  const { t } = useTranslation("dispatch")
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [attempts, setAttempts] = useState(0)

  function submit() {
    if (!name) { setErr(t("pin.errName")); return }
    if (!pin.trim()) { setErr(t("pin.errPin")); return }
    const person = people.find((p) => p.name === name)
    if (person && person.pin === pin.trim()) {
      onSuccess(name)
    } else {
      setAttempts((a) => a + 1)
      setErr(t("pin.wrong"))
      setPin("")
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-4 px-4 py-6">
        <div className="flex justify-end"><LangToggle /></div>
        <div className="flex flex-col items-center gap-1 text-center">
          <img src={logo} alt="COPRI" className="h-9 w-auto" />
          <h2 className="mt-2 text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{t("pin.subtitle")}</p>
        </div>
        <FieldGroup label={t("pin.name")} required>
          <PickSelect value={name} onChange={setName} options={people.map((p) => p.name)} placeholder={t("pin.pickName")} />
        </FieldGroup>
        <FieldGroup label={t("pin.pin")} required>
          <Input
            type="password" inputMode="numeric" maxLength={4} dir="ltr"
            placeholder="••••" autoComplete="off"
            className="h-12 text-center font-mono text-lg tracking-[0.5em]"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit() }}
          />
        </FieldGroup>
        {attempts >= 3 && (
          <div className="text-center text-sm text-warning">{t("pin.attempts", { n: attempts })}</div>
        )}
        {err && <ErrorMsg>{err}</ErrorMsg>}
        <Button size="lg" className="h-12" onClick={submit}>{t("pin.enter")}</Button>
      </CardContent>
    </Card>
  )
}
