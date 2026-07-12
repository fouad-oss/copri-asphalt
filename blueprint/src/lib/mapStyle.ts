import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import { COMPLETE_INDEX, STAGES, stageColor } from '../config/stages'

// Blueprint canvas: near-black background, no basemap, no provider tiles.
export const BASE_STYLE: StyleSpecification = {
  version: 8,
  name: 'blueprint',
  sources: {},
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0e14' } },
  ],
}

export const SOURCE_ID = 'segments'
// Layers a pointer can interact with (hover / click).
export const SEGMENT_LAYER_IDS = ['seg-not-started', 'seg-active', 'seg-complete']

// ['match', stage_idx, 0, c0, 1, c1, …] — the warm→cold ramp from the
// stage config, optionally lifted for the hover variant.
function colorMatch(lift: number): ExpressionSpecification {
  const expr: unknown[] = ['match', ['get', 'stage_idx']]
  STAGES.forEach((_, i) => expr.push(i, stageColor(i, lift)))
  expr.push(stageColor(0, lift)) // fallback (should not happen)
  return expr as unknown as ExpressionSpecification
}

// Hovered segments brighten via feature-state.
const lineColor: ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  colorMatch(16),
  colorMatch(0),
] as unknown as ExpressionSpecification

// Zoom-dependent stroke width, proportional to the real road width so the
// arterial reads heavier than block streets at every zoom, with a slight
// swell on hover. Zoom interpolate must be the TOP-LEVEL expression, so
// scaling (halo) multiplies the stop outputs instead of wrapping the whole
// expression.
const hoverBoost = ['case', ['boolean', ['feature-state', 'hover'], false], 1.4, 1]
function lineWidthExpr(scale = 1): ExpressionSpecification {
  const at = (k: number) => ['*', k * scale, ['get', 'width_m'], hoverBoost]
  return [
    'interpolate', ['linear'], ['zoom'],
    12, at(0.1),
    14.5, at(0.35),
    16, at(0.7),
    18, at(1.4),
  ] as unknown as ExpressionSpecification
}
const lineWidth = lineWidthExpr()

// Recolor/dim changes ease instead of snapping — this is what makes the
// time slider feel smooth.
const SMOOTH = {
  'line-color-transition': { duration: 250 },
  'line-opacity-transition': { duration: 250 },
  'line-width-transition': { duration: 120 },
}

// Faint graticule under the network — drafting-paper feel.
export const GRID_SOURCE_ID = 'grid'
export function gridGeoJSON(minX: number, minY: number, maxX: number, maxY: number) {
  const PAD = 0.015
  const STEP = 0.005
  const x0 = Math.floor((minX - PAD) / STEP) * STEP
  const x1 = Math.ceil((maxX + PAD) / STEP) * STEP
  const y0 = Math.floor((minY - PAD) / STEP) * STEP
  const y1 = Math.ceil((maxY + PAD) / STEP) * STEP
  const features = []
  for (let x = x0; x <= x1 + 1e-9; x += STEP)
    features.push({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[x, y0], [x, y1]] } })
  for (let y = y0; y <= y1 + 1e-9; y += STEP)
    features.push({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[x0, y], [x1, y]] } })
  return { type: 'FeatureCollection' as const, features }
}
export function gridLayer(): LayerSpecification {
  return {
    id: 'grid',
    type: 'line',
    source: GRID_SOURCE_ID,
    paint: { 'line-color': '#121a26', 'line-width': 0.7 },
  }
}

// Block (قطعة) boundaries — faint when idle, stage-colored when dispatch
// activity resolved only to the block (no matching street geometry).
export function blocksLayer(): LayerSpecification {
  return {
    id: 'blocks',
    type: 'line',
    source: 'blocks',
    paint: {
      'line-color': colorMatch(0),
      'line-width': ['case', ['>', ['get', 'stage_idx'], 0], 2, 0.8] as unknown as ExpressionSpecification,
      'line-opacity': ['case', ['>', ['get', 'stage_idx'], 0], 0.75, 0.35] as unknown as ExpressionSpecification,
      'line-dasharray': [4, 2.5],
      ...SMOOTH,
    },
  }
}

// Satellite underlay — Esri World Imagery (free with attribution).
export const SAT_SOURCE = {
  type: 'raster' as const,
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
}
export const SAT_LAYER = {
  id: 'sat',
  type: 'raster' as const,
  source: 'sat',
  paint: { 'raster-opacity': 0.55, 'raster-saturation': -0.4 },
} as LayerSpecification

const stageIdx: ExpressionSpecification = ['get', 'stage_idx'] as unknown as ExpressionSpecification

// Filtered-out segments stay as a faint ghost of the network.
const dimmable = (normal: number): ExpressionSpecification =>
  ['case', ['==', ['get', 'dim'], 1], 0.08, normal] as unknown as ExpressionSpecification

// Butt caps keep the 100 m segment boundaries crisp — a main street must
// read as a chain of adjacent, independently colored segments.
export function segmentLayers(): LayerSpecification[] {
  return [
    {
      // selection halo, filtered to one id via setFilter (empty = none)
      id: 'seg-halo',
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'id'], ''],
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': '#7dd3fc',
        'line-width': lineWidthExpr(2.4),
        'line-opacity': 0.35,
        'line-blur': 3,
      },
    },
    {
      // untouched network — the faint base line work
      id: 'seg-not-started',
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', stageIdx, 0],
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': lineColor, 'line-width': lineWidth, 'line-opacity': dimmable(0.85), ...SMOOTH },
    },
    {
      // in progress (stages 1..complete-1) — dashed
      id: 'seg-active',
      type: 'line',
      source: SOURCE_ID,
      filter: ['all', ['>', stageIdx, 0], ['<', stageIdx, COMPLETE_INDEX]],
      layout: { 'line-cap': 'butt' },
      paint: {
        'line-color': lineColor,
        'line-width': lineWidth,
        'line-dasharray': [2.2, 1.4],
        'line-opacity': dimmable(1),
        ...SMOOTH,
      },
    },
    {
      // complete — solid
      id: 'seg-complete',
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', stageIdx, COMPLETE_INDEX],
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': lineColor, 'line-width': lineWidth, 'line-opacity': dimmable(1), ...SMOOTH },
    },
    {
      // report-mode range selection — ids fed via setFilter
      id: 'seg-report',
      type: 'line',
      source: SOURCE_ID,
      filter: ['in', ['get', 'id'], ['literal', ['']]],
      layout: { 'line-cap': 'butt' },
      paint: {
        'line-color': '#22d3ee',
        'line-width': lineWidthExpr(1.5),
        'line-opacity': 0.95,
      },
    },
  ]
}
