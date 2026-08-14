// Payment-certificate printout — mirrors the ministry's own form: one
// «كشف تنفيذي جزئي (N)» sheet per work order, same header block, same
// eight columns (باب/بند · بيان الأعمال · الكمية · الوحدة · سعر وحدة ·
// الإجمالي · اجمالي الكمية المتبقية · نسبة), same four-signature panel
// and صفحة x/y footer. Layout checked against
// «الدفعة الشهرية رقم (3) … 05-02-2025.pdf».
// Same window.open + write + delayed print() idiom as subPrint.ts.

export interface CertPrintLine {
  ref: string          // bab/band as printed
  desc: string
  qty: number          // this payment's quantity (الكمية)
  unit: string
  rate: number
  remaining: number    // اجمالي الكمية المتبقية
}

export interface CertPrintWo {
  woNo: string
  site: string         // موقع العمل
  woDate: string | null
  durationDays: number | null
  endDate: string | null
  dailyPenalty: number | null
  woValue: number      // قيمة أمر عمل + أمر تعديل (after نسبة العقد)
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
  fiscalYear: string
  wos: CertPrintWo[]
}

const n3 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const nq = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const CSS = `
  * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
         margin: 0; color: #000; font-size: 11px; }
  .sheet { padding: 10mm; page-break-after: always; position: relative; min-height: 277mm; }
  .sheet:last-child { page-break-after: auto; }
  .gov { text-align: center; line-height: 1.5; }
  .gov .m1 { font-size: 15px; font-weight: 600; }
  .gov .m2 { font-size: 12px; }
  .gov .title { font-size: 17px; font-weight: 600; margin-top: 4px; }
  .wo-tag { color: #C00000; font-weight: 600; }
  .topline { display: flex; justify-content: space-between; align-items: flex-end;
             font-size: 11px; margin-top: 6px; }
  .hdrbox { border: 1px solid #000; margin-top: 6px; }
  .hdrbox table { width: 100%; border-collapse: collapse; }
  .hdrbox td { padding: 2px 6px; vertical-align: top; }
  .lbl { font-weight: 600; white-space: nowrap; }
  .num { direction: ltr; unicode-bidi: isolate; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.items th, table.items td { border: 1px solid #000; padding: 3px 4px; }
  table.items th { font-weight: 600; text-align: center; font-size: 10px; }
  table.items td.c { text-align: center; white-space: nowrap; }
  table.items td.d { text-align: start; }
  .sigs { border: 1px solid #000; border-collapse: collapse; width: 100%; margin-top: 10px; }
  .sigs td { border: 1px solid #000; padding: 4px 6px; height: 34px; }
  .sigs td.h { text-align: center; font-weight: 600; height: auto; }
  .sigs td.k { width: 90px; font-weight: 600; }
  .pageno { margin-top: 8px; font-size: 10px; }
  @page { size: A4 portrait; margin: 0; }
`

function headerBlock(doc: CertPrintDoc, wo: CertPrintWo): string {
  return `
  <div class="gov">
    <div class="m1">وزارة الأشغال العامة</div>
    <div class="m2">قطاع هندسة الصيانة</div>
    <div class="title">كشف تنفيذي جزئي (<span class="num">${doc.certNo}</span>)</div>
  </div>
  <div class="topline">
    <div>التاريخ: <span class="num">${esc(doc.date)}</span></div>
    <div class="wo-tag">أمر عمل رقم (<span class="num">${esc(wo.woNo)}</span>)</div>
    <div>رقم العقد : <span class="num">${esc(doc.contractNo)}</span></div>
  </div>
  <div style="text-align:center;font-size:11px">إدارة صيانة طرق وشبكات محافظة حولى</div>
  <div class="hdrbox"><table>
    <tr><td class="lbl">إسم العقد :</td><td colspan="3">${esc(doc.contractName)}</td></tr>
    <tr><td class="lbl">المتعهد :</td><td colspan="3">${esc(doc.contractor)}</td></tr>
    <tr><td class="lbl">موقع العمل :</td><td colspan="3">${esc(wo.site)}</td></tr>
    <tr>
      <td class="lbl">مدة تنفيذ الأعمال :</td>
      <td><span class="num">${wo.durationDays ?? "—"}</span> يوم</td>
      <td>من <span class="num">${esc(wo.woDate || "—")}</span></td>
      <td>إلى <span class="num">${esc(wo.endDate || "—")}</span></td>
    </tr>
    <tr>
      <td class="lbl">الغرامة اليومية :</td>
      <td><span class="num">${wo.dailyPenalty != null ? n3(wo.dailyPenalty) : "—"}</span> د.ك</td>
      <td class="lbl">العام المالي:</td><td><span class="num">${esc(doc.fiscalYear)}</span></td>
    </tr>
    <tr><td class="lbl">الجهة المستفيدة :</td><td colspan="3">وزارة الاشغال العامة</td></tr>
    <tr>
      <td class="lbl">حالة الكشف التنفيذي الجزئي :</td><td>اعتماد قسم الاشراف</td>
      <td class="lbl">قيمة أمر عمل + أمر تعديل:</td>
      <td><span class="num">${n3(wo.woValue)}</span> د.ك</td>
    </tr>
    ${doc.periodEnd ? `<tr><td class="lbl">للأعمال حتى تاريخ :</td>
      <td colspan="3"><span class="num">${esc(doc.periodEnd)}</span></td></tr>` : ""}
  </table></div>`
}

