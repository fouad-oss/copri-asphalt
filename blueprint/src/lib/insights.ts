import { COMPLETE_INDEX, STAGE_INDEX } from '../config/stages'
import { daysBetween } from './derive'
import type { SegmentFeature, WorkLogEntry } from '../types'

export const STALL_DAYS = 14

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
  site: string | null
  stageIdx: number | null
  stalledOnly: boolean
}

export const NO_FILTERS: Filters = { site: null, stageIdx: null, stalledOnly: false }

export function matchesFilters(
  f: SegmentFeature,
  ins: SegmentInsight,
  filters: Filters,
): boolean {
  if (filters.site && f.properties.site !== filters.site) return false
  if (filters.stageIdx !== null && ins.stageIdx !== filters.stageIdx) return false
  if (filters.stalledOnly && !ins.stalled) return false
  return true
}

// Σ tons over the included units up to asOfDate. A delivery expanded to
// several street units repeats its weight per row, so each delivery note
// (report_id) counts once.
export function totalTons(
  worklog: WorkLogEntry[],
  asOfDate: string,
  includeUnits: Set<string>,
): number {
  const seen = new Set<string>()
  let tons = 0
  for (const r of worklog) {
    if (r.date > asOfDate || r.reported_qty == null) continue
    if (!includeUnits.has(r.segment_id) || seen.has(r.report_id)) continue
    seen.add(r.report_id)
    tons += r.reported_qty
  }
  return tons
}
