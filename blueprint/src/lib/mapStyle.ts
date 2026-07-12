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
// arterial reads heavier than block streets at every zoom. Zoom interpolate
// must be the TOP-LEVEL expression, so scaling (halo) multiplies the stop
// outputs instead of wrapping the whole expression.
function lineWidthExpr(scale = 1): ExpressionSpecification {
  const at = (k: number) => ['*', k * scale, ['get', 'width_m']]
  return [
    'interpolate', ['linear'], ['zoom'],
    12, at(0.1),
    14.5, at(0.35),
    16, at(0.7),
    18, at(1.4),
  ] as unknown as ExpressionSpecification
}
const lineWidth = lineWidthExpr()

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
      paint: { 'line-color': lineColor, 'line-width': lineWidth, 'line-opacity': dimmable(0.85) },
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
      },
    },
    {
      // complete — solid
      id: 'seg-complete',
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', stageIdx, COMPLETE_INDEX],
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': lineColor, 'line-width': lineWidth, 'line-opacity': dimmable(1) },
    },
  ]
}