const SIGS = `
  <table class="sigs">
    <tr><td class="k"></td><td class="h">حاسب الكميات</td><td class="h">المهندس المشرف</td><td class="h">المتعهد</td></tr>
    <tr><td class="k">الإســـم :</td><td></td><td></td><td></td></tr>
    <tr><td class="k">التوقيــع :</td><td></td><td></td><td></td></tr>
    <tr><td class="k"></td><td class="h" colspan="2">رئيس قسم الإشراف</td><td class="h">مدير الإدارة</td></tr>
    <tr><td class="k">الإســـم :</td><td colspan="2"></td><td></td></tr>
    <tr><td class="k">التوقيــع :</td><td colspan="2"></td><td></td></tr>
  </table>`

const ROWS_PER_PAGE = 9   // matches the ministry's own pagination

export function printCert(doc: CertPrintDoc): boolean {
  const w = window.open("", "_blank", "width=960,height=760")
  if (!w) return false

  // paginate each WO exactly like the ministry sheets: N rows per page,
  // header + signature panel repeated, "صفحة i/total" per work order.
  const sheets: string[] = []
  for (const wo of doc.wos) {
    const pages: CertPrintLine[][] = []
    for (let i = 0; i < wo.lines.length; i += ROWS_PER_PAGE) {
      pages.push(wo.lines.slice(i, i + ROWS_PER_PAGE))
    }
    if (pages.length === 0) pages.push([])
    pages.forEach((chunk, idx) => {
      const rows = chunk.map((l) => `
        <tr>
          <td class="c"><span class="num">${esc(l.ref)}</span></td>
          <td class="d">${esc(l.desc)}</td>
          <td class="c"><span class="num">${nq(l.qty)}</span></td>
          <td class="c">${esc(l.unit)}</td>
          <td class="c"><span class="num">${n3(l.rate)}</span></td>
          <td class="c"><span class="num">${n3(l.qty * l.rate)}</span></td>
          <td class="c"><span class="num">${nq(l.remaining)}</span></td>
          <td class="c">Y</td>
        </tr>`).join("")
      const isLast = idx === pages.length - 1
      const subtotal = wo.lines.reduce((s, l) => s + l.qty * l.rate, 0)
      sheets.push(`
      <div class="sheet">
        ${headerBlock(doc, wo)}
        <table class="items">
          <thead><tr>
            <th style="width:58px">باب / بند</th><th>بيان الأعمال</th>
            <th style="width:64px">الكمية</th><th style="width:42px">الوحدة</th>
            <th style="width:58px">سعر وحدة</th><th style="width:72px">الإجمالي (د.ك)</th>
            <th style="width:78px">اجمالي الكمية المتبقية</th><th style="width:32px">نسبة</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          ${isLast ? `<tfoot>
            <tr><td colspan="5" style="text-align:start;font-weight:600">اجمالي أمر العمل (د.ك)</td>
                <td class="c" style="font-weight:600"><span class="num">${n3(subtotal)}</span></td>
                <td colspan="2"></td></tr>
          </tfoot>` : ""}
        </table>
        ${SIGS}
        <div class="pageno">صفحة <span class="num">${idx + 1}/${pages.length}</span></div>
      </div>`)
    })
  }

  const grand = doc.wos.reduce((s, wo) => s + wo.lines.reduce((x, l) => x + l.qty * l.rate, 0), 0)
  const summaryRows = doc.wos.map((wo) => {
    const sub = wo.lines.reduce((s, l) => s + l.qty * l.rate, 0)
    return `<tr>
      <td class="c"><span class="num">${esc(wo.woNo)}</span></td>
      <td class="d">${esc(wo.site)}</td>
      <td class="c"><span class="num">${wo.lines.length}</span></td>
      <td class="c"><span class="num">${n3(sub)}</span></td>
    </tr>`
  }).join("")

  w.document.write(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>الدفعة الشهرية رقم ${doc.certNo}</title>
<style>${CSS}</style></head><body>
  <div class="sheet">
    <div class="gov">
      <div class="m1">وزارة الأشغال العامة</div>
      <div class="m2">قطاع هندسة الصيانة</div>
      <div class="title">الدفعة الشهرية رقم (<span class="num">${doc.certNo}</span>)</div>
    </div>
    <div class="topline">
      <div>التاريخ: <span class="num">${esc(doc.date)}</span></div>
      <div>رقم العقد : <span class="num">${esc(doc.contractNo)}</span></div>
    </div>
    <div class="hdrbox"><table>
      <tr><td class="lbl">إسم العقد :</td><td>${esc(doc.contractName)}</td></tr>
      <tr><td class="lbl">المتعهد :</td><td>${esc(doc.contractor)}</td></tr>
      ${doc.periodEnd ? `<tr><td class="lbl">للأعمال حتى تاريخ :</td>
        <td><span class="num">${esc(doc.periodEnd)}</span></td></tr>` : ""}
      <tr><td class="lbl">عدد أوامر العمل :</td><td><span class="num">${doc.wos.length}</span></td></tr>
    </table></div>
    <table class="items">
      <thead><tr><th style="width:70px">أمر عمل</th><th>موقع العمل</th>
        <th style="width:60px">عدد البنود</th><th style="width:110px">الإجمالي (د.ك)</th></tr></thead>
      <tbody>${summaryRows}</tbody>
      <tfoot>
        <tr><td colspan="3" style="text-align:start;font-weight:600">الاجمالي العام حسب جدول الاسعار</td>
            <td class="c" style="font-weight:600"><span class="num">${n3(grand)}</span></td></tr>
        <tr><td colspan="3" style="text-align:start;font-weight:600">الاجمالي بعد نسبة العقد
            (<span class="num">+${doc.pct.toFixed(2)}%</span>)</td>
            <td class="c" style="font-weight:600"><span class="num">${n3(grand * (1 + doc.pct / 100))}</span></td></tr>
      </tfoot>
    </table>
    ${SIGS}
  </div>
  ${sheets.join("")}
</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.print() } catch { /* user closed */ } }, 600)
  return true
}
