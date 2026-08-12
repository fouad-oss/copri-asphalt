// Per-subcontractor work-order printout — the replacement for the
// color-coded Excel forks. Arabic layout mirroring the ministry kashef
// (same header block, same columns, same totals incl. نسبة العقد),
// filtered to one sub's lines and ALLOCATED quantities.
// Same window.open + document.write + delayed print() idiom as
// grnPrint.ts / printDeliveryNote.ts.
import logoInk from "@/assets/brand/copri-logo-ink.png"

export interface SubWoLine {
  ref: string       // bab/band display id
  desc: string
  qty: number       // allocated qty
  unit: string
  rate: number
}

export interface SubWoDoc {
  contractNo: string
  contractName: string
  contractor: string     // COPRI's own label from the contract row
  pct: number
  kashefNo: number
  woNo: string           // '' while still a kashef
  location: string
  workType: string
  vendorName: string
  date: string           // display date (Kuwait)
  lines: SubWoLine[]
}

const n3 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const nq = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 })

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const CSS = `
  * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
         margin: 0; padding: 24px; color: #1A2733; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #0C2E6D; padding-bottom: 10px; }
  .head img { height: 44px; }
  .head .co { font-weight: 600; font-size: 14px; color: #0C2E6D; }
  .title { text-align: center; font-size: 16px; font-weight: 600; margin: 14px 0 4px; }
  .meta { margin: 10px 0; line-height: 1.9; }
  .meta b { display: inline-block; min-width: 110px; font-weight: 600; }
  .num { direction: ltr; unicode-bidi: isolate; font-family: "JetBrains Mono", Consolas, monospace; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #9aa4ad; padding: 4px 6px; }
  th { background: #eef1f3; font-weight: 600; }
  td.q, td.r, td.t, th.q, th.r, th.t { text-align: center; white-space: nowrap; }
  tfoot td { font-weight: 600; }
  tfoot .lbl { text-align: start; }
  .sigs { display: flex; justify-content: space-between; margin-top: 42px; padding: 0 30px; }
  .sigs div { text-align: center; width: 220px; border-top: 1px solid #1A2733; padding-top: 6px; font-weight: 600; }
  .foot { margin-top: 36px; text-align: center; color: #667; font-size: 10px; }
  @page { size: A4 portrait; margin: 10mm; }
`

export function printSubWo(doc: SubWoDoc): boolean {
  const w = window.open("", "_blank", "width=900,height=700")
  if (!w) return false

  const subtotal = doc.lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const after = subtotal * (1 + doc.pct / 100)
  const orderNo = doc.woNo || String(doc.kashefNo)
  const orderLabel = doc.woNo ? "رقم أمر العمل" : "رقم الكشف"

  const rows = doc.lines.map((l) => `
    <tr>
      <td class="q"><span class="num">${esc(l.ref)}</span></td>
      <td>${esc(l.desc)}</td>
      <td class="q"><span class="num">${nq(l.qty)}</span></td>
      <td class="q">${esc(l.unit)}</td>
      <td class="r"><span class="num">${n3(l.rate)}</span></td>
      <td class="t"><span class="num">${n3(l.qty * l.rate)}</span></td>
    </tr>`).join("")

  w.document.write(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>أمر عمل مقاول — ${esc(doc.vendorName)}</title>
<style>${CSS}</style></head><body>
  <div class="head">
    <img src="${logoInk}" alt="COPRI">
    <div>
      <div class="co">${esc(doc.contractor)}</div>
      <div>COPRI Construction Enterprises W.L.L.</div>
    </div>
  </div>
  <div class="title">أمر عمل — مقاول باطن</div>
  <div class="meta">
    <div><b>رقم العقد:</b> <span class="num">${esc(doc.contractNo)}</span></div>
    <div><b>اسم العقد:</b> ${esc(doc.contractName)}</div>
    <div><b>المقاول الفرعي:</b> ${esc(doc.vendorName)}</div>
    <div><b>موقع العمل:</b> ${esc(doc.location)}${doc.workType ? " — " + esc(doc.workType) : ""}</div>
    <div><b>${orderLabel}:</b> <span class="num">${esc(orderNo)}</span>
         &nbsp;&nbsp; <b>التاريخ:</b> <span class="num">${esc(doc.date)}</span></div>
  </div>
  <table>
    <thead><tr>
      <th class="q">باب / بند</th><th>بيان الاعمال</th><th class="q">الكمية الموزعة</th>
      <th class="q">الوحدة</th><th class="r">سعر الوحدة</th><th class="t">الاجمالي د.ك</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="5" class="lbl">الاجمالي العام حسب جدول الاسعار</td>
          <td class="t"><span class="num">${n3(subtotal)}</span></td></tr>
      <tr><td colspan="5" class="lbl">الاجمالي بعد نسبة العقد (<span class="num">+${doc.pct.toFixed(2)} %</span>)</td>
          <td class="t"><span class="num">${n3(after)}</span></td></tr>
    </tfoot>
  </table>
  <div class="sigs"><div>المتعهد</div><div>المقاول الفرعي</div></div>
  <div class="foot">COPRI Construction Enterprises W.L.L. · Founded 1969</div>
</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.print() } catch { /* user closed */ } }, 500)
  return true
}
