import { COMPLETE_INDEX, STAGE_INDEX } from '../config/stages'
import { daysBetween } from './derive'
import type { SegmentFeature, WorkLogEntry } from '../types'

export const STALL_DAYS = 14
export const RECON_TOLERANCE = 0.1 // |qty − Σlength| / Σlength

export interface SegmentInsight {
  stageIdx: number
  lastDate: string | null // most recent worklog date <= asOfDate
  stalled: boolean // in progress with no advance in > STALL_DAYS
  violation: boolean // worklog out of stage order
}

export const NO_WORK: SegmentInsight = {
  stageIdx: 0,
  lastDate: null,
  stalled: false,
  violation: false,
}

// One pass over the worklog → per-segment stage / stall / violation as of
// a date. Rows on the same date are treated as unordered (sorted by stage
// for the violation walk, so only a genuinely later, lower-stage entry
// counts as out of order).
export function segmentInsights(
  worklog: WorkLogEntry[],
  asOfDate: string,
): Map<string, SegmentInsight> {
  const rowsBySeg = new Map<string, WorkLogEntry[]>()
  for (const r of worklog) {
    if (r.date > asOfDate) continue
    const arr = rowsBySeg.get(r.segment_id)
    if (arr) arr.push(r)
    else rowsBySeg.set(r.segment_id, [r])
  }
  const out = new Map<string, SegmentInsight>()
  for (const [id, rows] of rowsBySeg) {
    rows.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : STAGE_INDEX[a.stage] - STAGE_INDEX[b.stage],
    )
    let maxSeen = 0
    let lastDate: string | null = null
    let violation = false
    for (const r of rows) {
      const i = STAGE_INDEX[r.stage]
      if (i < maxSeen) violation = true
      if (i > maxSeen) maxSeen = i
      lastDate = r.date
    }
    const stalled =
      maxSeen > 0 &&
      maxSeen < COMPLETE_INDEX &&
      lastDate !== null &&
      daysBetween(lastDate, asOfDate) > STALL_DAYS
    out.set(id, { stageIdx: maxSeen, lastDate, stalled, violation })
  }
  return out
}

export interface Filters {
  block: string | null
  stageIdx: number | null
  stalledOnly: boolean
}

export const NO_FILTERS: Filters = { block: null, stageIdx: null, stalledOnly: false }

export function matchesFilters(
  f: SegmentFeature,
  ins: SegmentInsight,
  filters: Filters,
): boolean {
  if (filters.block && f.properties.block !== filters.block) return false
  if (filters.stageIdx !== null && ins.stageIdx !== filters.stageIdx) return false
  if (filters.stalledOnly && !ins.stalled) return false
  return true
}

export interface ReconRow {
  reportId: string
  qty: number
  sumLen: number
  pct: number // signed divergence, e.g. +0.35
}

// Per report: stated quantity vs the summed true length of its segments.
// > tolerance is a data-quality signal — surfaced, never blocking.
// Only reports touching the included (filtered) segments are considered.
export function reconciliation(
  worklog: WorkLogEntry[],
  asOfDate: string,
  lengthById: Map<string, number>,
  includeIds: Set<string>,
): ReconRow[] {
  const byReport = new Map<string, { qty: number; segs: Set<string> }>()
  for (const r of worklog) {
    if (r.date > asOfDate || r.reported_qty == null) continue
    let e = byReport.get(r.report_id)
    if (!e) {
      e = { qty: r.reported_qty, segs: new Set() }
      byReport.set(r.report_id, e)
    }
    e.segs.add(r.segment_id)
  }
  const out: ReconRow[] = []
  for (const [reportId, e] of byReport) {
    let touchesFiltered = false
    let sumLen = 0
    for (const id of e.segs) {
      sumLen += lengthById.get(id) ?? 0
      if (includeIds.has(id)) touchesFiltered = true
    }
    if (!touchesFiltered || sumLen === 0) continue
    const pct = (e.qty - sumLen) / sumLen
    if (Math.abs(pct) > RECON_TOLERANCE) out.push({ reportId, qty: e.qty, sumLen, pct })
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
}
