import { STAGES, type StageKey } from '../config/stages'
import type { SegmentCollection, WorkLogEntry } from '../types'

// Live dispatch row (the columns Blueprint reads from dispatch_loads).
export interface DispatchRow {
  note: string
  ts: string
  site: string
  block: string
  street: string
  loc_type: string
  mix: string
  weight: number | null
  status: string
  plant: string
  project: string
  company: string
}

// ── name normalisation — MUST mirror scripts/extract-osm.mjs ──
const AR_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' }
export function normName(s: string): string {
  return String(s || '')
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d])
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/شارع|طريق|street|road/gi, '')
    .replace(/\bال/g, '')
    .replace(/[\s\-_.']/g, '')
    .toLowerCase()
}
export function streetNum(s: string): string | null {
  const m = String(s || '').replace(/[٠-٩]/g, (d) => AR_DIGITS[d]).match(/\d+/)
  return m ? String(parseInt(m[0], 10)) : null
}

// Dispatch-site spellings that map onto an extracted area.
const SITE_ALIAS: Record<string, string> = { 'قصر بيان': 'بيان' }
export const canonicalSite = (s: string) => SITE_ALIAS[s] ?? s

// Mix label → stage key. Order matters: III before II before I.
export function stageFromMix(mix: string): StageKey {
  const m = String(mix || '')
  if (/III|3/.test(m)) return 'type_iii'
  if (/II/.test(m)) return 'type_ii'
  if (/I|1/.test(m)) return 'type_i'
  return 'type_i'
}

// Index of the real street units present in segments.geojson.
export interface UnitIndex {
  byExact: Map<string, string> // site|block|numOrNorm → unit
  bySiteNum: Map<string, string[]> // site|num → units (any block)
  bySiteName: Map<string, string[]> // site|norm → units
  blockUnits: Set<string> // site|block|* present in blocks.geojson
  kmRanges: Map<string, { unit: string; from: number; to: number }[]> // motorway site → chainage pieces
}

export function buildUnitIndex(
  segments: SegmentCollection,
  blocks: SegmentCollection,
): UnitIndex {
  const byExact = new Map<string, string>()
  const bySiteNum = new Map<string, string[]>()
  const bySiteName = new Map<string, string[]>()
  const kmRanges = new Map<string, { unit: string; from: number; to: number }[]>()
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const arr = m.get(k)
    if (arr) { if (!arr.includes(v)) arr.push(v) } else m.set(k, [v])
  }
  for (const f of segments.features) {
    const p = f.properties as unknown as { site: string; block: string; street: string; street_num: string; unit: string | null; from_ch: number; to_ch: number }
    if (!p.unit) continue
    if (p.unit.includes('|km|')) {
      // motorway piece — matched by chainage overlap, not by name
      const arr = kmRanges.get(p.site)
      const entry = { unit: p.unit, from: p.from_ch, to: p.to_ch }
      if (arr) arr.push(entry)
      else kmRanges.set(p.site, [entry])
      continue
    }
    byExact.set(p.unit, p.unit)
    if (p.street_num) push(bySiteNum, `${p.site}|${p.street_num}`, p.unit)
    if (p.street) push(bySiteName, `${p.site}|${normName(p.street)}`, p.unit)
  }
  const blockUnits = new Set<string>(
    blocks.features.map((f) => (f.properties as unknown as { unit: string }).unit),
  )
  return { byExact, bySiteNum, bySiteName, blockUnits, kmRanges }
}

