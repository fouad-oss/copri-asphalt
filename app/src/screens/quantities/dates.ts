// Project date window (Fouad, 2026-08-17): both contracts kicked off
// around October 2024, so any WO / request / certificate date before that
// — or more than a month in the future — is a typo (the backfill audit
// found 18/03/2255, mm/dd swaps, 2004/2005/1901 …). Every date input in
// the module carries min/max from here and every save runs checkDate().
export const DATE_MIN = "2024-10-01"

export function dateMax(): string {
  const d = new Date()
  d.setDate(d.getDate() + 31)
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuwait" })   // yyyy-mm-dd
}

/** null when fine, else an i18n key describing the problem. */
export function checkDate(iso: string | null | undefined, required = false): string | null {
  if (!iso) return required ? "common.dateRequired" : null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "common.badDate"
  if (iso < DATE_MIN || iso > dateMax()) return "common.dateOutOfWindow"
  return null
}

export const dateInputProps = () => ({ min: DATE_MIN, max: dateMax() })
