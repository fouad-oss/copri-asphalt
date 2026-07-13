import i18n from "@/lib/i18n"
import { fmtKW } from "@/lib/format"
import logoUrl from "@/assets/brand/copri-logo.png"
import {
  aggBy, dayStr, fetchDash, fetchDayLoads, fmtKWTime, numFmt, sum, todayStr,
  type DashPayload, type DayLoad, type DispatchRow, type MaterialReceipt,
} from "./lib"

/* Print-ready reports — window → browser print/PDF, the Supabase-era
   successor of the old Apps Script daily PDFs (legacy _openReport /
   _openMatReport, ported verbatim). No DB writes. */

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { ns: "boards", ...opts }) as string
const esc = (s: unknown) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; direction: rtl; padding: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #00833E; padding-bottom: 8px; margin-bottom: 12px; }
.head img { height: 44px; }
.head .t1 { font-weight: 800; }
.head .t2 { font-size: 9pt; color: #555; margin-top: 2px; }
.rks { display: flex; gap: 8px; margin-bottom: 12px; }
.rk { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; text-align: center; }
.rk .v { font-weight: 800; color: #00833E; }
.rk .l { font-size: 7.5pt; color: #555; margin-top: 2px; }
h2 { margin: 12px 0 5px; color: #00833E; }
table { width: 100%; border-collapse: collapse; }
th { background: #f0f6f2; border: 1px solid #cfe0d6; padding: 4px 6px; font-weight: 700; text-align: right; }
td { border: 1px solid #e2e2e2; padding: 3.5px 6px; }
tr:nth-child(even) td { background: #fafaf8; }
.foot { margin-top: 12px; border-top: 1px solid #ddd; padding-top: 6px; font-size: 7.5pt; color: #999; text-align: center; }`

function openPrintWindow(html: string, width: number): boolean {
  const w = window.open("", "_blank", `width=${width},height=700`)
  if (!w) return false
  w.document.write(html)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* user closes */ } }, 500)
  return true
}

function openDispatchReport(payload: DashPayload, label: string, from: string, to: string, rows: DispatchRow[], detail: DayLoad[] | null): boolean {
  const tons = sum(rows, (r) => r.t)
  const tonsRecv = sum(rows, (r) => r.tr)
  const copri = rows.filter((r) => r.c === (payload.copri || "كوبري"))
  const acc = copri.filter((r) => r.st === 1).length
  const accPct = copri.length ? Math.round((acc / copri.length) * 100) : 0
  const kpi = (v: string, l: string) => `<div class="rk"><div class="v">${v}</div><div class="l">${l}</div></div>`
  const table = (title: string, heads: string[], body: string) => body
    ? `<h2>${title}</h2><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>` : ""
  const aggTable = (title: string, keyFn: (r: DispatchRow) => string, cap?: number) => {
    const ag = aggBy(rows, keyFn, (r) => r.t).slice(0, cap || 100)
    const counts: Record<string, number> = {}
    rows.forEach((r) => { const k = keyFn(r); if (k && k !== "—") counts[k] = (counts[k] || 0) + 1 })
    return table(title, [t("rep.colItem"), t("rep.colTrips"), t("rep.colTons")],
      ag.map((x) => `<tr><td>${esc(x.name)}</td><td>${numFmt(counts[x.name] || 0)}</td><td>${numFmt(x.value)}</td></tr>`).join(""))
  }
  let daysTable = ""
  if (from !== to) {
    const byDay: Record<string, { n: number; t: number; tr: number }> = {}
    rows.forEach((r) => {
      const b = (byDay[r.d] = byDay[r.d] || { n: 0, t: 0, tr: 0 })
      b.n++; b.t += r.t || 0; b.tr += r.tr || 0
    })
    daysTable = table(t("rep.byDay"), [t("rep.colDay"), t("rep.colTrips"), t("rep.colOut"), t("rep.colRecv")],
      Object.keys(byDay).sort().map((d) =>
        `<tr><td>${d}</td><td>${numFmt(byDay[d].n)}</td><td>${numFmt(Math.round(byDay[d].t))}</td><td>${numFmt(Math.round(byDay[d].tr))}</td></tr>`).join(""))
  }
  let detailTable = ""
  if (detail && detail.length) {
    detailTable = table(t("rep.detail", { n: detail.length }),
      [t("rep.colNote"), t("rep.colTime"), t("rep.colCompanyProj"), t("rep.colSite"), t("rep.colMix"), t("rep.colTon"), t("rep.colStatus")],
      detail.map((d) => `<tr><td>${esc(d.note)}</td><td>${esc(fmtKWTime(d.ts))}</td><td>${esc(d.company)} — ${esc(d.project)}</td><td>${esc(d.site)}${d.block ? " ق" + esc(d.block) : ""}${d.street ? " ش" + esc(d.street) : ""}</td><td>${esc(d.mix)}</td><td>${d.weight == null ? "—" : d.weight}</td><td>${esc(d.status)}</td></tr>`).join(""))
  }
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${t("rep.dispatchTitle")}</title><style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-size: 10pt; } .head .t1 { font-size: 15pt; } .rk .v { font-size: 14pt; }
  h2 { font-size: 11pt; } table { font-size: 8.5pt; }
  @media screen { body { max-width: 800px; margin: auto; } }
  ${BASE_CSS}</style></head><body>
  <div class="head">
    <div><div class="t1">${t("rep.dispatchTitle")} — ${label}</div>
    <div class="t2">${from === to ? t("rep.dayOf", { d: from }) : t("rep.fromTo", { f: from, t: to })} · ${t("rep.made", { when: esc(fmtKW(new Date().toISOString())) })}</div></div>
    <img src="${logoUrl}" alt="COPRI"/>
  </div>
  <div class="rks">
    ${kpi(numFmt(rows.length), t("rep.trips"))}
    ${kpi(numFmt(Math.round(tons)), t("rep.tonsOut"))}
    ${kpi(numFmt(Math.round(tonsRecv)), t("rep.tonsRecv"))}
    ${kpi(accPct + "٪", t("rep.acceptCopri"))}
    ${kpi(rows.length ? (tons / rows.length).toFixed(1) : "0", t("rep.avgLoad"))}
  </div>
  ${aggTable(t("rep.byCompany"), (r) => r.c)}
  ${aggTable(t("rep.byProject"), (r) => r.p)}
  ${daysTable}
  ${aggTable(t("rep.bySite"), (r) => r.s, 15)}
  ${aggTable(t("rep.byMix"), (r) => r.m)}
  ${detailTable}
  <div class="foot">${t("rep.footer")}</div>
  </body></html>`
  return openPrintWindow(html, 900)
}

/** kind "day": a = yyyy-mm-dd · "range": a/b = from/to (inclusive) ·
    "month": a = yyyy-mm. Returns false when data or the popup fails. */
export async function generateDispatchReport(kind: "day" | "range" | "month", a?: string, b?: string): Promise<"ok" | "data" | "popup"> {
  let payload: DashPayload
  try { payload = await fetchDash() } catch { return "data" }
  const all = payload.dispatch || []
  const today = todayStr()
  let from: string, to: string, label: string
  if (kind === "day") {
    to = from = a || today
    label = t("rep.daily")
  } else if (kind === "range") {
    from = a || today; to = b || today
    if (from > to) { const x = from; from = to; to = x }
    label = t("rep.period")
  } else {
    const ym = a || today.slice(0, 7)
    const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10)
    from = ym + "-01"; to = dayStr(new Date(y, m, 0))
    let name = ym
    try { name = new Date(y, m - 1, 1).toLocaleDateString(i18n.language === "ar" ? "ar" : "en", { month: "long", year: "numeric" }) } catch { /* keep ym */ }
    label = t("rep.monthPrefix") + name
  }
  const rows = all.filter((r) => r.d >= from && r.d <= to)
  let detail: DayLoad[] | null = null
  if (kind === "day") { try { detail = await fetchDayLoads(from) } catch { /* summary still prints */ } }
  return openDispatchReport(payload, label, from, to, rows, detail) ? "ok" : "popup"
}

/** Itemized materials statement for the accountant (A4 landscape). */
export function openMaterialsReport(projName: string, rows: MaterialReceipt[]): boolean {
  if (!rows.length) return true
  const days = rows.map((r) => r.d)
  const from = days.reduce((a, b) => (a < b ? a : b))
  const to = days.reduce((a, b) => (a > b ? a : b))
  const kpi = (v: string, l: string) => `<div class="rk"><div class="v">${v}</div><div class="l">${l}</div></div>`
  const ordered = rows.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1))
  const c = t("rep.matCols", { returnObjects: true }) as unknown as Record<string, string>
  const detail = ordered.map((r) => `<tr>
    <td>${esc(fmtKW(r.ts))}</td><td>${esc(r.receipt_id)}</td><td>${esc(r.category)}</td><td>${esc(r.material)}</td>
    <td>${r.quantity == null ? "—" : esc(r.quantity)}</td><td>${esc(r.unit)}</td>
    <td>${esc(r.supplier)}</td><td>${esc(r.subcontractor)}</td><td>${esc(r.receiver)}</td>
    <td>${esc(r.site)}${r.block ? " ق" + esc(r.block) : ""}${r.street ? " ش" + esc(r.street) : ""}</td>
  </tr>`).join("")
  const agg = (title: string, keyFn: (r: MaterialReceipt) => string | null | undefined) => {
    const ag = aggBy(rows, keyFn).slice(0, 30)
    if (!ag.length) return ""
    return `<h2>${title} ${t("rep.byCount")}</h2><table><thead><tr><th>${t("rep.colItem")}</th><th>${t("rep.colCount")}</th></tr></thead><tbody>${
      ag.map((x) => `<tr><td>${esc(x.name)}</td><td>${numFmt(x.value)}</td></tr>`).join("")}</tbody></table>`
  }
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${t("rep.matTitle", { proj: esc(projName) })}</title><style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-size: 9.5pt; } .head .t1 { font-size: 14pt; } .rk .v { font-size: 13pt; }
  h2 { font-size: 10.5pt; } table { font-size: 8pt; }
  @media screen { body { max-width: 1050px; margin: auto; } }
  ${BASE_CSS}</style></head><body>
  <div class="head">
    <div><div class="t1">${t("rep.matTitle", { proj: esc(projName) })}</div>
    <div class="t2">${from === to ? t("rep.dayOf", { d: from }) : t("rep.fromTo", { f: from, t: to })} · ${t("rep.made", { when: esc(fmtKW(new Date().toISOString())) })}</div></div>
    <img src="${logoUrl}" alt="COPRI"/>
  </div>
  <div class="rks">
    ${kpi(numFmt(rows.length), t("rep.kMats"))}
    ${kpi(numFmt(new Set(rows.map((r) => r.material).filter(Boolean)).size), t("rep.kItems"))}
    ${kpi(numFmt(new Set(rows.map((r) => r.subcontractor).filter(Boolean)).size), t("rep.kSubs"))}
    ${kpi(numFmt(new Set(rows.map((r) => r.supplier).filter(Boolean)).size), t("rep.kSups"))}
  </div>
  <h2>${t("rep.matDetail", { n: numFmt(rows.length) })}</h2>
  <table><thead><tr>
    <th>${c.ts}</th><th>${c.id}</th><th>${c.cat}</th><th>${c.item}</th><th>${c.qty}</th><th>${c.unit}</th>
    <th>${c.sup}</th><th>${c.sub}</th><th>${c.rec}</th><th>${c.site}</th>
  </tr></thead><tbody>${detail}</tbody></table>
  ${agg(t("rep.matByCat"), (r) => r.category)}
  ${agg(t("rep.matBySub"), (r) => r.subcontractor)}
  ${agg(t("rep.matBySup"), (r) => r.supplier)}
  <div class="foot">${t("rep.footer")}</div>
  </body></html>`
  return openPrintWindow(html, 1100)
}
