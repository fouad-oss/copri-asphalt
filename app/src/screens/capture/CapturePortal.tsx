import "./i18n"
import { useEffect } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { getCaptureSession } from "./session"
import { initQueueSync } from "./queue"
import CaptureLogin from "./CaptureLogin"
import CaptureHome from "./CaptureHome"
import NewReceipt from "./NewReceipt"

/* On-site materials-receipt portal (/capture/*) — its own auth realm
   outside the office guard, field density root (16px / 48px targets),
   offline-first queue started once for the whole portal. */

function Guard({ children }: { children: React.ReactNode }) {
  return getCaptureSession() ? <>{children}</> : <Navigate to="/capture/login" replace />
}

export default function CapturePortal() {
  useEffect(() => { initQueueSync() }, [])
  return (
    <div className="density-field min-h-dvh bg-background text-base text-foreground">
      <Routes>
        <Route index element={<Guard><CaptureHome /></Guard>} />
        <Route path="new" element={<Guard><NewReceipt /></Guard>} />
        <Route path="login" element={<CaptureLogin />} />
        <Route path="*" element={<Navigate to="/capture" replace />} />
      </Routes>
    </div>
  )
}
