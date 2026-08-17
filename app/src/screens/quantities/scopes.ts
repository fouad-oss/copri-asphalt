// Scope-of-works taxonomy (Fouad, 2026-08-17). A work order carries a
// MULTI-select set of scope codes (qm_kashefs.scopes, 0062); the four
// reporting categories are asphalt / civil / metal / other, with civil
// sub-typed as general / stormwater / sewage / tiles-brickwork.
// `work_type` (free text) survives as the printable label — it is
// rewritten from the scopes on save, and shown as-is for rows that
// pre-date 0062 (Hawalli backfill).
import type { KashefOverview, ScopeCode } from "./data"

export type ScopeCategory = "asphalt" | "civil" | "metal" | "other"

export interface Scope {
  code: ScopeCode
  category: ScopeCategory
  ar: string
  en: string
}

export const SCOPES: Scope[] = [
  { code: "asphalt", category: "asphalt", ar: "أسفلت", en: "Asphalt" },
  { code: "civil",   category: "civil",   ar: "أعمال مدنية", en: "Civil works" },
  { code: "storm",   category: "civil",   ar: "أمطار", en: "Stormwater" },
  { code: "sewage",  category: "civil",   ar: "صحي", en: "Sewage" },
  { code: "tiles",   category: "civil",   ar: "بلاط", en: "Tiles / brickwork" },
  { code: "metal",   category: "metal",   ar: "أعمال معدنية", en: "Metal works" },
  { code: "other",   category: "other",   ar: "أخرى", en: "Other" },
]

export const CATEGORIES: { code: ScopeCategory; ar: string; en: string }[] = [
  { code: "asphalt", ar: "أسفلت", en: "Asphalt" },
  { code: "civil",   ar: "أعمال مدنية", en: "Civil works" },
  { code: "metal",   ar: "أعمال معدنية", en: "Metal works" },
  { code: "other",   ar: "أخرى", en: "Other" },
]

const BY_CODE = new Map(SCOPES.map((s) => [s.code, s]))

export function scopeLabel(code: ScopeCode, lang: string): string {
  const s = BY_CODE.get(code)
  return s ? (lang.startsWith("en") ? s.en : s.ar) : code
}

export function categoryLabel(code: ScopeCategory, lang: string): string {
  const c = CATEGORIES.find((x) => x.code === code)
  return c ? (lang.startsWith("en") ? c.en : c.ar) : code
}

// Ordered as the taxonomy lists them, deduplicated.
export function normalizeScopes(codes: ScopeCode[]): ScopeCode[] {
  return SCOPES.map((s) => s.code).filter((c) => codes.includes(c))
}

// The Arabic label stored back into work_type («أسفلت + أعمال معدنية»).
export function scopesToWorkType(codes: ScopeCode[]): string {
  return normalizeScopes(codes).map((c) => scopeLabel(c, "ar")).join(" + ")
}

export function categoriesOf(k: Pick<KashefOverview, "scopes" | "workType">): ScopeCategory[] {
  if (k.scopes.length) {
    return CATEGORIES.map((c) => c.code).filter((c) => k.scopes.some((s) => BY_CODE.get(s)?.category === c))
  }
  // legacy free text (pre-0062 rows): best-effort keyword mapping
  const wt = k.workType
  if (!wt) return []
  if (/أسفلت|اسفلت/.test(wt)) return ["asphalt"]
  if (/معدني/.test(wt)) return ["metal"]
  if (/مدني|أمطار|امطار|صحي|بلاط/.test(wt)) return ["civil"]
  return ["other"]
}

// Primary category for single-bucket breakdowns (dashboard «حسب نوع الأعمال»).
export function primaryCategory(k: Pick<KashefOverview, "scopes" | "workType">): ScopeCategory | null {
  return categoriesOf(k)[0] ?? null
}

// What to print/show as the work type: scopes when present, else legacy text.
export function workTypeLabel(k: Pick<KashefOverview, "scopes" | "workType">, lang: string): string {
  if (k.scopes.length) return normalizeScopes(k.scopes).map((c) => scopeLabel(c, lang)).join(" + ")
  return k.workType
}
