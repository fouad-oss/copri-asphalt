import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../store'
import { currentStage } from '../lib/derive'
import { STAGES } from '../config/stages'
import { BASE_STYLE, SOURCE_ID, SEGMENT_LAYER_IDS, segmentLayers } from '../lib/mapStyle'
import type { SegmentProps } from '../types'

interface Tip {
  x: number
  y: number
  street: string
  block: string
  ch: string
  stage: string
}

// The primary view: every 100 m segment as a stroke, colored by its
// derived stage as of the store's asOfDate. Stage lives in a computed
// `stage_idx` property on a cloned FeatureCollection — never in the data.
export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const hoverIdRef = useRef<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [tip, setTip] = useState<Tip | null>(null)

  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
  const asOfDate = useApp((s) => s.asOfDate)
  const selectedId = useApp((s) => s.selectedId)
  const setSelected = useApp((s) => s.setSelected)
  const setHovered = useApp((s) => s.setHovered)

  // Derive stage_idx per feature for the current date.
  const enriched = useMemo(() => {
    if (!segments) return null
    return {
      type: 'FeatureCollection' as const,
      features: segments.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          stage_idx: currentStage(worklog, f.properties.id, asOfDate),
        },
      })),
    }
  }, [segments, worklog, asOfDate])

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [48.0505, 29.3015],
      zoom: 13.2,
      attributionControl: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) {
      // test/debug handle — the canvas is invisible to DOM-based checks
      ;(window as unknown as { __map: maplibregl.Map }).__map = map
    }
    map.on('load', () => setMapReady(true))

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
          street: p.street,
          block: p.block,
          ch: `${String(p.from_ch).padStart(4, '0')}–${String(p.to_ch).padStart(4, '0')}`,
          stage: STAGES[p.stage_idx].label,
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
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Source + layers once both map and data are ready; setData on re-derive.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !enriched) return
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(enriched)
      return
    }
    map.addSource(SOURCE_ID, { type: 'geojson', data: enriched, promoteId: 'id' })
    segmentLayers().forEach((l) => map.addLayer(l))
    // Fit the network once.
    let minX = 180, minY = 90, maxX = -180, maxY = -90
    for (const f of enriched.features)
      for (const [x, y] of f.geometry.coordinates) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 70, duration: 0 })
  }, [mapReady, enriched])

  // Selection halo follows the store.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('seg-halo')) return
    map.setFilter('seg-halo', ['==', ['get', 'id'], selectedId ?? ''])
  }, [selectedId, mapReady])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 border border-slate-600 bg-[#0d1420]/95 px-2.5 py-1.5 text-[11px] leading-4 text-slate-200"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <div className="font-bold">
            {tip.street} · block {tip.block}
          </div>
          <div className="text-slate-400">
            ch {tip.ch} · {tip.stage}
          </div>
        </div>
      )}
    </div>
  )
}

// queryRenderedFeatures throws if a layer id is not (yet) present.
function interactiveLayers(map: maplibregl.Map): string[] {
  return SEGMENT_LAYER_IDS.filter((id) => map.getLayer(id))
}
