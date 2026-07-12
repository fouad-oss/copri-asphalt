import { STAGES, STAGE_INDEX } from '../config/stages'
import type { WorkLogEntry } from '../types'

// The heart of the app: a segment's stage at any point in time is the
// highest-index stage present in the worklog for that segment with
// date <= asOfDate. The time slider just changes asOfDate. Never mutate;
// always derive.
//
// Returns the stage INDEX (0 = not_started when nothing is logged yet).
export function currentStage(
  worklog: WorkLogEntry[],
  segmentId: string,
  asOfDate: string,
): number {
  let highest = 0
  for (const row of worklog) {
    if (row.segment_id !== segmentId) continue
    if (row.date > asOfDate) continue
    const idx = STAGE_INDEX[row.stage]
    if (idx > highest) highest = idx
  }
  return highest
}

// First date each stage was logged for a segment (date <= asOfDate),
// index-aligned with STAGES; null where nothing is logged. Feeds the
// progress rail and the days-in-stage calculation.
export function stageDates(
  worklog: WorkLogEntry[],
  segmentId: string,
  asOfDate: string,
): (string | null)[] {
  const dates: (string | null)[] = STAGES.map(() => null)
  for (const row of worklog) {
    if (row.segment_id !== segmentId || row.date > asOfDate) continue
    const i = STAGE_INDEX[row.stage]
    const cur = dates[i]
    if (cur === null || row.date < cur) dates[i] = row.date
  }
  return dates
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000)
}

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)
}
