import type { StageKey } from './config/stages'

// Properties of one 100 m segment feature in segments.geojson.
// Geometry is the atomic, immutable unit. There is deliberately NO stage
// field here — stage is always derived from the worklog (see lib/derive).
export interface SegmentProps {
  id: string // `<street-slug>-<from_ch>`, e.g. "bayan-3-st12-0200"
  street: string
  block: string
  governorate: string
  from_ch: number // chainage, metres
  to_ch: number
  length_m: number // true length — tail segments carry < 100
  width_m: number
  notes: string
}

export interface SegmentFeature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: SegmentProps
}

export interface SegmentCollection {
  type: 'FeatureCollection'
  features: SegmentFeature[]
}

// One row per segment per stage per date. Append-only.
export interface WorkLogEntry {
  id: string
  report_id: string // groups rows from a single subcontractor report
  segment_id: string
  stage: StageKey
  date: string // ISO8601 (yyyy-mm-dd)
  reported_qty?: number // whole-report qty, repeated verbatim per row
  crew?: string
  note?: string
}
