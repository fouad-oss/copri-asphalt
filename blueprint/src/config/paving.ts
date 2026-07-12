import type { StageKey } from './stages'

// Tonnage → area conversion factors (user-supplied, 2026-07-12).
// One editable object by design: the plan is a small in-app settings
// panel (backed by Supabase app_settings) so the office can adjust these
// without a deploy. Until then, this file is the single source.
export const PAVING = {
  density_t_m3: 2.35, // compacted asphalt density
  layingWidth_m: 8, // default paved width for coverage math (OSM class widths only drive stroke rendering)
  thickness_cm: {
    type_i: 6,
    type_ii: 5,
    type_iii: 4,
  } as Partial<Record<StageKey, number>>,
}

// t/m² for a layer, e.g. Type II: 0.05 m × 2.35 t/m³ = 0.1175 t/m².
export function tonsPerM2(stage: StageKey): number | null {
  const t = PAVING.thickness_cm[stage]
  return t ? (t / 100) * PAVING.density_t_m3 : null
}

export function tonsToM2(stage: StageKey, tons: number): number | null {
  const rate = tonsPerM2(stage)
  return rate ? tons / rate : null
}
