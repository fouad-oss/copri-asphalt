/* Domain helpers for the dispatch module — faithful ports of the legacy
   index.html functions (normSp, shiftStartISO, autoWorkOrder, fetchNextLoad,
   dispatchRowToUI, dbSubmitDispatch/dbSubmitReceipt …). Gotchas preserved:
   timestamps are timestamptz UTC ISO end-to-end (Kuwait wall-clock is
   display-only), payload shapes match the RPCs exactly, and the delivery-
   note serial is DB-allocated — never typed, never client-generated. */

import { supabase, rpc } from "@/lib/supabase"
import type { DispatchConfig } from "./reference"

/* ── String / phone normalisation ── */
// Trim + collapse inner whitespace — keeps street-name load counts consistent.
export function normSp(s: unknown) { return String(s ?? "").trim().replace(/\s+/g, " ") }
// Digits-only phone for tel:/wa.me links (strips +, spaces, dashes).
export function cleanPhone(p: unknown) { return String(p ?? "").replace(/[^\d]/g, "") }
// Kuwait numbers stored full (965 + local); the UI shows a fixed +965 prefix.
export function localFromFull(full: string) { const d = cleanPhone(full); return d.indexOf("965") === 0 ? d.slice(3) : d }
export function phoneToFull(local: string) { const d = cleanPhone(local); if (!d) return ""; return d.indexOf("965") === 0 ? d : "965" + d }

/* ── Kuwait wall-clock (fixed UTC+3, no DST — calendar math in shifted epoch) ── */
// Start of the current work shift (most recent noon, Kuwait) as ISO — the
// boundary the per-location load counter resets at.
export function shiftStartISO() {
  const KW_OFF = 3 * 3600e3
  const kwNow = new Date(Date.now() + KW_OFF)
  const b = new Date(kwNow.getTime())
  b.setUTCHours(12, 0, 0, 0)                       // noon, Kuwait wall-clock
  if (kwNow.getUTCHours() < 12) b.setUTCDate(b.getUTCDate() - 1)
  return new Date(b.getTime() - KW_OFF).toISOString()
}
// Kuwait calendar day (yyyy-mm-dd) at an offset — planned-program day labels.
export function kwDayISO(offsetDays: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" })
    .format(new Date(Date.now() + (offsetDays || 0) * 864e5))
}

/* ── Location types ── */
// DB stores the Arabic loc-type LABEL; the client works with the code.
export const LOC_LABEL: Record<string, string> = {
  block_street: "قطعة / شارع", km_range: "نطاق كيلومتر", named: "اسم الشارع",
}
export function locCodeFromLabel(label: unknown) {
  for (const k of Object.keys(LOC_LABEL)) { if (LOC_LABEL[k] === String(label ?? "").trim()) return k }
  return "block_street"
}

export type DispatchData = {
  company: string
  project: string
  contract: string
  workOrder: string
  plant: string
  truckNumber: string
  naqel: string
  driverName: string
  driverPhone: string
  mixType: string
  weight: string
  tempDispatch: string
  site: string
  block: string
  street: string
  locationType: string
  clerkName: string
  notifyEngineer: string
  remarks: string
  loadNumber?: number | string
  noteNumber?: string
}

// Human-readable location string, aware of the three location types.
export function locDisplay(d: Pick<DispatchData, "block" | "street" | "locationType">) {
  if (d.locationType === "km_range") {
    if (!d.block && !d.street) return ""
    return `كم ${d.block || "?"} — ${d.street || "?"}`
  }
  if (d.locationType === "named") return d.block || ""   // name stored in block
  const parts: string[] = []
  if (d.block) parts.push(`ق ${d.block}`)
  if (d.street) parts.push(`ش ${d.street}`)
  return parts.join(" / ")
}

/* ── Locked auto-fill work order (CONFIG.contractWorkOrders semantics) ──
   The single active order covering a location for a discipline. Callers
   normalise a named street into `street` and leave `block` empty.
   discipline ∈ "asphalt" | "civil"; a WO tagged "both"/"كلا" matches either.
   Returns the WO string, "*" when a location is set but no order covers it,
   or "" when there is nothing to match on yet. NEVER user-editable. */
