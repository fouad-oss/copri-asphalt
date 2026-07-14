import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginEmail, loginPin } from "@/lib/session"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import LangToggle from "@/components/LangToggle"

export default function Login() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [pin, setPin] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setErr(""); setBusy(true)
    try { await fn(); nav("/") }
    catch (e: any) {
      const key = ["badCreds", "badPin", "pinRetired", "notEnabled", "notLinked"].includes(e?.message)
        ? e.message === "notLinked" ? "notEnabled" : e.message
        : "network"
      setErr(t(`login.${key}`))
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          {/* Login carries the logo + tagline — nowhere else (skill §brand) */}
          <div className="flex justify-end"><LangToggle /></div>
          <div className="flex flex-col items-center gap-1 py-2">
            <img src={logoInk} alt="COPRI" className="h-10 w-auto" />
            <div className="text-xs text-muted-foreground">{t("app.tagline")}</div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("login.email")}</Label>
            <Input id="email" type="email" dir="ltr" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pass">{t("login.password")}</Label>
            <Input id="pass" type="password" dir="ltr" autoComplete="current-password"
              value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && run(() => loginEmail(email.trim(), pass))} />
          </div>
          {err && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{err}</div>}
          <Button disabled={busy || !email.trim() || !pass}
            onClick={() => run(() => loginEmail(email.trim(), pass))}>
            {t("login.signIn")}
          </Button>

          <button type="button" className="text-xs text-muted-foreground underline"
            onClick={() => setShowPin(!showPin)}>
            {t("login.pinToggle")}
          </button>
          {showPin && (
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="pin">{t("login.pin")}</Label>
                <Input id="pin" type="password" dir="ltr" inputMode="numeric" maxLength={6}
                  value={pin} onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pin && !busy && run(() => loginPin(pin.trim()))} />
              </div>
              <Button variant="secondary" disabled={busy || !pin.trim()}
                onClick={() => run(() => loginPin(pin.trim()))}>
                {t("login.pinSignIn")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
