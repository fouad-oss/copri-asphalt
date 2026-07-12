import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../store'
import { segmentInsights, matchesFilters, NO_WORK } from '../lib/insights'
import { STAGES } from '../config/stages'
import {
  BASE_STYLE,
  SOURCE_ID,
  SEGMENT_LAYER_IDS,
  GRID_SOURCE_ID,
  segmentLayers,
  blocksLayer,
  gridGeoJSON,
  gridLayer,
  SAT_SOURCE,
  SAT_LAYER,
} from '../lib/mapStyle'
import type { SegmentProps } from '../types'

interface Tip {
  x: number
  y: number
  title: string
  sub: string
}

// The primary view: real OSM street segments, colored by their UNIT's
// derived stage (unit = the dispatch-matchable street key) as of the
// store's asOfDate. Blocks with activity that didn't resolve to a street
// light up on their boundary. Stage lives in computed properties on a
// cloned FeatureCollection — never in the data.
export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const hoverIdRef = useRef<string | null>(null)
  const labelsRef = useRef<HTMLElement[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [tip, setTip] = useState<Tip | null>(null)
  const [satellite, setSatellite] = useState(false)

  const segments = useApp((s) => s.segments)
  const blocks = useApp((s) => s.blocks)
  const worklog = useApp((s) => s.worklog)
  const segLog = useApp((s) => s.segLog)
  const asOfDate = useApp((s) => s.asOfDate)
  const filters = useApp((s) => s.filters)
  const selectedId = useApp((s) => s.selectedId)
  const setSelected = useApp((s) => s.setSelected)
  const setHovered = useApp((s) => s.setHovered)

  // Units that ever appear in the worklog — the "active" network.
  const activeUnits = useMemo(() => new Set(worklog.map((r) => r.segment_id)), [worklog])

  // Derive stage_idx + filter dim flag per feature for the current date.
  // Units with segment-level reports color per SEGMENT (the reports say
  // where); everything else colors street-wide from dispatch.
  const derived = useMemo(() => {
    if (!segments || !blocks) return null
    const ins = segmentInsights(worklog, asOfDate)
    const segIns = segmentInsights(segLog, asOfDate)
    const reportedUnits = new Set(segLog.filter((r) => r.date <= asOfDate && r.unit).map((r) => r.unit as string))
    const segFC = {
      type: 'FeatureCollection' as const,
      features: segments.features.map((f) => {
        const unit = f.properties.unit
        const unitIns = (unit && ins.get(unit)) || NO_WORK
        const i =
          unit && reportedUnits.has(unit)
            ? segIns.get(f.properties.id) || NO_WORK
            : unitIns
        return {
          ...f,
          properties: {
            ...f.properties,
            stage_idx: i.stageIdx,
            dim: matchesFilters(f, unitIns, filters) ? 0 : 1,
          },
        }
      }),
    }
    const blockFC = {
      type: 'FeatureCollection' as const,
      features: blocks.features.map((f) => {
        const unit = (f.properties as unknown as { unit: string }).unit
        const i = ins.get(unit) || NO_WORK
        return { ...f, properties: { ...f.properties, stage_idx: i.stageIdx } }
      }),
    }
    return { segFC, blockFC }
  }, [segments, blocks, worklog, segLog, asOfDate, filters])

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [48.03, 29.31],
      zoom: 11.6,
      attributionControl: { compact: true, customAttribution: '© OpenStreetMap contributors' },
    })
    mapRef.current = map
    if (import.meta.env.DEV) {
      ;(window as unknown as { __map: maplibregl.Map }).__map = map
    }
    map.on('load', () => setMapReady(true))
    // The first style load occasionally wedges (observed after
    // StrictMode's create→remove→create). Poll, and kick it once.
    let kicked = false
    const readyPoll = setInterval(() => {
      if (map.isStyleLoaded()) {
        clearInterval(readyPoll)
        setMapReady(true)
      } else if (!kicked) {
        kicked = true
        map.setStyle(BASE_STYLE)
      }
    }, 1500)
    map.once('load', () => clearInterval(readyPoll))

    map.on('mousemove', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: interactiveLayers(map) })
      const f = feats[0]
      map.getCanvas().style.cursor = f ? 'pointer' : ''
      const prev = hoverIdRef.current
      const id = f ? (f.properties as SegmentProps).id : null
      if (prev && prev !== id) map.setFeatureState({ source: SOURCE_ID, id: prev }, { hover: false })
      if (id && prev !== id) map.setFeatureState({ source: SOURCE_ID, id }, { hover: true })
      hoverIdRef.current = id
      setHovered(id)
      if (f) {
        const p = f.properties as SegmentProps & { stage_idx: number }
        setTip({
          x: e.point.x,
          y: e.point.y,
          title: `${p.street || 'شارع بدون اسم'} · ${p.site}${p.block ? ' ق' + p.block : ''}`,
          sub: `ch ${String(p.from_ch).padStart(4, '0')}–${String(p.to_ch).padStart(4, '0')} · ${STAGES[p.stage_idx].label}`,
        })
      } else {
        setTip(null)
      }
    })
    map.on('mouseout', () => {
      if (hoverIdRef.current)
        map.setFeatureState({ source: SOURCE_ID, id: hoverIdRef.current }, { hover: false })
      hoverIdRef.current = null
      setHovered(null)
      setTip(null)
    })
    map.on('click', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: interactiveLayers(map) })
      setSelected(feats.length ? (feats[0].properties as SegmentProps).id : null)
    })
    return () => {
      clearInterval(readyPoll)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Source + layers once both map and data are ready; setData on re-derive.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !derived) return
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(derived.segFC)
      ;(map.getSource('blocks') as maplibregl.GeoJSONSource).setData(derived.blockFC)
      return
    }
    map.addSource(SOURCE_ID, { type: 'geojson', data: derived.segFC, promoteId: 'id' })
    map.addSource('blocks', { type: 'geojson', data: derived.blockFC })
    map.addLayer(blocksLayer())
    segmentLayers().forEach((l) => map.addLayer(l))
    // Grid + fit around the ACTIVE network (where dispatches actually go).
    const focus = derived.segFC.features.filter(
      (f) => f.properties.unit && activeUnits.has(f.properties.unit),
    )
    const fitTo = focus.length ? focus : derived.segFC.features
    let minX = 180, minY = 90, maxX = -180, maxY = -90
    for (const f of fitTo)
      for (const [x, y] of f.geometry.coordinates) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    map.addSource(GRID_SOURCE_ID, { type: 'geojson', data: gridGeoJSON(minX, minY, maxX, maxY) })
    map.addLayer(gridLayer(), 'blocks')
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 70, duration: 0 })
    // Street-name annotations for ACTIVE streets only.
    const labeled = new Set<string>()
    for (const f of focus) {
      const p = f.properties
      if (!p.street || !p.unit || labeled.has(p.unit)) continue
      labeled.add(p.unit)
      const mid = f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]
      const div = document.createElement('div')
      div.className = 'street-label'
      div.textContent = p.street
      labelsRef.current.push(div)
      new maplibregl.Marker({ element: div }).setLngLat(mid as [number, number]).addTo(map)
    }
    const updateLabels = () => {
      const show = map.getZoom() >= 14.3
      labelsRef.current.forEach((el) => { el.style.display = show ? '' : 'none' })
    }
    map.on('zoom', updateLabels)
    updateLabels()
  }, [mapReady, derived, activeUnits])

  // Satellite underlay toggle (Esri World Imagery, no account needed).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (satellite) {
      if (!map.getSource('sat')) map.addSource('sat', SAT_SOURCE)
      if (!map.getLayer('sat')) map.addLayer(SAT_LAYER, map.getLayer('grid') ? 'grid' : undefined)
    } else if (map.getLayer('sat')) {
      map.removeLayer('sat')
    }
  }, [satellite, mapReady])

  // Selection halo follows the store.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('seg-halo')) return
    map.setFilter('seg-halo', ['==', ['get', 'id'], selectedId ?? ''])
  }, [selectedId, mapReady])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() => setSatellite((s) => !s)}
        className={`absolute bottom-4 right-4 z-10 border px-3 py-1.5 text-[11px] tracking-wider ${
          satellite
            ? 'border-cyan-400/70 bg-[#0d1420]/92 text-cyan-300'
            : 'border-slate-700/70 bg-[#0d1420]/92 text-slate-400 hover:border-slate-500'
        }`}
      >
        🛰 صور جوية
      </button>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 border border-slate-600 bg-[#0d1420]/95 px-2.5 py-1.5 text-[11px] leading-4 text-slate-200"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <div className="font-bold">{tip.title}</div>
          <div className="text-slate-400">{tip.sub}</div>
        </div>
      )}
    </div>
  )
}

// queryRenderedFeatures throws if a layer id is not (yet) present.
function interactiveLayers(map: maplibregl.Map): string[] {
  return SEGMENT_LAYER_IDS.filter((id) => map.getLayer(id))
}
