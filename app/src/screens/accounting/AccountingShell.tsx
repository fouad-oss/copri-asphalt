import { useEffect } from "react"
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { getSession, logout } from "@/lib/session"
import { cn } from "@/lib/utils"
import { L } from "./labels"
import logoInk from "@/assets/brand/copri-logo-ink.png"

/* ── Accounting shell — English only, LTR, no language toggle (brief
   design mandate). Nav pills grow as the rebuild lands its screens. ── */

const NAV: { to: string; label: string }[] = [
  { to: "/accounting", label: L.nav.audit },
  { to: "/accounting/po-register", label: L.nav.poRegister },
  { to: "/accounting/bundling", label: L.nav.bundling },
  { to: "/accounting/bundles", label: L.nav.bundles },
]

export default function AccountingShell() {
  const nav = useNavigate()
  const user = getSession()

  // The rebuild ships English-only screens: pin the document direction
  // regardless of any previously saved language preference.
  useEffect(() => {
    document.documentElement.lang = "en"
    document.documentElement.dir = "ltr"
  }, [])

  if (!user) return <Navigate to="/login" replace />
  if (!user.accountant && !user.admin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {L.app.noAccess}
          <Button variant="ghost" size="sm" className="mt-4 w-full"
            onClick={async () => { await logout(); nav("/login") }}>
            {L.app.logout}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div dir="ltr" className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2">
          <img src={logoInk} alt="COPRI" className="h-7 w-auto" />
          <span className="text-sm font-semibold">{L.app.title}</span>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === "/accounting"}
                className={({ isActive }) => cn(
                  "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
                  isActive ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
                )}>
                {it.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden text-sm text-muted-foreground sm:block">{user.name}</div>
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); nav("/login") }}>
            {L.app.logout}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">
        <Outlet context={user} />
      </main>
    </div>
  )
}
