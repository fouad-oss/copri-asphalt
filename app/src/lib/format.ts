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

/** Kuwait wall-clock display for timestamptz values (fixed UTC+3, no DST). */
export function fmtKW(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString(i18n.language === "ar" ? "ar-KW" : "en-GB", {
    timeZone: "Asia/Kuwait",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", numberingSystem: "latn",
  } as Intl.DateTimeFormatOptions)
}

export function fmtKWDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString(i18n.language === "ar" ? "ar-KW" : "en-GB", {
    timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit",
    numberingSystem: "latn",
  } as Intl.DateTimeFormatOptions)
}

/** Age of the oldest item, for queue headers ("oldest: 2 days"). */
export function ageDays(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
