import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ErrorBox, LoadingList } from "@/components/patterns"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import { useCaptureRef } from "./ref"
import { setCaptureSession } from "./session"

/* Receiver login: name picked from ref_payload staff (function civil/both)
   + PIN, validated client-side against the same list the legacy portal
   used (v1 posture — real auth arrives with the auth phase). */

export default function CaptureLogin() {
  const { t } = useTranslation("capture")
  const nav = useNavigate()
  const { ref, error, reload } = useCaptureRef()
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")

  function enter() {
    if (!name) return setErr(t("login.pickName"))
    if (!pin.trim()) return setErr(t("login.needPin"))
    const r = ref?.receivers.find((x) => x.name === name)
    if (r && r.pin === pin.trim()) {
      setCaptureSession(name)
      nav("/capture", { replace: true })
    } else {
      setErr(t("login.badPin"))
      setPin("")
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col items-center gap-1 py-2">
            <img src={logoInk} alt="COPRI" className="h-10 w-auto" />
            <div className="text-sm font-semibold">{t("login.title")}</div>
            <div className="text-xs text-muted-foreground">{t("login.hint")}</div>
          </div>

          {error && !ref && <ErrorBox message={t("login.noReceivers")} onRetry={reload} />}
          {!error && !ref && <LoadingList rows={2} />}

          {ref && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{t("login.name")}</Label>
                <Select value={name} onValueChange={(v) => { setName(v); setErr("") }}>
                  <SelectTrigger className="h-12 w-full text-base">
                    <SelectValue placeholder={t("login.namePick")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ref.receivers.map((r) => (
                      <SelectItem key={r.name} value={r.name} className="py-2.5 text-base">{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cap-pin">{t("login.pin")}</Label>
                <Input id="cap-pin" type="password" dir="ltr" inputMode="numeric" maxLength={6}
                  className="h-12 text-center text-lg tracking-[0.5em]"
                  value={pin} onChange={(e) => { setPin(e.target.value); setErr("") }}
                  onKeyDown={(e) => e.key === "Enter" && enter()} />
              </div>
              {err && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{err}</div>}
              <Button className="h-12 text-base" onClick={enter}>{t("login.enter")}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
