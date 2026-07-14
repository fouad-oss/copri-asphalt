import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import "@/lib/i18n"
import "./index.css"
import { getSession } from "@/lib/session"
import Login from "@/screens/Login"
import AccountingShell from "@/screens/accounting/AccountingShell"
import AuditQueue from "@/screens/accounting/AuditQueue"
import PoRegister from "@/screens/accounting/PoRegister"
import Bundling from "@/screens/accounting/Bundling"
import BundlesList from "@/screens/accounting/BundlesList"
import BundleDetail from "@/screens/accounting/BundleDetail"
import GrnScreen from "@/screens/accounting/GrnScreen"

/* ── ACCOUNTING REBUILD (BRIEF-accounting-rebuild-final.md) ───────────
   This deploy exposes ONLY the accounting section (+ login). The other
   office sections and the field portals (waves 1–3) are unmounted but
   preserved under src/screens/ — restore their routes from git history
   (tag full-build-2026-07) when their tracks resume. Field roles keep
   using the legacy app at the site root. ── */

function Guard({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/accounting",
    element: <Guard><AccountingShell /></Guard>,
    children: [
      { index: true, element: <AuditQueue /> },
      { path: "po-register", element: <PoRegister /> },
      { path: "bundling", element: <Bundling /> },
      { path: "bundles", element: <BundlesList /> },
      { path: "bundles/:id", element: <BundleDetail /> },
      { path: "grn", element: <GrnScreen /> },
    ],
  },
  { path: "*", element: <Navigate to="/accounting" replace /> },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-center" />
  </StrictMode>,
)
