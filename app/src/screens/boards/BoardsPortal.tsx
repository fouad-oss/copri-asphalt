import { Navigate, Outlet, Route, Routes } from "react-router-dom"
import { useTranslation } from "react-i18next"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import LangToggle from "@/components/LangToggle"
import "./i18n"
import HomeBoard from "./HomeBoard"
import ProjectBoard from "./ProjectBoard"
import AcctBoard from "./AcctBoard"

/* ── Boards portal (/boards/*) — migration of the legacy ?dash boards.
   Boards stay ungated like the legacy ?dash URLs (PIN gate deferred).

   LEGACY RETIREMENT PHASE 1 (2026-08-12): only the two retired boards are
   routed — project/:proj (asphalt receivals) and acct/:proj (accountant
   materials receivals) + the picker they need. PlantBoard, ExecBoard and
   the two desks (PlantDesk / FinanceDesk) stay UNROUTED this phase: their
   legacy counterparts (?dash=plant, ?plantRole, ?financeRole) remain the
   live surfaces. Restore their routes + imports when those migrate. ── */

function Shell() {
  const { t } = useTranslation("boards")
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <img src={logoInk} alt="COPRI" className="h-7" />
          <span className="text-sm font-semibold">{t("title")}</span>
          <LangToggle className="ms-auto" />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 pb-10">
        <Outlet />
      </main>
    </div>
  )
}

export default function BoardsPortal() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomeBoard />} />
        <Route path="project/:proj" element={<ProjectBoard />} />
        <Route path="acct/:proj" element={<AcctBoard />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Route>
    </Routes>
  )
}
