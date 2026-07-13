import { Route, Routes } from "react-router-dom"
import "./i18n" // registers the "milling" bundle on the shared i18n instance
import EngineerPortal from "./EngineerPortal"
import PMPortal from "./PMPortal"
import MarcoPortal from "./MarcoPortal"
import ReportView from "./ReportView"

/* ── Milling module entry, routed at /milling/* (main.tsx):
     /milling            engineer portal (PIN → my programs + new submission)
     /milling/pm         PM approval queue (approve / reject + reason)
     /milling/marco      Marco scheduling board (schedule / start)
     /milling/report/:id PUBLIC printable program report — no PIN
   Legacy equivalents: ?millingRole=engineer|pm|marco, ?millingReport=ID. ── */

export default function MillingPortal() {
  return (
    <Routes>
      <Route index element={<EngineerPortal />} />
      <Route path="engineer" element={<EngineerPortal />} />
      <Route path="pm" element={<PMPortal />} />
      <Route path="marco" element={<MarcoPortal />} />
      <Route path="report/:id" element={<ReportView />} />
    </Routes>
  )
}
