// Payment-certificate printout (دفعة شهرية) — Arabic layout with one
// section per work order (باب/بند, بيان, الكمية, الوحدة, السعر, الإجمالي)
// and the grand totals incl. نسبة العقد. Same window.open + write +
// delayed print() idiom as subPrint.ts.
import logoInk from "@/assets/brand/copri-logo-ink.png"

export interface CertPrintLine {
  ref: string
  desc: string
  qty: number
  unit: string
  rate: number
}

export interface CertPrintWo {
  woNo: string
  location: string
  lines: CertPrintLine[]
}

export interface CertPrintDoc {
  contractNo: string
  contractName: string
  contractor: string
  pct: number
  certNo: number
  periodEnd: string | null
  date: string
  wos: CertPrintWo[]
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
  .wo-head { margin: 18px 0 2px; font-weight: 600; font-size: 13px;
             border-inline-start: 4px solid #0C2E6D; padding-inline-start: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #9aa4ad; padding: 4px 6px; }
  th { background: #eef1f3; font-weight: 600; }
  td.q, td.r, td.t, th.q, th.r, th.t { text-align: center; white-space: nowrap; }
  .wo-total td { font-weight: 600; background: #f6f7f8; }
  .grand { margin-top: 16px; }
  .grand td { font-weight: 600; }
  .grand .lbl { text-align: start; }
  .sigs { display: flex; justify-content: space-between; margin-top: 42px; padding: 0 30px; }
  .sigs div { text-align: center; width: 220px; border-top: 1px solid #1A2733; padding-top: 6px; font-weight: 600; }
  .foot { margin-top: 36px; text-align: center; color: #667; font-size: 10px; }
  @page { size: A4 portrait; margin: 10mm; }
`

export function printCert(doc: CertPrintDoc): boolean {
  const w = window.open("", "_blank", "width=900,height=700")
  if (!w) return false

  const grand = doc.wos.reduce((s, wo) => s + wo.lines.reduce((x, l) => x + l.qty * l.rate, 0), 0)
  const after = grand * (1 + doc.pct / 100)

  const sections = doc.wos.map((wo) => {
    const sub = wo.lines.reduce((s, l) => s + l.qty * l.rate, 0)
    const rows = wo.lines.map((l) => `
      <tr>
        <td class="q"><span class="num">${esc(l.ref)}</span></td>
        <td>${esc(l.desc)}</td>
        <td class="q"><span class="num">${nq(l.qty)}</span></td>
        <td class="q">${esc(l.unit)}</td>
        <td class="r"><span class="num">${n3(l.rate)}</span></td>
        <td class="t"><span class="num">${n3(l.qty * l.rate)}</span></td>
      </tr>`).join("")
    return `
    <div class="wo-head">أمر عمل رقم <span class="num">${esc(wo.woNo)}</span>${wo.location ? " — " + esc(wo.location) : ""}</div>
    <table>
      <thead><tr>
        <th class="q">باب / بند</th><th>بيان الاعمال</th><th class="q">الكمية</th>
        <th class="q">الوحدة</th><th class="r">سعر الوحدة</th><th class="t">الاجمالي د.ك</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="wo-total"><td colspan="5">اجمالي أمر العمل</td>
        <td class="t"><span class="num">${n3(sub)}</span></td></tr></tfoot>
    </table>`
  }).join("")

  w.document.write(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>الدفعة الشهرية رقم ${doc.certNo}</title>
<style>${CSS}</style></head><body>
  <div class="head">
    <img src="${logoInk}" alt="COPRI">
    <div>
      <div class="co">${esc(doc.contractor)}</div>
      <div>COPRI Construction Enterprises W.L.L.</div>
    </div>
  </div>
  <div class="title">الدفعة الشهرية رقم (<span class="num">${doc.certNo}</span>)</div>
  <div class="meta">
    <div><b>رقم العقد:</b> <span class="num">${esc(doc.contractNo)}</span></div>
    <div><b>اسم العقد:</b> ${esc(doc.contractName)}</div>
    ${doc.periodEnd ? `<div><b>للأعمال حتى تاريخ:</b> <span class="num">${esc(doc.periodEnd)}</span></div>` : ""}
    <div><b>تاريخ الطباعة:</b> <span class="num">${esc(doc.date)}</span></div>
  </div>
  ${sections}
  <table class="grand">
    <tr><td class="lbl">الاجمالي العام حسب جدول الاسعار</td>
        <td class="t" style="width:160px"><span class="num">${n3(grand)}</span></td></tr>
    <tr><td class="lbl">الاجمالي بعد نسبة العقد (<span class="num">+${doc.pct.toFixed(2)} %</span>)</td>
        <td class="t"><span class="num">${n3(after)}</span></td></tr>
  </table>
  <div class="sigs"><div>المتعهد</div><div>الاستشاري / الوزارة</div></div>
  <div class="foot">COPRI Construction Enterprises W.L.L. · Founded 1969</div>
</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.print() } catch { /* user closed */ } }, 500)
  return true
}
