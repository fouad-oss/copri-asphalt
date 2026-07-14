import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import "@/lib/i18n"
import "./index.css"
import AppShell from "@/components/AppShell"
import { getSession } from "@/lib/session"
import Login from "@/screens/Login"
import Home from "@/screens/Home"
import DailyBatch from "@/screens/DailyBatch"
import RequestQueue from "@/screens/RequestQueue"
import PORegister from "@/screens/PORegister"
import MatchDetail from "@/screens/MatchDetail"
import NewRequest from "@/screens/NewRequest"
import ManualPO from "@/screens/ManualPO"
import GRNEntry from "@/screens/GRNEntry"
import Blankets from "@/screens/Blankets"
import Subcontracts from "@/screens/Subcontracts"
import Deliveries from "@/screens/Deliveries"
import Masters from "@/screens/Masters"
import Recharge from "@/screens/Recharge"
import SyncExport from "@/screens/SyncExport"
import AdminPanel from "@/screens/AdminPanel"
import {
  ApprovalsSection, CommitmentsSection, DeliveriesSection, MastersSection, ReportsSection,
} from "@/screens/sections"

function Guard({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />
}

/* Field/side portals (wave 3): separate auth realms outside the office
   Guard, lazy-loaded so office users never download them. */
const CapturePortal = lazy(() => import("@/screens/capture/CapturePortal"))
const DispatchPortal = lazy(() => import("@/screens/dispatch/DispatchPortal"))
const MillingPortal = lazy(() => import("@/screens/milling/MillingPortal"))
const BoardsPortal = lazy(() => import("@/screens/boards/BoardsPortal"))
const lazyEl = (C: React.ComponentType) => (
  <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">…</div>}><C /></Suspense>
)

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/capture/*", element: lazyEl(CapturePortal) },
  { path: "/dispatch/*", element: lazyEl(DispatchPortal) },
  { path: "/milling/*", element: lazyEl(MillingPortal) },
  { path: "/boards/*", element: lazyEl(BoardsPortal) },
  {
    path: "/",
    element: <Guard><AppShell /></Guard>,
    children: [
      { index: true, element: <Home /> },
      {
        path: "approvals", element: <ApprovalsSection />,
        children: [
          { index: true, element: <DailyBatch /> },
          { path: "requests", element: <RequestQueue /> },
        ],
      },
      {
        path: "commitments", element: <CommitmentsSection />,
        children: [
          { index: true, element: <PORegister /> },
          { path: "blankets", element: <Blankets /> },
          { path: "subs", element: <Subcontracts /> },
          { path: "new", element: <NewRequest /> },
          { path: "manual", element: <ManualPO /> },
          { path: ":id", element: <MatchDetail /> },
        ],
      },
      {
        path: "deliveries", element: <DeliveriesSection />,
        children: [
          { index: true, element: <Deliveries /> },
          { path: "grn", element: <GRNEntry /> },
        ],
      },
      {
        path: "masters", element: <MastersSection />,
        children: [
          { index: true, element: <Masters kind="vendors" /> },
          { path: "items", element: <Masters kind="items" /> },
          { path: "ccs", element: <Masters kind="ccs" /> },
        ],
      },
      {
        path: "reports", element: <ReportsSection />,
        children: [
          { index: true, element: <SyncExport /> },
          { path: "recharge", element: <Recharge /> },
        ],
      },
      { path: "admin", element: <AdminPanel /> },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-center" />
  </StrictMode>,
)

