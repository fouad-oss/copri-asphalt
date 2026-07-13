import { Navigate, Outlet, Route, Routes } from "react-router-dom"
import { useTranslation } from "react-i18next"
import logoInk from "@/assets/brand/copri-logo-ink.png"
import "./i18n"
import HomeBoard from "./HomeBoard"
import PlantBoard from "./PlantBoard"
import ProjectBoard from "./ProjectBoard"
import ExecBoard from "./ExecBoard"
import AcctBoard from "./AcctBoard"
import PlantDesk from "./PlantDesk"
import FinanceDesk from "./FinanceDesk"

/* ── Boards portal (/boards/*) — migration of the legacy ?dash boards +
   plant-manager and finance desks. Boards stay ungated like the legacy
   ?dash URLs (PIN gate deferred); the desks keep their interim PIN
   against plant_managers / finance_managers until the auth phase. ── */

function Shell() {
  const { t } = useTranslation("boards")
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <img src={logoInk} alt="COPRI" className="h-7" />
          <span className="text-sm font-semibold">{t("title")}</span>
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
        <Route path="plant" element={<PlantBoard />} />
        <Route path="exec" element={<ExecBoard />} />
        <Route path="project/:proj" element={<ProjectBoard />} />
        <Route path="acct/:proj" element={<AcctBoard />} />
        <Route path="desk/plant" element={<PlantDesk />} />
        <Route path="desk/finance" element={<FinanceDesk />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Route>
    </Routes>
  )
}
