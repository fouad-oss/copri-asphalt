// THE ordered stage list — the single source of truth.
// Colors, the progress rail, filters and violation detection all derive
// from this array. Never hardcode a stage name or index anywhere else.

export const STAGES = [
  { key: 'not_started', label: 'Not started' },
  { key: 'excavation', label: 'Excavation' },
  { key: 'pipelaying', label: 'Pipelaying' },
  { key: 'backfill', label: 'Backfill' },
  { key: 'temporary_asphalt', label: 'Temporary asphalt' },
  { key: 'milling', label: 'Milling' },
  { key: 'type_i', label: 'Type I' },
  { key: 'type_ii', label: 'Type II' },
  { key: 'type_iii', label: 'Type III' }, // = complete
] as const

export type StageKey = (typeof STAGES)[number]['key']

export const STAGE_INDEX = Object.fromEntries(
  STAGES.map((s, i) => [s.key, i]),
) as Record<StageKey, number>

export const COMPLETE_INDEX = STAGES.length - 1 // type_iii

export function isValidStage(key: string): key is StageKey {
  return key in STAGE_INDEX
}

// Warm→cold ramp, derived from stage order: early work runs hot (orange),
// completion lands cold (cyan). Stage 0 — untouched road — is a
// desaturated slate so it reads as background, not as work.
// `lift` raises lightness (hover/highlight variants).
export function stageColor(index: number, lift = 0): string {
  if (index <= 0) return `hsl(215, 12%, ${36 + lift}%)`
  const t = (index - 1) / (COMPLETE_INDEX - 1) // 0..1 across work stages
  const hue = 18 + t * 168 // 18 (hot orange) → 186 (cyan)
  const lightness = 54 + t * 8 + lift
  return `hsl(${Math.round(hue)}, 85%, ${Math.round(Math.min(lightness, 92))}%)`
}
