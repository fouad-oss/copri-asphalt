import type { StageKey } from './stages'

// Tonnage → area conversion factors (user-supplied, 2026-07-12).
// PAVING is a live singleton: these defaults apply until the store loads
// the office-adjustable values from blueprint_settings (key 'paving');
// the ⚙ settings panel writes them back through a PIN-gated RPC.
// Components that render these values re-derive off the store's pavingRev.
export const PAVING_DEFAULTS = {
  density_t_m3: 2.35, // compacted asphalt density
  layingWidth_m: 8, // default paved width for coverage math (OSM class widths only drive stroke rendering)
  thickness_cm: {
    type_i: 6,
    type_ii: 5,
    type_iii: 4,
  } as Partial<Record<StageKey, number>>,
}

export const PAVING = {
  density_t_m3: PAVING_DEFAULTS.density_t_m3,
  layingWidth_m: PAVING_DEFAULTS.layingWidth_m,
  thickness_cm: { ...PAVING_DEFAULTS.thickness_cm },
}

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && isFinite(v) && v > lo && v <= hi ? v : null

// Merge a blueprint_settings 'paving' value into the singleton. Ignores
// anything malformed field-by-field, so a bad save can never brick the
// coverage math. Returns true when at least one field applied.
export function applyPavingSettings(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  let applied = false
  const d = num(s.density_t_m3, 0.5, 5)
  if (d) { PAVING.density_t_m3 = d; applied = true }
  const w = num(s.layingWidth_m, 1, 40)
  if (w) { PAVING.layingWidth_m = w; applied = true }
  if (s.thickness_cm && typeof s.thickness_cm === 'object') {
    for (const k of ['type_i', 'type_ii', 'type_iii'] as StageKey[]) {
      const t = num((s.thickness_cm as Record<string, unknown>)[k], 0.5, 30)
      if (t) { PAVING.thickness_cm[k] = t; applied = true }
    }
  }
  return applied
}

// Human label for a report's width fraction (½ العرض …).
const FRACTIONS: [number, string][] = [[1, 'كامل'], [0.75, '¾'], [2 / 3, '⅔'], [0.5, '½'], [1 / 3, '⅓'], [0.25, '¼']]
export function fracLabel(f: number): string {
  for (const [v, label] of FRACTIONS) if (Math.abs(f - v) < 0.02) return label
  return `${Math.round(f * 100)}٪`
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
