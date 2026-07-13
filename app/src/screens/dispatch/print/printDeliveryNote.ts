/* Ported printDeliveryNote() from the legacy index.html — business-critical.
   Opens the print-ready delivery note in a new window from the VERBATIM
   TEMPLATE_HTML, injects the dispatch data + QR, duplicates the sheet into
   the 4 labeled A5 copies (driver / site engineer / plant / head office),
   and triggers print. On the plant PC Chrome runs with --kiosk-printing so
   sheets go straight to the default printer with zero dialogs; the template
   forces print-color-adjust: exact because kiosk mode can't enable
   "background graphics".

   ONE deliberate deviation from legacy: the QR is drawn with the full
   receipt URL (/dispatch/note/:id — the new router's path form) instead of
   calling the template's generateQR(base + "?note="), which built the old
   ?note= query URL. The drawing itself replicates generateQR exactly —
   same QRCode options, same "سند رقم N" label, and the same canvas REMOVAL
   before cloning (a cloned <canvas> is a blank bitmap; the <img> clones
   fine). The template string stays byte-identical to legacy. */

import i18n from "@/lib/i18n"
import { TEMPLATE_HTML } from "./template"
import type { DispatchData } from "../helpers"

// 4 labeled copies — one sheet each for the paper trail's four hands.
export const COPY_LABELS = [
  "نسخة السائق — Driver Copy",
  "نسخة مهندس الموقع — Site Engineer Copy",
  "نسخة المصنع — Plant Copy",
  "نسخة المكتب الرئيسي — Head Office Copy",
]

// Returns false when the popup was blocked (silent: no alert — the caller's
// manual button is the fallback), true when the window opened.
export function printDeliveryNote(
  data: DispatchData, receiptLink: string | null, opts?: { silent?: boolean },
): boolean {
  const w = window.open("", "_blank", "width=900,height=650")
  if (!w) {
    if (!(opts && opts.silent)) alert(i18n.t("dispatch:print.popupBlocked"))
    return false
  }
  w.document.write(TEMPLATE_HTML)
  w.document.close()

  const inject = () => {
    const d = w.document
    const set = (id: string, val: string) => { const node = d.getElementById(id); if (node) node.textContent = val }
    set("note-number", data.noteNumber || "")
    set("footer-note", data.noteNumber || "")
    set("load-number", data.loadNumber ? String(data.loadNumber) : "—")
    set("org-line", data.project)
    set("contract-display", data.contract ? `رقم العقد: ${data.contract}` : "")
    set("work-order", data.workOrder)
    set("plant", data.plant)
    set("truck", data.truckNumber)
    set("driver", data.driverName)
    set("mix-type", data.mixType)
    set("temp", `${data.tempDispatch}°م`)
    set("net-weight", data.weight)
    set("site", data.site)

    // Location label/value depends on the project's location type
    if (data.locationType === "km_range") {
      set("block-label", "من الكيلومتر"); set("block", data.block)
      set("street-label", "إلى الكيلومتر"); set("street", data.street)
    } else if (data.locationType === "named") {
      set("block-label", "اسم الشارع / الموقع"); set("block", data.block)
      set("street-label", ""); set("street", "")
    } else {
      set("block-label", "القطعة"); set("block", data.block)
      set("street-label", "الشارع"); set("street", data.street)
    }

    set("clerk-name", data.clerkName)
    set("remarks", data.remarks || "")

    const now = new Date()
    const toEN = (s: string) => s.replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 1584))
    set("date", toEN(now.toLocaleDateString("ar-KW", { timeZone: "Asia/Kuwait" })))
    set("time", toEN(now.toLocaleTimeString("ar-KW", { timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit" })))

    // QR receipt link only when a receipt flow applies (Copri loads);
    // external recipients get the sheet without it. Drawn parent-side with
    // the template window's QRCode lib — replicates generateQR() exactly,
    // but with the full /dispatch/note/:id URL as the QR text.
    try {
      if (receiptLink) {
        set("qr-note-label", "سند رقم " + (data.noteNumber || ""))
        const qrDiv = d.getElementById("qr-code")
        const QR = (w as any).QRCode
        if (qrDiv && typeof QR !== "undefined") {
          qrDiv.innerHTML = ""
          new QR(qrDiv, {
            text: receiptLink, width: 72, height: 72,
            colorDark: "#1a1a2e", colorLight: "#ffffff", correctLevel: QR.CorrectLevel.M,
          })
          // qrcodejs renders both a <canvas> and an <img> of the same code.
          // The canvas must GO (not just hide): cloneNode() copies a canvas
          // as a blank bitmap, so the copies keep only the <img>.
          const cv = qrDiv.querySelector("canvas")
          if (cv && qrDiv.querySelector("img")) cv.parentNode!.removeChild(cv)
        }
      } else {
        const qrBox = d.querySelector(".qr-box") as HTMLElement | null
        if (qrBox) qrBox.style.visibility = "hidden"
      }
    } catch { /* QR is best-effort */ }

    // 4 labeled copies via the template's own makeCopies (clones AFTER all
    // fields + QR are injected — the clones are snapshots, not live).
    try {
      const mk = (w as any).makeCopies
      if (typeof mk === "function") mk(COPY_LABELS)
    } catch { /* copies are best-effort — worst case one sheet prints */ }

    setTimeout(() => { try { w.focus(); w.print() } catch { /* window closed */ } }, 600)
  }

  if (w.document.readyState === "complete") inject()
  else w.onload = inject
  return true
}
