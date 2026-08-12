import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
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
import SnDataPage from "@/screens/accounting/SnDataPage"

/* ── ACCOUNTING REBUILD (BRIEF-accounting-rebuild-final.md) +
   LEGACY RETIREMENT PHASE 1 (LEGACY_RETIREMENT_BRIEF.md, 2026-08-12) ──
   Exposed: the accounting section (+ login), and the three retired-from-
   legacy field flows — /dispatch (clerk + engineer home + receipt note +
   print test), /capture (materials receipt), and the two in-scope boards
   under /boards (picker + project/acct receival boards). Field portals are
   lazy siblings OUTSIDE the office guard, each with its own PIN realm.
   The remaining office sections and portals (milling, plant/exec boards,
   desks) stay unmounted — code preserved under src/screens/. ── */

const DispatchPortal = lazy(() => import("@/screens/dispatch/DispatchPortal"))
const CapturePortal = lazy(() => import("@/screens/capture/CapturePortal"))
const BoardsPortal = lazy(() => import("@/screens/boards/BoardsPortal"))
// Quantities module (QUANTITIES_MODULE_BRIEF.md) — its own Supabase-Auth
// gate inside the portal (email login, no PIN, no pipeline_users link).
const QuantitiesPortal = lazy(() => import("@/screens/quantities/QuantitiesPortal"))

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center"><Spinner className="size-6" /></div>
    }>
      {children}
    </Suspense>
  )
}

function Guard({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/sn", element: <SnDataPage /> },   // external, TOKEN access — outside the guard
  // Field portals — own PIN realms, never behind the office guard.
  { path: "/dispatch/*", element: <Lazy><DispatchPortal /></Lazy> },
  { path: "/capture/*", element: <Lazy><CapturePortal /></Lazy> },
  { path: "/boards/*", element: <Lazy><BoardsPortal /></Lazy> },
  { path: "/quantities/*", element: <Lazy><QuantitiesPortal /></Lazy> },
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
