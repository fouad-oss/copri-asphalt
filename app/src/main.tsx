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
import PORegister from "@/screens/PORegister"
import MatchDetail from "@/screens/MatchDetail"
import RequestQueue from "@/screens/RequestQueue"

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
      { path: "approvals", element: <DailyBatch /> },
      { path: "approvals/requests", element: <RequestQueue /> },
      { path: "commitments", element: <PORegister /> },
      { path: "commitments/:id", element: <MatchDetail /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-center" />
  </StrictMode>,
)