// كيلومتر token → meters from the route origin. Clerks write these every
// way: "39,50" = 39+050, "39100" = 39+100, "35" = km 35.
function kmToMeters(tok: string): number | null {
  const t = String(tok || '').replace(/[٠-٩]/g, (d) => AR_DIGITS[d]).trim()
  const parts = t.split(/[,،+]/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null
  if (parts.length >= 2) return parseInt(parts[0], 10) * 1000 + parseInt(parts[1], 10)
  const n = parseInt(parts[0], 10)
  return n >= 1000 ? n : n * 1000
}

// A نطاق كيلومتر row keeps its from/to in the block/street columns.
export function kmRange(block: string, street: string): [number, number] | null {
  const a = kmToMeters(block)
  const b = kmToMeters(street)
  if (a === null && b === null) return null
  const from = Math.min(a ?? b!, b ?? a!)
  let to = Math.max(a ?? b!, b ?? a!)
  if (to <= from) to = from + 100
  return [from, to]
}

export interface DispatchConversion {
  worklog: WorkLogEntry[]
  offMap: Map<string, { rows: number; tons: number }> // human location key → unmatched volume
}

// Dispatch rows → worklog entries keyed by street unit. One dispatch can
// cover several streets ("ش11,8") → one entry per resolved unit. Rows
// whose location has no matching geometry fall back to the block unit
// (colors the block boundary); failing that they land in offMap.
export function dispatchToWorklog(
  rows: DispatchRow[],
  idx: UnitIndex,
): DispatchConversion {
  const worklog: WorkLogEntry[] = []
  const offMap = new Map<string, { rows: number; tons: number }>()
  let seq = 0
  for (const r of rows) {
    const stage = stageFromMix(r.mix)
    const date = kuwaitDay(r.ts)
    const named = r.loc_type === 'اسم الشارع'
    const isKm = /كيلومتر/.test(r.loc_type)
    const site = canonicalSite(r.site)
    const units = new Set<string>()
    let human: string
    if (isKm) {
      // motorway km range → every chainage piece it overlaps
      const range = kmRange(r.block, r.street)
      human = `${r.site} — كم ${r.block}${r.street ? '–' + r.street : ''}`
      if (range) {
        for (const s of idx.kmRanges.get(site) || []) {
          if (s.from < range[1] && s.to > range[0]) units.add(s.unit)
        }
      }
    } else if (named) {
      // named rows keep the name in `block`
      const name = r.block || ''
      human = `${r.site} — ${name}`
      const num = /^[0-9٠-٩\s]+$/.test(name) ? streetNum(name) : null
      let hits = num
        ? idx.bySiteNum.get(`${site}|${num}`)
        : idx.bySiteName.get(`${site}|${normName(name)}`)
      if (!hits && !num) {
        // boundary streets sometimes extract under the neighbouring area —
        // fall back to a cross-site name match
        const nn = normName(name)
        for (const [k, v] of idx.bySiteName) {
          if (k.split('|')[1] === nn) { hits = v; break }
        }
      }
      hits?.forEach((u) => units.add(u))
    } else {
      human = `${r.site} — ق${r.block} ش${r.street}`
      const nums = String(r.street || '')
        .split(/[,،]/)
        .map((s) => streetNum(s))
        .filter(Boolean) as string[]
      for (const num of nums) {
        const exact = idx.byExact.get(`${site}|${r.block}|${num}`)
        if (exact) units.add(exact)
      }
      if (!units.size && idx.blockUnits.has(`${site}|${r.block}|*`)) {
        units.add(`${site}|${r.block}|*`)
      }
    }
    if (!units.size) {
      const cur = offMap.get(human) || { rows: 0, tons: 0 }
      offMap.set(human, { rows: cur.rows + 1, tons: cur.tons + (r.weight || 0) })
      continue
    }
    for (const unit of units) {
      seq++
      worklog.push({
        id: `${r.note}·${seq}`,
        report_id: String(r.note),
        segment_id: unit, // the derive machinery keys on this
        stage,
        date,
        reported_qty: r.weight ?? undefined,
        crew: [r.plant, r.company !== 'كوبري' ? r.company : ''].filter(Boolean).join(' · '),
        note: r.status && r.status !== 'مقبول' ? r.status : undefined,
      })
    }
  }
  worklog.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { worklog, offMap }
}

// Kuwait calendar day (UTC+3, no DST) from an ISO timestamp.
export function kuwaitDay(ts: string): string {
  return new Date(Date.parse(ts) + 3 * 3600000).toISOString().slice(0, 10)
}

export const STAGE_COUNT = STAGES.length