export function autoWorkOrder(
  cfg: DispatchConfig, projectName: string, site: string,
  block: string, street: string, discipline: string,
) {
  const b = normSp(block), st = normSp(street)
  if (!b && !st) return ""
  const siteKey = normSp(site), disc = String(discipline || "").toLowerCase()
  const discOK = (d: unknown) => {
    const dd = String(d ?? "").toLowerCase()
    if (!dd || /both|كلا/.test(dd)) return true
    if (disc === "asphalt") return /asphalt|أسفلت/.test(dd)
    if (disc === "civil") return /civil|مدني/.test(dd)
    return false
  }
  const hit = (cfg.contractWorkOrders || []).find((w) => {
    if (w.project && w.project !== projectName) return false
    if (w.site && normSp(w.site) !== siteKey) return false
    if (!discOK(w.discipline)) return false
    const wb = normSp(w.block), ws = normSp(w.street)
    if (b && wb) return wb === b && (!st || !ws || ws === st)
    if (st && ws) return ws === st
    return false
  })
  return hit ? String(hit.wo) : "*"
}

/* ── Row mapper: snake_case DB row → the UI shape (legacy dispatchRowToUI) ── */
export type DispatchRow = DispatchData & { tsISO: string; status: string }
export function dispatchRowToUI(r: any): DispatchRow {
  return {
    project: r.project || "", contract: r.contract || "", workOrder: r.work_order || "",
    noteNumber: String(r.note), plant: r.plant || "", truckNumber: r.truck, naqel: r.naqel || "",
    driverName: r.driver, driverPhone: r.driver_phone || "", company: r.company || "",
    mixType: r.mix, weight: r.weight == null ? "" : String(r.weight),
    tempDispatch: r.temp_dispatch == null ? "" : String(r.temp_dispatch), site: r.site,
    block: r.block || "", street: r.street || "", locationType: locCodeFromLabel(r.loc_type),
    clerkName: r.clerk, notifyEngineer: r.notify_engineer || "", remarks: r.remarks || "",
    loadNumber: r.load_number || "", tsISO: r.ts || "", status: r.status || "",
  }
}

/* ── Reads ── */
// Dispatch row by delivery-note number → UI shape, or null.
export async function dbDispatchByNote(note: string): Promise<DispatchRow | null> {
  const { data, error } = await supabase.from("dispatch_loads").select("*").eq("note", note).limit(1)
  if (error) throw error
  return data && data.length ? dispatchRowToUI(data[0]) : null
}

// Has this note already been receipted? (one-time-link check)
export async function dbCheckReceipt(note: string): Promise<{ alreadyReceived: boolean; engineer?: string; decision?: string; tsISO?: string }> {
  const { data, error } = await supabase.from("receipts").select("*")
    .eq("note", note).order("ts", { ascending: false }).limit(1)
  if (error) throw error
  if (!data || !data.length) return { alreadyReceived: false }
  return { alreadyReceived: true, engineer: data[0].engineer || "", decision: data[0].decision || "", tsISO: data[0].ts }
}

// Auto load count — next load number at this exact location within the
// current shift (resets at noon Kuwait). Location match is client-side with
// whitespace-normalised comparison (one shift × one site is a few dozen rows).
export async function fetchNextLoad(
  projectName: string, site: string, block: string, street: string, siteOnly: boolean,
): Promise<number | null> {
  try {
    const { data, error } = await supabase.from("dispatch_loads").select("block,street")
      .eq("project", normSp(projectName)).eq("site", normSp(site))
      .gte("ts", shiftStartISO()).limit(1000)
    if (error) throw error
    const rows = data || []
    const b = normSp(block), st = normSp(street)
    const count = siteOnly ? rows.length
      : rows.filter((r: any) => normSp(r.block) === b && normSp(r.street) === st).length
    return count + 1
  } catch { return null }
}

