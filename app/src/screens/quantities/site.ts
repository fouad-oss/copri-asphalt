// Site / location model per contract (Fouad, 2026-08-17).
//
// Two shapes, chosen by contract code:
//
//   "areas" (Hawalli HAW9)         area = المنطقة (سلوى / بيان / مشرف …)
//     level 1  قطعة + شارع  → loc_type 'block'  + block_no (street per طلب)
//              شارع رئيسي   → loc_type 'street' + street_name
//              أخرى         → loc_type 'misc'
//
//   "roads" (Expressway EXPW)      area = the road
//     level 1  طريق الفحيحيل (30) / طريق الملك فهد (40) / أخرى (free text)
//     level 2  range → km_from / km_to (+ direction)   } loc_type 'chainage'
//              spot  → a named تقاطع / مدخل / موقع     }
//              none  → loc_type 'misc' when the road is «أخرى», otherwise
//                      still 'chainage' (the road alone locates it)
//
// Nothing here changes the DB (0049 already has every column). The
// level-2 kind is DERIVED on read-back: km set ⇒ range, else text ⇒ spot.
// location_text keeps carrying whatever the ministry wrote for the
// historic rows; for new rows it holds the level-2 description only and
// the display prefixes the road when the text does not already name it.
import type { KashefOverview, LocType } from "./data"

export type SiteModel = "areas" | "roads"
export type SubKind = "range" | "spot" | "none"
export type RoadCode = "30" | "40" | "other"

export function siteModelFor(contractCode: string): SiteModel {
  return contractCode === "EXPW" ? "roads" : "areas"
}

export interface Road {
  code: Exclude<RoadCode, "other">
  name: string     // canonical Arabic, what gets stored in `area`
  en: string
  keys: string[]   // normalised substrings that identify the road
}

export const ROADS: Road[] = [
  { code: "30", name: "طريق الفحيحيل", en: "Fahaheel Expressway", keys: ["الفحيحيل", "الفحيحل"] },
  { code: "40", name: "طريق الملك فهد", en: "King Fahad Expressway", keys: ["الملك فهد", "الملكفهد"] },
]

export function normalizeAr(s: string): string {
  return s.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim()
}

// Which preset road does an `area` string name? A row naming two roads
// («طريق الملك فهد + الفحيحيل + النويصيب») is «other» — it is not on one road.
export function roadOf(area: string): RoadCode {
  const n = normalizeAr(area)
  if (!n || n.includes("+")) return "other"   // «A + B» spans more than one road
  const hits = ROADS.filter((r) => r.keys.some((k) => n.includes(normalizeAr(k))))
  return hits.length === 1 ? hits[0].code : "other"
}

export function roadName(code: RoadCode, fallback = ""): string {
  return ROADS.find((r) => r.code === code)?.name ?? fallback
}

