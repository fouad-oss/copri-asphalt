import { supabase } from "@/lib/supabase"

/* ── Accounting data layer ────────────────────────────────────────────
   Reads ride the note_recon view (asphalt) and material_receipts
   (materials — the view has no vendor column and the capture row is the
   note). Asphalt is Copri supply only: external-client loads are sales
   and never bill against our POs. */

export type Channel = "asphalt" | "materials"

export const ASPHALT_STATUSES = ["matched", "dispatched_not_received", "received_not_dispatched"] as const
export const MATERIAL_STATUSES = ["matched", "not_received", "no_po"] as const
export type NoteStatus =
  | (typeof ASPHALT_STATUSES)[number]
  | (typeof MATERIAL_STATUSES)[number]

export type AuditRow = {
  id: number
  noteNo: string
  site: string
  vendor: string
  item: string
  qty: number | null
  status: NoteStatus
  ts: string | null
}

let _copriNames: string[] | null = null
async function copriNames(): Promise<string[]> {
  if (_copriNames) return _copriNames
  const { data, error } = await supabase.from("companies").select("name").eq("is_copri", true)
  if (error) throw error
  _copriNames = (data ?? []).map((c) => c.name)
  return _copriNames
}

/** Exact status counts for the tiles (head counts — no rows). */
export async function auditCounts(channel: Channel): Promise<Record<string, number>> {
  const statuses = channel === "asphalt" ? ASPHALT_STATUSES : MATERIAL_STATUSES
  const out: Record<string, number> = {}
  await Promise.all(statuses.map(async (s) => {
    let q
    if (channel === "asphalt") {
      q = supabase.from("note_recon")
        .select("note_ref", { count: "exact", head: true })
        .eq("note_source", "dispatch").eq("recon_status", s)
        .in("company", await copriNames())
    } else {
      q = supabase.from("material_receipts")
        .select("id", { count: "exact", head: true })
        .eq("recon_status", s)
    }
    const { count, error } = await q
    if (error) throw error
    out[s] = count ?? 0
  }))
  return out
}

/** Oldest unmatched note (queue aging, skill §standing rules). */
export async function auditOldest(channel: Channel): Promise<string | null> {
  if (channel === "asphalt") {
    const { data, error } = await supabase.from("note_recon")
      .select("delivery_date")
      .eq("note_source", "dispatch").neq("recon_status", "matched")
      .in("company", await copriNames())
      .order("delivery_date", { ascending: true }).limit(1)
    if (error) throw error
    return data?.[0]?.delivery_date ?? null
  }
  const { data, error } = await supabase.from("material_receipts")
    .select("ts").neq("recon_status", "matched")
    .order("ts", { ascending: true }).limit(1)
  if (error) throw error
  return data?.[0]?.ts ?? null
}

const PAGE = 300

export async function auditRows(channel: Channel, status: NoteStatus | null): Promise<AuditRow[]> {
  if (channel === "asphalt") {
    let q = supabase.from("note_recon")
      .select("note_ref,note_no,site,bill_qty,recon_status,delivery_date")
      .eq("note_source", "dispatch")
      .in("company", await copriNames())
      .order("note_ref", { ascending: false })
      .limit(PAGE)
    if (status) q = q.eq("recon_status", status)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.note_ref, noteNo: r.note_no, site: r.site ?? "",
      vendor: "", item: "", qty: r.bill_qty, status: r.recon_status,
      ts: r.delivery_date,
    }))
  }
  let q = supabase.from("material_receipts")
    .select("id,receipt_id,site,material,quantity,unit,recon_status,ts,supplier,vendors:supplier_id(name)")
    .order("id", { ascending: false })
    .limit(PAGE)
  if (status) q = q.eq("recon_status", status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, noteNo: r.receipt_id, site: r.site ?? "",
    vendor: r.vendors?.name || r.supplier || "—",
    item: r.material ?? "", qty: r.quantity, status: r.recon_status,
    ts: r.ts,
  }))
}
