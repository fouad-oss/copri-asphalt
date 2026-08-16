// Quantities portal shell — Supabase-Auth-only (email login, no PIN).
// Arabic-first RTL with the standard AR⇄EN toggle. Unlike the office
// portal there is no pipeline_users link requirement: any authenticated
// email account passes the gate (phase 1: the QA + Fouad). Anon/PIN
// sessions see nothing — RLS returns empty sets even if the gate were
// bypassed.
import "./i18n"
import { useEffect, useState } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { useTranslation } from "react-i18next"
import type { Session } from "@supabase/supabase-js"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { applyDir, type Lang } from "@/lib/i18n"
import LangToggle from "@/components/LangToggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import { Dashboard } from "./Dashboard"
import { ProjectSwitcher } from "./ProjectSwitcher"
import { getContract } from "./data"
import { KashefList } from "./KashefList"
import { PayCerts } from "./PayCerts"
import { PayCertNew } from "./PayCertNew"
import { PayCertDetail } from "./PayCertDetail"
import { KashefDetail } from "./KashefDetail"
import { KashefNew } from "./KashefNew"
import { TadqiqScreen } from "./TadqiqScreen"
import { Subs } from "./Subs"
import { SubDetail } from "./SubDetail"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

function LoginCard() {
  const { t } = useTranslation("quantities")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email.trim() || !password || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) toast.error(t(error.message.includes("Invalid") ? "app.badCreds" : "app.network"))
    } catch {
      toast.error(t("app.network"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={logoInk} alt="COPRI" className="h-10 w-auto" />
          <CardTitle className="mt-2 text-base">{t("app.loginTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("app.loginHint")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="qm-email">{t("app.email")}</Label>
            <Input id="qm-email" dir="ltr" autoComplete="email" value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && void submit()} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qm-pass">{t("app.password")}</Label>
            <Input id="qm-pass" dir="ltr" type="password" autoComplete="current-password" value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && void submit()} />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? <Spinner className="size-4" /> : t("app.login")}
          </Button>
          <div className="flex justify-center"><LangToggle /></div>
        </CardContent>
      </Card>
    </div>
  )
}

function Shell({ children, onProjectChange }: {
  children: React.ReactNode
  onProjectChange: (code: string) => void
}) {
  const { t } = useTranslation("quantities")
  const tabs = [
    { to: "/quantities", end: true, label: t("nav.home") },
    { to: "/quantities/list", end: false, label: t("nav.kashefs") },
    { to: "/quantities/paycerts", end: false, label: t("nav.paycerts") },
    { to: "/quantities/tadqiq", end: false, label: t("nav.tadqiq") },
    { to: "/quantities/subs", end: false, label: t("nav.subs") },
    { to: "/quantities/new", end: false, label: t("nav.newKashef") },
  ]
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <img src={logoInk} alt="COPRI" className="h-7 w-auto" />
          <div className="me-2">
            <div className="text-sm font-semibold leading-tight">{t("app.title")}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">{t("app.subtitle")}</div>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.end}
                className={({ isActive }) =>
                  cn("rounded-md px-3 py-1.5 text-sm",
                     isActive ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60")}>
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <ProjectSwitcher onChange={onProjectChange} />
            <LangToggle />
            <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut()}>
              {t("app.logout")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  )
}

export default function QuantitiesPortal() {
  const { i18n } = useTranslation("quantities")
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Switching project remounts every screen so each refetches for the
  // newly selected contract instead of showing the previous one's data.
  const [project, setProject] = useState(getContract())

  // The office/accounting shells pin the document to en/ltr; re-apply
  // the user's saved language whenever this portal is mounted.
  useEffect(() => {
    applyDir(i18n.language as Lang)
  }, [i18n.language])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="flex min-h-dvh items-center justify-center"><Spinner className="size-6" /></div>
  }
  if (!session) return <LoginCard />

  return (
    <Shell onProjectChange={setProject}>
      <Routes key={project}>
        <Route index element={<Dashboard />} />
        <Route path="list" element={<KashefList />} />
        <Route path="kashef/:id" element={<KashefDetail />} />
        <Route path="paycerts" element={<PayCerts />} />
        <Route path="paycerts/new" element={<PayCertNew />} />
        <Route path="paycerts/:id" element={<PayCertDetail />} />
        <Route path="new" element={<KashefNew />} />
        <Route path="tadqiq" element={<TadqiqScreen />} />
        <Route path="subs" element={<Subs />} />
        <Route path="subs/:vendorId" element={<SubDetail />} />
        <Route path="*" element={<Navigate to="/quantities" replace />} />
      </Routes>
    </Shell>
  )
}
