import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { linkExisting, signUpWithPin } from "@/lib/session"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import LangToggle from "@/components/LangToggle"

/* ── PIN-gated sign-up (0070) ──
   An office user turns their pipeline PIN into a real email login.
   "link" mode covers the two straggler paths: an account the admin
   created in the dashboard, and a fresh sign-up that had to confirm
   its email first (no session until confirmed). */

export default function SignUp() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [mode, setMode] = useState<"new" | "link">("new")
  const [pin, setPin] = useState("")
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [pass2, setPass2] = useState("")
  const [err, setErr] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  const ready = pin.trim() && email.trim() && pass.length >= 8 && (mode === "link" || pass === pass2)

  async function submit() {
    setErr(""); setNotice("")
    if (mode === "new" && pass !== pass2) { setErr(t("signup.mismatch")); return }
    if (pass.length < 8) { setErr(t("signup.short")); return }
    setBusy(true)
    try {
      if (mode === "new") {
        const p = await signUpWithPin(email.trim(), pass, pin.trim())
        if (p === null) { setNotice(t("signup.confirmSent")); setMode("link") }
        else nav("/")
      } else {
        await linkExisting(email.trim(), pass, pin.trim())
        nav("/")
      }
    } catch (e: any) {
      const key = ["badPin", "pinUsed", "emailTaken", "badCreds", "notEnabled", "signupFailed"]
        .includes(e?.message) ? e.message : "network"
      setErr(t(`signup.${key}`))
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex justify-end"><LangToggle /></div>
          <div className="flex flex-col items-center gap-1 py-2">
            <img src={logoInk} alt="COPRI" className="h-10 w-auto" />
            <div className="text-xs text-muted-foreground">{t("signup.title")}</div>
          </div>
          <p className="text-xs text-muted-foreground">{t("signup.intro")}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="su-pin">{t("signup.pin")}</Label>
            <Input id="su-pin" type="password" dir="ltr" inputMode="numeric" maxLength={6}
              value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="su-email">{t("login.email")}</Label>
            <Input id="su-email" type="email" dir="ltr" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="su-pass">{t("login.password")}</Label>
            <Input id="su-pass" type="password" dir="ltr"
              autoComplete={mode === "new" ? "new-password" : "current-password"}
              value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          {mode === "new" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="su-pass2">{t("signup.confirm")}</Label>
              <Input id="su-pass2" type="password" dir="ltr" autoComplete="new-password"
                value={pass2} onChange={(e) => setPass2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ready && !busy && submit()} />
            </div>
          )}

          {notice && <div className="rounded-md bg-secondary p-2 text-sm">{notice}</div>}
          {err && <div className="rounded-md bg-danger-surface p-2 text-sm text-danger">{err}</div>}
          <Button disabled={busy || !ready} onClick={submit}>
            {mode === "new" ? t("signup.create") : t("signup.link")}
          </Button>

          <button type="button" className="text-xs text-muted-foreground underline"
            onClick={() => { setErr(""); setMode(mode === "new" ? "link" : "new") }}>
            {mode === "new" ? t("signup.toLink") : t("signup.toNew")}
          </button>
          <Link to="/login" className="text-center text-xs text-muted-foreground underline">
            {t("signup.toLogin")}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
