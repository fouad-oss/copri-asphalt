import { create } from 'zustand'
import type { SegmentCollection, WorkLogEntry } from './types'
import worklogJson from './data/worklog.json'
import segmentsUrl from './data/segments.geojson?url'

// The single app store — no context providers.
// asOfDate is pinned to today until the time slider lands (step 4).
interface AppState {
  worklog: WorkLogEntry[]
  segments: SegmentCollection | null
  asOfDate: string
  hoveredId: string | null
  selectedId: string | null
  loadSegments: () => Promise<void>
  setHovered: (id: string | null) => void
  setSelected: (id: string | null) => void
}

export const useApp = create<AppState>((set, get) => ({
  worklog: worklogJson as WorkLogEntry[],
  segments: null,
  asOfDate: new Date().toISOString().slice(0, 10),
  hoveredId: null,
  selectedId: null,
  loadSegments: async () => {
    if (get().segments) return
    const fc: SegmentCollection = await fetch(segmentsUrl).then((r) => r.json())
    set({ segments: fc })
  },
  setHovered: (id) => set({ hoveredId: id }),
  setSelected: (id) => set({ selectedId: id }),
}))
