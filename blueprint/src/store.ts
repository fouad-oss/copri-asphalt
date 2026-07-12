import { create } from 'zustand'
import type { SegmentCollection, WorkLogEntry } from './types'
import { NO_FILTERS, type Filters } from './lib/insights'
import { buildUnitIndex, dispatchToWorklog, type DispatchRow } from './lib/asphalt'
import { sbGet } from './config/backend'
import segmentsUrl from './data/real/segments.geojson?url'
import blocksUrl from './data/real/blocks.geojson?url'
import snapshot from './data/real/dispatch-snapshot.json'

// The single app store — no context providers.
interface AppState {
  worklog: WorkLogEntry[]
  segLog: WorkLogEntry[] // segment-level work reports (blueprint_worklog)
  segments: SegmentCollection | null
  blocks: SegmentCollection | null
  offMap: [string, number][] // dispatch locations with no geometry (key, rows)
  live: boolean // true = worklog built from a live Supabase read
  asOfDate: string
  minDate: string
  maxDate: string
  hoveredId: string | null
  selectedId: string | null
  filters: Filters
  // report mode: shared by the report panel's strip and the map itself
  reporting: boolean
  reportUnit: string | null
  reportAnchor: string | null // first-tapped segment id
  reportSelection: string[] // ordered segment ids of the chosen range
  loadData: () => Promise<void>
  loadSegLog: () => Promise<void>
  setAsOfDate: (date: string) => void
  setHovered: (id: string | null) => void
  setSelected: (id: string | null) => void
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
  setReporting: (on: boolean) => void
  setReportUnit: (unit: string | null) => void
  tapReportSegment: (segId: string) => void
  clearReportSelection: () => void
}

const today = new Date().toISOString().slice(0, 10)

interface SegLogRow {
  id: number
  report_id: string
  segment_id: string
  unit: string
  stage: string
  work_date: string
  by_name: string
  note: string
}

export const useApp = create<AppState>((set, get) => ({
  worklog: [],
  segLog: [],
  segments: null,
  blocks: null,
  offMap: [],
  live: false,
  asOfDate: today,
  minDate: today,
  maxDate: today,
  hoveredId: null,
  selectedId: null,
  filters: NO_FILTERS,
  loadData: async () => {
    if (get().segments) return
    const [segments, blocks] = await Promise.all([
      fetch(segmentsUrl).then((r) => r.json()) as Promise<SegmentCollection>,
      fetch(blocksUrl).then((r) => r.json()) as Promise<SegmentCollection>,
    ])
    // Live dispatch first; bundled snapshot keeps the app usable offline.
    let rows = snapshot as unknown as DispatchRow[]
    let live = false
    try {
      // COPRI's own works only — external-client deliveries are out of scope.
      rows = await sbGet<DispatchRow[]>(
        `dispatch_loads?select=note,ts,site,block,street,loc_type,mix,weight,status,plant,project,company&company=eq.${encodeURIComponent('كوبري')}&order=ts.asc&limit=10000`,
      )
      live = true
    } catch {
      /* offline — snapshot it is */
    }
    const idx = buildUnitIndex(segments, blocks)
    const { worklog, offMap } = dispatchToWorklog(rows, idx)
    const dates = worklog.map((r) => r.date)
    const minDate = dates.reduce((a, b) => (a < b ? a : b), today)
    const maxDate = dates.reduce((a, b) => (a > b ? a : b), today)
    set({
      segments,
      blocks,
      worklog,
      live,
      offMap: [...offMap.entries()].sort((a, b) => b[1] - a[1]),
      minDate,
      maxDate,
      asOfDate: maxDate,
    })
    await get().loadSegLog()
  },
  // Segment-level reports (0009). Tolerates the table not existing yet.
  loadSegLog: async () => {
    try {
      const rows = await sbGet<SegLogRow[]>(
        'blueprint_worklog?select=id,report_id,segment_id,unit,stage,work_date,by_name,note&order=work_date.asc&limit=20000',
      )
      set({
        segLog: rows.map((r) => ({
          id: `blr-${r.id}`,
          report_id: r.report_id,
          segment_id: r.segment_id,
          unit: r.unit,
          stage: r.stage as WorkLogEntry['stage'],
          date: r.work_date,
          crew: r.by_name,
          note: r.note || undefined,
        })),
      })
    } catch {
      /* migration 0009 not applied yet — dispatch-only mode */
    }
  },
  setAsOfDate: (date) => set({ asOfDate: date }),
  setHovered: (id) => set({ hoveredId: id }),
  setSelected: (id) => set({ selectedId: id }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  clearFilters: () => set({ filters: NO_FILTERS }),
  reporting: false,
  reportUnit: null,
  reportAnchor: null,
  reportSelection: [],
  setReporting: (on) =>
    set(on ? { reporting: true } : { reporting: false, reportUnit: null, reportAnchor: null, reportSelection: [] }),
  setReportUnit: (unit) => set({ reportUnit: unit, reportAnchor: null, reportSelection: [] }),
  // Tap-tap range selection: first tap anchors, second (same street)
  // completes the range; a third starts over. Works identically from the
  // map and the panel strip.
  tapReportSegment: (segId) => {
    const { segments, reportUnit, reportAnchor, reportSelection } = get()
    if (!segments) return
    const f = segments.features.find((x) => x.properties.id === segId)
    const unit = f?.properties.unit
    if (!unit) return
    if (unit !== reportUnit || reportAnchor === null || reportSelection.length) {
      set({ reportUnit: unit, reportAnchor: segId, reportSelection: [] })
      return
    }
    const ordered = segments.features
      .filter((x) => x.properties.unit === unit)
      .map((x) => x.properties.id)
      .sort()
    const a = ordered.indexOf(reportAnchor)
    const b = ordered.indexOf(segId)
    const [lo, hi] = a < b ? [a, b] : [b, a]
    set({ reportSelection: ordered.slice(lo, hi + 1) })
  },
  clearReportSelection: () => set({ reportAnchor: null, reportSelection: [] }),
}))

if (import.meta.env.DEV) {
  // test/debug handle, same idea as window.__map
  ;(window as unknown as { __app: typeof useApp }).__app = useApp
}
