import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { getSession, logout, type Profile } from "@/lib/session"
import { setLang, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import logoInk from "@/assets/brand/copri-logo-ink.png"

/* Navigation by OBJECT, role-scoped (skill §navigation): no user sees a
   section they cannot act or read in. Home is role-routed. */
export function navFor(p: Profile) {
  const canDecide = p.approver || p.financeApprover || p.admin
  const items: { to: string; key: string }[] = [{ to: "/", key: "nav.home" }]
  if (canDecide || p.accountant) items.push({ to: "/approvals", key: "nav.approvals" })
  items.push({ to: "/commitments", key: "nav.commitments" })
  return items
}

export default function AppShell() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const user = getSession()
  if (!user) { nav("/login"); return null }

  const other: Lang = i18n.language === "ar" ? "en" : "ar"

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2">
          {/* Logo: small, start-aligned, once per screen (skill §brand) */}
          <img src={logoInk} alt="COPRI" className="h-7 w-auto" />
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {navFor(user).map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === "/"}
                className={({ isActive }) => cn(
                  "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
                  isActive ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
                )}>
                {t(it.key)}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => setLang(other)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">
            {other === "ar" ? "العربية" : "English"}
          </button>
          <div className="hidden text-sm text-muted-foreground sm:block">{user.name}</div>
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); nav("/login") }}>
            {t("app.logout")}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">
        <Outlet context={user} />
      </main>
    </div>
  )
}
