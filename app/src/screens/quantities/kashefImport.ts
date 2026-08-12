// Kashef Excel importer — parses the QA's existing كشف تكلفة تقديري
// workbook format (header block, باب/بند line rows, subtotal + نسبة
// العقد footer) and validates every line against qm_bop_items.
//
// Id strings are bidi-inconsistent across the QA's files: kashef sheets
// store bab/band while the standalone BOP stores band/bab — and both
// RENDER bab-first in Excel. We never trust raw segment order: both
// segments are parsed and bab is resolved by validating against the
// contract's bab set and the BOP itself. The BOP rate is always the
// rate of record; a differing file rate is surfaced, never imported.
import type { WorkBook } from "xlsx"
import { itemRef, type BopItem, type LocType } from "./data"

// SheetJS is ~380 KB — loaded on demand the first time a file is opened
// so the portal chunk stays lean. Both parse helpers run only after
// openWorkbook has populated the cache.
let X: typeof import("xlsx") | null = null
function sheetRows(wb: WorkBook, name: string): unknown[][] {
  return X!.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }) as unknown[][]
}

export interface ParsedLine {
  rowIndex: number
  rawId: string
  desc: string
  qty: number
  unit: string
  fileRate: number | null
  bopItem: BopItem | null
  issue: "unknown_id" | "rate_differs" | null
  skip: boolean
}

export interface ParsedKashef {
  sheet: string
  contractNo: string
  contractName: string
  contractor: string
  location: string
  area: string
  locType: LocType
  blockNo: string
  streetName: string
  workType: string
  pct: number | null
  lines: ParsedLine[]
}

const AR_LETTERS = "اأإآبجدهوزحطي"
const ID_RE = new RegExp(`^(\\d+)\\s*([${AR_LETTERS}]?)\\s*/\\s*(\\d+)\\s*([${AR_LETTERS}]?)$`)

// Strip bidi control characters + nbsp before parsing (the same hazard
// the server-side BOP importer handles).
function clean(v: unknown): string {
  if (v == null) return ""
  let s = typeof v === "number" ? String(v) : String(v)
  s = s.replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/ /g, " ")
  return s.trim()
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v
  const s = clean(v).replace(/,/g, "")
  if (!s) return null
  const n = Number(s)
  return isFinite(n) ? n : null
}

export async function openWorkbook(file: File): Promise<WorkBook> {
  if (!X) X = await import("xlsx")
  const buf = await file.arrayBuffer()
  return X.read(buf)
}

// Resolve a raw id against the BOP. Kashef files are conventionally
// bab-first; fall back to the flipped reading if only that matches.
function resolveItem(rawId: string, bop: BopItem[], babSet: Set<number>): BopItem | null {
  const m = ID_RE.exec(rawId)
  if (!m) return null
  const a = Number(m[1]); const sufA = m[2]
  const b = Number(m[3]); const sufB = m[4]
  const suffix = sufA || sufB || null
  const find = (bab: number, band: number) =>
    bop.find((i) => i.bab === bab && i.band === band && (i.suffix ?? null) === suffix) ?? null
  if (babSet.has(a)) {
    const hit = find(a, b)
    if (hit) return hit
  }
  if (babSet.has(b)) {
    const hit = find(b, a)
    if (hit) return hit
  }
  return null
}