// ── stations ─────────────────────────────────────────────────────────
// The ministry writes «محطة 200+9» (RTL rendering of 9+200 = 9.200 km).
// Accept "9+200", "9.2", "200+9" (mirrored) and plain metres-free "12".
// The 3-digit token is the metres part wherever it sits.
export function parseStation(s: string): number | null {
  const t = s.trim().replace(/\s+/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  if (!t) return null
  if (t.includes("+")) {
    const [a, b, ...rest] = t.split("+")
    if (rest.length || !/^\d+$/.test(a) || !/^\d+$/.test(b)) return null
    let km: string, m: string
    if (b.length === 3 && a.length !== 3) { km = a; m = b }
    else if (a.length === 3 && b.length !== 3) { km = b; m = a }
    else { km = a; m = b }                        // ambiguous → km+m as typed
    return Number(km) + Number(m) / 1000
  }
  const n = Number(t)
  return isFinite(n) && n >= 0 ? n : null
}

export function formatStation(km: number | null | undefined): string {
  if (km == null || !isFinite(km)) return ""
  const whole = Math.floor(km)
  const m = Math.round((km - whole) * 1000)
  return `${whole}+${String(m).padStart(3, "0")}`
}

// ── form state ───────────────────────────────────────────────────────
// One editable shape for both the new-WO form and the detail edit dialog.
export interface SiteState {
  area: string          // Hawalli area, or Expressway free-text road when road === "other"
  locType: LocType      // Hawalli level 1 (block/street/misc); ignored for roads (derived)
  blockNo: string
  streetName: string
  road: RoadCode        // roads model only
  sub: SubKind          // roads model only
  kmFrom: string        // station text as typed ("9+200")
  kmTo: string
  direction: string
  locationText: string  // spot name, or the free description for a range
}

export function emptySite(model: SiteModel): SiteState {
  return {
    area: "", locType: model === "roads" ? "chainage" : "block", blockNo: "", streetName: "",
    road: "30", sub: "range", kmFrom: "", kmTo: "", direction: "", locationText: "",
  }
}

export interface SiteFields {
  area: string
  locType: LocType
  blockNo: string
  streetName: string
  locationText: string
  kmFrom: number | null
  kmTo: number | null
  direction: string
}

// DB row → form state (derives road / level-2 kind).
export function siteFromRow(k: SiteFields, model: SiteModel): SiteState {
  const base = emptySite(model)
  if (model === "areas") {
    return {
      ...base, area: k.area,
      locType: k.locType === "chainage" ? "misc" : k.locType,
      blockNo: k.blockNo, streetName: k.streetName,
    }
  }
  // a misc row's `area` IS its description («صيانة لوبات تقاطع 16 … مع
  // الفحيحيل») — never re-read it as a road, or saving would overwrite it
  if (k.locType !== "chainage") {
    return { ...base, area: k.area, locType: k.locType, road: "other", sub: "none" }
  }
  const road = roadOf(k.area)
  const sub: SubKind = k.kmFrom != null || k.kmTo != null ? "range"
    : residualText(k) ? "spot" : "none"
  return {
    ...base, area: k.area, locType: k.locType, road, sub,
    kmFrom: formatStation(k.kmFrom), kmTo: formatStation(k.kmTo),
    direction: k.direction, locationText: k.locationText,
  }
}

// Form state → what the RPC stores. Returns an error key when invalid.
export function siteToFields(s: SiteState, model: SiteModel):
  { ok: true; f: SiteFields } | { ok: false; error: string } {
  if (model === "areas") {
    if (s.locType === "block" && !s.blockNo.trim()) return { ok: false, error: "new.blockNo" }
    if (s.locType === "street" && !s.streetName.trim()) return { ok: false, error: "new.streetName" }
    return { ok: true, f: {
      area: s.area.trim(), locType: s.locType === "chainage" ? "misc" : s.locType,
      blockNo: s.locType === "block" ? s.blockNo.trim() : "",
      streetName: s.locType === "street" ? s.streetName.trim() : "",
      locationText: "", kmFrom: null, kmTo: null, direction: "",
    } }
  }
  const area = s.road === "other" ? s.area.trim() : roadName(s.road)
  if (!area) return { ok: false, error: "new.road" }
  const direction = s.direction.trim()
  if (s.sub === "range") {
    const from = parseStation(s.kmFrom), to = parseStation(s.kmTo)
    if (from == null && to == null) return { ok: false, error: "new.kmFrom" }
    if ((s.kmFrom.trim() && from == null) || (s.kmTo.trim() && to == null)) return { ok: false, error: "new.badStation" }
    const text = s.locationText.trim() || rangeText(from, to)
    return { ok: true, f: { area, locType: "chainage", blockNo: "", streetName: "",
                            locationText: text, kmFrom: from, kmTo: to, direction } }
  }
  if (s.sub === "spot") {
    const text = s.locationText.trim()
    if (!text) return { ok: false, error: "new.spot" }
    return { ok: true, f: { area, locType: "chainage", blockNo: "", streetName: "",
                            locationText: text, kmFrom: null, kmTo: null, direction } }
  }
  // none
  if (s.road === "other") {
    return { ok: true, f: { area, locType: "misc", blockNo: "", streetName: "",
                            locationText: "", kmFrom: null, kmTo: null, direction: "" } }
  }
  // a preset road with no finer location: still chainage (0049 needs a
  // non-empty text) — the road itself, plus the direction if any
  return { ok: true, f: { area, locType: "chainage", blockNo: "", streetName: "",
                          locationText: [area, direction].filter(Boolean).join(" "),
                          kmFrom: null, kmTo: null, direction } }
}

export function rangeText(from: number | null, to: number | null): string {
  if (from != null && to != null) return `من محطة ${formatStation(from)} إلى محطة ${formatStation(to)}`
  if (from != null) return `عند محطة ${formatStation(from)}`
  if (to != null) return `إلى محطة ${formatStation(to)}`
  return ""
}

// ── display ──────────────────────────────────────────────────────────
export type SiteKind = "block" | "street" | "misc" | "range" | "spot" | "road"

// What location_text says beyond the road name and the direction —
// «طريق الفحيحيل بالاتجاهين» leaves nothing, so it is the whole road.
export function residualText(k: Pick<KashefOverview, "locationText" | "area" | "direction">): string {
  let t = normalizeAr(k.locationText)
  for (const part of [k.area, k.direction]) {
    const n = normalizeAr(part)
    if (n) t = t.split(n).join(" ")
  }
  return t.replace(/[\s—\-–,،]+/g, " ").trim()
}

export function siteKind(k: Pick<KashefOverview, "locType" | "kmFrom" | "kmTo" | "locationText" | "area" | "direction">): SiteKind {
  if (k.locType !== "chainage") return k.locType
  if (k.kmFrom != null || k.kmTo != null) return "range"
  return residualText(k) ? "spot" : "road"
}

export function locationLabel(
  k: Pick<KashefOverview, "locType" | "area" | "blockNo" | "streetName" | "locationText" | "kmFrom" | "kmTo" | "direction">,
  t: (key: string) => string,
): string {
  if (k.locType === "block") return `${k.area} — ${t("loc.blockShort")} ${k.blockNo}`
  if (k.locType === "street") return `${k.area} — ${k.streetName}`
  if (k.locType === "chainage") {
    const text = k.locationText.trim()
    if (!text) return `${k.area}${k.direction ? " " + k.direction : ""}`
    // historic rows already start with the road; new rows hold only level 2
    const nText = normalizeAr(text), nArea = normalizeAr(k.area), nDir = normalizeAr(k.direction)
    let out = nArea && !nText.includes(nArea) ? `${k.area} — ${text}` : text
    if (nDir && !nText.includes(nDir)) out += ` ${k.direction.trim()}`
    return out
  }
  return `${k.area} — ${t("loc.misc")}`
}
