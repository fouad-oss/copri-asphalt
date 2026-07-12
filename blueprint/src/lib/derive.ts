import { STAGE_INDEX } from '../config/stages'
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