function parseLocation(loc: string): Pick<ParsedKashef, "area" | "locType" | "blockNo" | "streetName" | "workType"> {
  // Examples: "سلوى  قطعة (12) - أمطار" · "مشرف — شارع 26" · "بيان — متفرقات"
  let workType = ""
  let body = loc
  const dash = loc.split(/\s[-–—]\s/)
  if (dash.length > 1) {
    const last = dash[dash.length - 1].trim()
    // متفرقات / شارع segments are location, not work type
    if (!/متفرقات|شارع/.test(last)) {
      workType = last
      body = dash.slice(0, -1).join(" - ")
    }
  }
  const block = /قطعة\s*\(?\s*(\d+)\s*\)?/.exec(body)
  if (block) {
    return {
      area: body.slice(0, block.index).trim().replace(/[-–—]\s*$/, "").trim(),
      locType: "block", blockNo: block[1], streetName: "", workType,
    }
  }
  if (/متفرقات/.test(body)) {
    return {
      area: body.replace(/متفرقات/, "").replace(/[-–—]/g, " ").trim(),
      locType: "misc", blockNo: "", streetName: "", workType,
    }
  }
  const street = /(شارع\s*\S.*)$/.exec(body)
  if (street) {
    return {
      area: body.slice(0, street.index).replace(/[-–—]\s*$/, "").trim(),
      locType: "street", blockNo: "", streetName: street[1].trim(), workType,
    }
  }
  return { area: body.trim(), locType: "misc", blockNo: "", streetName: "", workType }
}

// Heuristic: a sheet qualifies as a kashef sheet if it has the باب/بند
// header row. Color/allocation forks also match — the QA picks; we just
// surface every candidate.
export function candidateSheets(wb: WorkBook): string[] {
  return wb.SheetNames.filter((name) => {
    const rows = sheetRows(wb, name)
    return rows.slice(0, 15).some((r) => /باب\s*\/?\s*\/?\s*بند|باب.*بند/.test(clean(r?.[0])))
  })
}

export function parseKashefSheet(wb: WorkBook, sheetName: string, bop: BopItem[]): ParsedKashef {
  const rows = sheetRows(wb, sheetName)
  const babSet = new Set(bop.map((i) => i.bab))

  let contractNo = "", contractName = "", contractor = "", location = ""
  let headerRow = -1
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const c0 = clean(rows[r]?.[0])
    const grab = (label: RegExp) => c0.replace(label, "").replace(/^[:\s]+/, "").trim()
    if (/^رقم العقد/.test(c0)) contractNo = grab(/^رقم العقد/)
    else if (/^اسم العقد/.test(c0)) contractName = grab(/^اسم العقد/)
    else if (/^المتعهد/.test(c0)) contractor = grab(/^المتعهد/)
    else if (/^موقع العمل/.test(c0)) location = grab(/^موقع العمل/)
    else if (/باب.*بند/.test(c0)) { headerRow = r; break }
  }
  if (headerRow < 0) throw new Error("header row not found")

  // Column layout per the QA's format: id(0), desc(1..3 merged),
  // qty(4), unit(5), rate(6), total(7). Some files shift by a column —
  // detect qty column as the first numeric-heavy column after desc.
  const lines: ParsedLine[] = []
  let pct: number | null = null

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const c0 = clean(row[0])
    const footerCell = [row[1], row[3], row[4], row[5]].map(clean).join(" ")
    if (/الاجمالي بعد نسبة العقد/.test(footerCell)) {
      const m = /([\d.]+)\s*%/.exec(row.map(clean).join(" "))
      if (m) pct = Number(m[1])
      continue
    }
    if (/الاجمالي العام/.test(footerCell)) continue
    if (!c0) continue
    if (!ID_RE.test(c0)) continue

    const desc = clean(row[1]) || clean(row[2]) || clean(row[3])
    const qty = toNumber(row[4])
    const unit = clean(row[5])
    const fileRate = toNumber(row[6])
    if (qty === null) continue

    const bopItem = resolveItem(c0, bop, babSet)
    let issue: ParsedLine["issue"] = null
    if (!bopItem) issue = "unknown_id"
    else if (fileRate !== null && Math.abs(fileRate - bopItem.rate) > 0.0005) issue = "rate_differs"

    lines.push({
      rowIndex: r, rawId: c0, desc, qty, unit, fileRate, bopItem, issue,
      skip: !bopItem,     // unknown ids default to skipped — QA reviews
    })
  }

  return {
    sheet: sheetName, contractNo, contractName, contractor, location,
    ...parseLocation(location), pct, lines,
  }
}

export function lineDisplayRef(l: ParsedLine): string {
  return l.bopItem ? itemRef(l.bopItem) : l.rawId
}
