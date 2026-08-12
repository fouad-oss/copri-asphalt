/* Dispatch portal — the clerk dispatch module + engineer receipt
   confirmation, migrated from the legacy index.html (/dispatch route and
   ?note= / ?printTest=1 flows). Field realm: its own PIN sessions, outside
   the office login guard. Routed at /dispatch/* by main.tsx; sub-paths are
   relative here.

     /dispatch             clerk flow (PIN → company/project → form → print)
     /dispatch/engineer    engineer home (legacy ?role=engineer — today's
                           receipts + in-transit loads)
     /dispatch/note/:id    engineer receipt confirmation (one-time link)
     /dispatch/print-test  printer calibration — no PIN, no DB write */

import "./i18n"
import { Route, Routes } from "react-router-dom"
import { RefContext, useDispatchRefProvider } from "./reference"
import ClerkFlow from "./ClerkFlow"
import EngineerHome from "./EngineerHome"
import ReceiptNote from "./ReceiptNote"
import PrintTest from "./PrintTest"

export default function DispatchPortal() {
  const refValue = useDispatchRefProvider()
  return (
    // CAPTURE screens run field density: 16px body, 48px touch targets.
    <div className="density-field">
      <RefContext.Provider value={refValue}>
        <Routes>
          <Route index element={<ClerkFlow />} />
          <Route path="engineer" element={<EngineerHome />} />
          <Route path="note/:id" element={<ReceiptNote />} />
          <Route path="print-test" element={<PrintTest />} />
        </Routes>
      </RefContext.Provider>
    </div>
  )
}
