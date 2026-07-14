import logoInk from "@/assets/brand/copri-logo-ink.png"
import { L } from "./labels"
import type { BundleDetailData, GrnNoteDetail } from "./data"

/* ── GRN print documents ──────────────────────────────────────────────
   English, print-clean, in the delivery-note template's visual language
   (bordered field boxes, signature blocks, logo header). Every sheet
   carries the disclaimer — this is a COPRI supporting document and must
   never read like SN's Stock_Receipt records. Numbers arrive already
   minted (GRN-C-####, registered per target). ── */

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Inter, 'Segoe UI', Arial, sans-serif; color: #1A2733; background: #fff; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .doc { width: 100%; border: 2px solid #1A2733; padding: 8px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1A2733; padding-bottom: 6px; margin-bottom: 8px; }
  .head img { height: 32px; }
  .head .title { text-align: center; flex: 1; }
  .head .title .main { font-size: 13pt; font-weight: 700; }
  .head .title .sub { font-size: 7.5pt; color: #555; margin-top: 2px; }
  .head .no { text-align: right; border: 2px solid #1A2733; padding: 4px 10px; min-width: 110px; }
  .head .no .lbl { font-size: 7pt; color: #555; }
  .head .no .num { font-size: 12pt; font-weight: 700; font-family: 'JetBrains Mono', Consolas, monospace; color: #00833E; }
  .row { display: flex; gap: 5px; margin-bottom: 5px; }
  .f { flex: 1; border: 1px solid #999; padding: 4px 6px; }
  .f .lbl { font-size: 6.5pt; color: #555; font-weight: 600; border-bottom: 1px solid #ddd; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .03em; }
  .f .val { font-size: 10pt; font-weight: 600; min-height: 14px; }
  .f.wide { flex: 2; }
  .mono { font-family: 'JetBrains Mono', Consolas, monospace; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
  th { background: #F5F6F7; border: 1px solid #999; padding: 4px 6px; font-weight: 700; text-align: left; }
  td { border: 1px solid #bbb; padding: 3.5px 6px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #FAFAF8; }
  .sigs { display: flex; gap: 8px; border-top: 1px solid #1A2733; padding-top: 6px; margin-top: 6px; }
  .sig { flex: 1; border: 1px solid #999; text-align: center; padding: 4px; min-height: 62px; display: flex; flex-direction: column; justify-content: space-between; }
  .sig .lbl { font-size: 7.5pt; font-weight: 700; background: #0C2E6D; color: #fff; padding: 3px; margin: -4px -4px 4px -4px; }
  .sig .name { font-size: 8pt; color: #333; }
  .sig .line { border-bottom: 1px solid #999; margin: 0 10px; height: 20px; }
  .foot { text-align: center; font-size: 7pt; color: #777; border-top: 1px solid #ddd; margin-top: 5px; padding-top: 4px; }
  @media screen { body { background: #eaeae6; padding: 20px; } .doc { max-width: 820px; margin: 0 auto 20px; background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,.15); } }
  @media print { body { background: #fff; } }`

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
const field = (lbl: string, val: unknown, opts?: { wide?: boolean; mono?: boolean }) =>
  `<div class="f${opts?.wide ? " wide" : ""}"><div class="lbl">${esc(lbl)}</div>` +
  `<div class="val${opts?.mono ? " mono" : ""}">${esc(val) || "—"}</div></div>`
const head = (grnNo: string) =>
  `<div class="head"><img src="${logoInk}" alt="COPRI"/>` +
  `<div class="title"><div class="main">${esc(L.grn.title)}</div><div class="sub">${esc(L.grn.disclaimer)}</div></div>` +
  `<div class="no"><div class="lbl">${esc(L.grn.fGrnNo)}</div><div class="num">${esc(grnNo)}</div></div></div>`
const sigs = (engineer: string) =>
  `<div class="sigs">` +
  `<div class="sig"><div class="lbl">${esc(L.grn.sigEngineer)}</div><div class="name">${esc(engineer) || "&nbsp;"}</div><div class="line"></div></div>` +
  `<div class="sig"><div class="lbl">${esc(L.grn.sigAccountant)}</div><div class="name">&nbsp;</div><div class="line"></div></div>` +
  `</div>`
const foot = `<div class="foot">${esc(L.grn.footerLine)}</div>`

export function noteSheet(grnNo: string, d: GrnNoteDetail): string {
  return `<div class="sheet"><div class="doc">
    ${head(grnNo)}
    <div class="row">
      ${field(L.grn.fDnNo, d.noteNo, { mono: true })}
      ${field(L.grn.fDate, d.date, { mono: true })}
      ${field(L.grn.fProject, d.project, { wide: true })}
    </div>
    <div class="row">
      ${field(L.grn.fSite, d.site, { wide: true })}
      ${field(L.grn.fPo, d.po, { mono: true })}
      ${field(L.grn.fSupplier, d.supplier, { wide: true })}
    </div>
    <div class="row">
      ${field(L.grn.fItem, d.item, { wide: true })}
      ${field(L.grn.fQty, d.qty)}
      ${field(L.grn.fUnit, d.unit)}
      ${field(d.extra === "wo" ? L.grn.fWo : L.grn.fSubcontractor, d.extraValue)}
    </div>
    ${sigs(d.engineer)}
    ${foot}
  </div></div>`
}

export function bundleSheet(grnNo: string, b: BundleDetailData): string {
  const f = b.rows[0]
  const qty = b.rows.reduce((s, r) => s + Number(r.qty || 0), 0)
  const amount = b.rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  return `<div class="sheet"><div class="doc">
    ${head(grnNo)}
    <div class="row">
      ${field(L.grn.fBundle, b.bundleNo + (b.status === "published" ? "" : ` (${L.bundles.lifecycle[b.status]})`), { mono: true })}
      ${field(L.grn.fPo, f?.po_number, { mono: true })}
      ${field(L.grn.fPoLine, f ? `${f.po_line} — ${f.description}` : "", { wide: true })}
    </div>
    <div class="row">
      ${field(L.grn.fSupplier, f?.supplier, { wide: true })}
      ${field(L.grn.fItemCode, f?.item_code, { mono: true })}
      ${field(L.grn.fUnitPrice, f?.unit_price == null ? "" : Number(f.unit_price).toFixed(3), { mono: true })}
    </div>
    <table>
      <thead><tr>
        <th>${esc(L.grn.colIdx)}</th><th>${esc(L.grn.colDn)}</th><th>${esc(L.grn.colDate)}</th>
        <th>${esc(L.grn.colSite)}</th><th class="num">${esc(L.grn.colQty)} (${esc(f?.uom ?? "")})</th>
        <th class="num">${esc(L.grn.colAmount)}</th>
      </tr></thead>
      <tbody>
        ${b.rows.map((r, i) =>
          `<tr><td>${i + 1}</td><td class="mono">${esc(r.supplier_dn)}</td><td class="mono">${esc(r.delivery_date)}</td>` +
          `<td>${esc(r.site)}</td><td class="num">${esc(r.qty)}</td><td class="num">${Number(r.amount || 0).toFixed(3)}</td></tr>`).join("")}
        <tr class="total"><td colspan="4">${esc(L.grn.totals)}</td>
          <td class="num">${Math.round(qty * 1000) / 1000}</td><td class="num">${amount.toFixed(3)}</td></tr>
      </tbody>
    </table>
    ${sigs("")}
    ${foot}
  </div></div>`
}

export function openPrint(title: string, pageCss: string, sheetsHtml: string): boolean {
  const w = window.open("", "_blank", "width=980,height=740")
  if (!w) return false
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title>` +
    `<style>@page { ${pageCss} } ${CSS}</style></head><body>${sheetsHtml}</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* manual print */ } }, 500)
  return true
}
