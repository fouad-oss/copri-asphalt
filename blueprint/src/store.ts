import { create } from 'zustand'
import type { SegmentCollection, WorkLogEntry } from './types'
import { NO_FILTERS, type Filters } from './lib/insights'
import worklogJson from './data/worklog.json'
import segmentsUrl from './data/segments.geojson?url'

// The single app store — no context providers.
interface AppState {
  worklog: WorkLogEntry[]
  segments: SegmentCollection | null
  asOfDate: string // the time slider's position — everything derives from it
  minDate: string // slider range: first worklog date …
  maxDate: string // … through today (so "now" is a valid position)
  hoveredId: string | null
  selectedId: string | null
  filters: Filters
  loadSegments: () => Promise<void>
  setAsOfDate: (date: string) => void
  setHovered: (id: string | null) => void
  setSelected: (id: string | null) => void
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
}

const worklog = worklogJson as WorkLogEntry[]
const today = new Date().toISOString().slice(0, 10)
const logDates = worklog.map((r) => r.date)
const minDate = logDates.reduce((a, b) => (a < b ? a : b), today)
const maxDate = logDates.reduce((a, b) => (a > b ? a : b), today)

export const useApp = create<AppState>((set, get) => ({
  worklog,
  segments: null,
  asOfDate: maxDate,
  minDate,
  maxDate,
  hoveredId: null,
  selectedId: null,
  loadSegments: async () => {
    if (get().segments) return
    const fc: SegmentCollection = await fetch(segmentsUrl).then((r) => r.json())
    set({ segments: fc })
  },
  filters: NO_FILTERS,
  setAsOfDate: (date) => set({ asOfDate: date }),
  setHovered: (id) => set({ hoveredId: id }),
  setSelected: (id) => set({ selectedId: id }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  clearFilters: () => set({ filters: NO_FILTERS }),
}))

if (import.meta.env.DEV) {
  // test/debug handle, same idea as window.__map
  ;(window as unknown as { __app: typeof useApp }).__app = useApp
}