// Planned asphalt programs (0006 quick-pick): last night's shift .. tomorrow,
// status مخطط, this project only. Best-effort — the form works without it.
export async function fetchPlannedPrograms(projectName: string): Promise<any[]> {
  const { data, error } = await supabase.from("asphalt_programs").select("*")
    .gte("work_date", kwDayISO(-1)).lte("work_date", kwDayISO(1))
    .eq("status", "مخطط").order("work_date", { ascending: true }).limit(50)
  if (error) throw error
  return (data || []).filter((p: any) => p.project === projectName)
}

/* ── Writes (SECURITY DEFINER RPCs — atomic, serial allocated server-side) ── */
// clientRef makes retries idempotent: a resend after a dropped response
// returns the note that already landed (no double row, no burned serial).
export async function dbSubmitDispatch(data: DispatchData, clientRef: string): Promise<{ success: boolean; note?: string | number; error?: string }> {
  return rpc("dispatch_submit", {
    p_client_ref: clientRef || "",
    p_project: data.project || "", p_contract: data.contract || "", p_work_order: data.workOrder || "",
    p_plant: data.plant || "", p_truck: String(data.truckNumber || ""),
    p_driver: data.driverName || "", p_mix: data.mixType || "", p_weight: parseFloat(data.weight) || null,
    p_temp_dispatch: parseFloat(data.tempDispatch) || null, p_site: data.site || "",
    p_block: data.block || "", p_street: data.street || "",
    p_loc_type: LOC_LABEL[data.locationType] || LOC_LABEL.block_street,
    p_clerk: data.clerkName || "", p_remarks: data.remarks || "",
    p_company: data.company || "", p_naqel: data.naqel || "", p_driver_phone: data.driverPhone || "",
    p_load_number: data.loadNumber === "" || data.loadNumber == null ? null : Number(data.loadNumber),
    p_notify_engineer: data.notifyEngineer || "",
  })
}

// Receipt: one atomic RPC inserts the receipt AND reflects the decision on
// the dispatch row (no drift possible between the two).
export async function dbSubmitReceipt(p: {
  noteNumber: string; engineerName: string; workOrder: string; decision: string
  weightArrival: string; tempArrival: string; remarks: string
}): Promise<{ success: boolean; error?: string }> {
  return rpc("confirm_receipt", {
    p_note: String(p.noteNumber), p_engineer: p.engineerName || "",
    p_work_order: p.workOrder || "", p_decision: p.decision || "",
    p_weight_arrival: parseFloat(p.weightArrival) || null,
    p_temp_arrival: parseFloat(p.tempArrival) || null, p_remarks: p.remarks || "",
  })
}

/* ── Links / messages ── */
// Receipt link — the new-app route form (/dispatch/note/:id). The QR and the
// WhatsApp message both carry this.
export function receiptLinkFor(note: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "")
  return `${window.location.origin}${base}/dispatch/note/${encodeURIComponent(note)}`
}

// Pre-filled WhatsApp message (URL-encoded) for a dispatch — verbatim legacy.
export function whatsappMessage(data: DispatchData, receiptLink: string) {
  const loc = locDisplay(data)
  return encodeURIComponent(
    `🚛 شحنة أسفلت في الطريق\n\n` +
    `المشروع: ${data.project}\n` +
    `أمر العمل: ${data.workOrder}\n` +
    `رقم السند: ${data.noteNumber}\n` +
    (data.loadNumber ? `رقم الحمولة لهذا الموقع: ${data.loadNumber}\n` : "") +
    `الناقل: ${data.naqel}\n` +
    `السائق: ${data.driverName}${data.driverPhone ? ` (${data.driverPhone})` : ""}\n` +
    `الشاحنة: ${data.truckNumber}\n` +
    `الخلطة: ${data.mixType}\n` +
    `الوزن: ${data.weight} طن\n` +
    `الحرارة: ${data.tempDispatch}°م\n` +
    `الموقع: ${data.site}${loc ? " — " + loc : ""}\n\n` +
    `🔗 رابط الاستلام:\n${receiptLink}`
  )
}
