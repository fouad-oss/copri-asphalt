import i18n from "@/lib/i18n"

/** KD amounts: three decimals, thousands separators, Western digits in
 *  both languages (skill: codes/amounts stay Latin-script LTR). */
export function kd(v: number | string | null | undefined): string {
  const n = Number(v || 0)
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return i18n.language === "ar" ? `${s} د.ك` : `KD ${s}`
}

export function qty(v: number | string | null | undefined): string {
  return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
}

// The Arabic locale inserts U+200F (RTL mark) between the date parts
// («01‏/06‏/2025»); inside a dir="ltr"/<bdi> span those marks scramble the
// order. Dates are Latin-digit LTR tokens everywhere, so strip them.
const RLM = /[\u200e\u200f\u061c]/g

/** Kuwait wall-clock display for timestamptz values (fixed UTC+3, no DST). */
export function fmtKW(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString(i18n.language === "ar" ? "ar-KW" : "en-GB", {
    timeZone: "Asia/Kuwait",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", numberingSystem: "latn",
  } as Intl.DateTimeFormatOptions).replace(RLM, "")
}

/** Date-only (ISO date or timestamptz) → dd/mm/yyyy, no bidi marks.
 *  A bare ISO date («2025-06-01») is taken as a calendar date, not UTC
 *  midnight, so it never shifts a day. Wrap in <bdi dir="ltr"> when inline. */
export function fmtKWDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00+03:00") : new Date(iso)
  return d.toLocaleDateString(i18n.language === "ar" ? "ar-KW" : "en-GB", {
    timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit",
    numberingSystem: "latn",
  } as Intl.DateTimeFormatOptions).replace(RLM, "")
}

/** Age of the oldest item, for queue headers ("oldest: 2 days"). */
export function ageDays(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
