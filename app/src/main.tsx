import { StrictMode } from "react"
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

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
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
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-center" />
  </StrictMode>,
)
