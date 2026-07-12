import type { StageKey } from './config/stages'

// Properties of one 100 m segment feature (real OSM geometry).
// `unit` is the matchable location key (site|block|street) shared by all
// segments of one street — dispatch activity resolves to units, and every
// segment inherits its unit's derived stage. Unnamed streets have unit
// null: permanent background line work.
export interface SegmentProps {
  id: string
  site: string // dispatch-site vocabulary (بيان، مشرف، …)
  block: string
  street: string // Arabic label ('' when unnamed)
  street_num: string
  unit: string | null
  from_ch: number
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

// One derived work event per unit per stage per date. In the asphalt
// pilot these are projected from live dispatch_loads rows (report_id =
// delivery-note number, reported_qty = tons). Append-only, never mutated.
export interface WorkLogEntry {
  id: string
  report_id: string
  segment_id: string // unit key (dispatch log) or real segment id (reports)
  unit?: string // street unit key, always set on segment-level report rows
  stage: StageKey
  date: string // ISO8601 (yyyy-mm-dd, Kuwait day)
  width_frac?: number // fraction of street width covered (segment reports; 1 = full)
  reported_qty?: number
  crew?: string
  note?: string
}
