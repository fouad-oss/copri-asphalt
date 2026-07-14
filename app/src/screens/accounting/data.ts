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

export type Po = {
  id: number
  number: string
  sn_po: string
  po_date: string | null
  status: string
  vendor: string
}

export type PoLine = {
  line_id: number
  line_no: number
  item: string
  item_code: string | null
  unit: string
  rate: number | null
  order_qty: number | null
  remarks: string
  published_qty: number
  pending_qty: number
  remaining_qty: number | null
}

/** Active POs for the register selector (newest by DATE — PO numbers
 *  reset each fiscal year and must never imply recency). */
export async function poList(): Promise<Po[]> {
  const { data, error } = await supabase.from("commitments")
    .select("id,number,sn_po,po_date,status,vendors:vendor_id(name)")
    .eq("status", "نشط")
    .order("po_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, number: r.number, sn_po: r.sn_po ?? "", po_date: r.po_date,
    status: r.status, vendor: r.vendors?.name ?? "—",
  }))
}

/** Per-LINE balances — never aggregated per PO or per item code. */
export async function poLines(commitmentId: number): Promise<PoLine[]> {
  const [{ data, error }, codes] = await Promise.all([
    supabase.from("po_line_balance")
      .select("line_id,line_no,item,item_id,unit,rate,order_qty,remarks,published_qty,pending_qty,remaining_qty")
      .eq("commitment_id", commitmentId)
      .order("line_no", { ascending: true }),
    supabase.from("item_spectronova_ids").select("item_id,item_code"),
  ])
  if (error) throw error
  if (codes.error) throw codes.error
  const codeByItem: Record<number, string> = {}
  ;(codes.data ?? []).forEach((c: any) => { if (!(c.item_id in codeByItem)) codeByItem[c.item_id] = c.item_code })
  return (data ?? []).map((r: any) => ({
    line_id: r.line_id, line_no: r.line_no, item: r.item,
    item_code: r.item_id != null ? codeByItem[r.item_id] ?? null : null,
    unit: r.unit ?? "", rate: r.rate, order_qty: r.order_qty,
    remarks: r.remarks ?? "",
    published_qty: Number(r.published_qty ?? 0), pending_qty: Number(r.pending_qty ?? 0),
    remaining_qty: r.remaining_qty,
  }))
}

/** Append register lines to an existing PO (accountant manual entry). */
export async function addPoLines(
  pin: string, commitmentId: number,
  lines: { item: string; qty: number | null; unit: string; rate: number | null; remarks: string }[],
): Promise<void> {
  const { rpc } = await import("@/lib/supabase")
  const r = await rpc("po_lines_add", { p_pin: pin, p_commitment_id: commitmentId, p_lines: lines })
  if (!r?.success) throw new Error(r?.error || "failed")
}

/* ── Bundling (screens 3–4) ─────────────────────────────────────────── */

export type ReadyNote = {
  ref: number
  noteNo: string
  date: string | null
  site: string
  item: string
  itemId: number | null
  qty: number
}

export type PoLineOption = {
  lineId: number
  commitmentId: number
  po: string
  lineNo: number
  item: string
  itemId: number | null
  unit: string
  remaining: number | null
}

export type BundleRow = {
  id: number
  bundleNo: string
  status: "draft" | "verified" | "published"
  adjusts: number | null
  po: string
  lineNo: number | null
  lineItem: string
  notes: number
  qty: number
  amount: number
  imported: boolean
  snReference: string
  createdAt: string
}

let _plantIds: Set<number> | null = null
/** Vendor ids mapped to the plant's SN supplier (settings row is the
 *  config point; 5205 only as fallback). */
export async function plantVendorIds(): Promise<Set<number>> {
  if (_plantIds) return _plantIds
  const { data: setting } = await supabase.from("pipeline_settings")
    .select("value").eq("key", "plant_dispatch_supplier").maybeSingle()
  const contact = (setting?.value as any)?.contact_id || "5205"
  const { data, error } = await supabase.from("vendor_spectronova_ids")
    .select("vendor_id").eq("contact_id", contact)
  if (error) throw error
  _plantIds = new Set((data ?? []).map((r) => r.vendor_id))
  return _plantIds
}

/** Matched notes not yet in a bundle, oldest first. */
export async function readyNotes(channel: Channel): Promise<ReadyNote[]> {
  let q = supabase.from("note_bundle_ready")
    .select("note_ref,note_no,delivery_date,site,item_text,item_id,bill_qty")
    .eq("note_source", channel === "asphalt" ? "dispatch" : "material")
    .order("delivery_date", { ascending: true })
    .limit(400)
  if (channel === "asphalt") q = q.in("company", await copriNames())
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ref: r.note_ref, noteNo: r.note_no, date: r.delivery_date,
    site: r.site ?? "", item: r.item_text ?? "", itemId: r.item_id,
    qty: Number(r.bill_qty ?? 0),
  }))
}

/** Active PO lines offered for bundling on this channel. */
export async function poLineOptions(channel: Channel): Promise<PoLineOption[]> {
  const [plant, { data, error }] = await Promise.all([
    plantVendorIds(),
    supabase.from("po_line_balance")
      .select("line_id,commitment_id,po_number,sn_po,line_no,item,item_id,unit,remaining_qty,vendor_id,po_status")
      .order("line_no", { ascending: true })
      .limit(2000),
  ])
  if (error) throw error
  return (data ?? [])
    .filter((r: any) => (r.po_status ?? "نشط") === "نشط" &&
      (channel === "asphalt" ? plant.has(r.vendor_id) : !plant.has(r.vendor_id)))
    .map((r: any) => ({
      lineId: r.line_id, commitmentId: r.commitment_id,
      po: r.sn_po || r.po_number, lineNo: r.line_no, item: r.item,
      itemId: r.item_id, unit: r.unit ?? "", remaining: r.remaining_qty,
    }))
}

/** Last-used PO line per item PER PO, newest first (the suggestion). */
export async function lastUsedLines(): Promise<{ itemId: number; lineId: number }[]> {
  const { data, error } = await supabase.from("bundle_last_line")
    .select("item_id,commitment_line_id,created_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({ itemId: r.item_id, lineId: r.commitment_line_id }))
}

export async function bundlesList(channel: Channel): Promise<BundleRow[]> {
  const { data, error } = await supabase.from("bundles")
    .select("id,bundle_no,status,adjusts_bundle_id,imported_flag,sn_reference,created_at," +
      "bundle_lines(qty,amount),commitment_lines(line_no,item,commitments(number,sn_po))")
    .eq("source", channel)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((r: any) => {
    const bl = r.bundle_lines ?? []
    const cl = r.commitment_lines
    return {
      id: r.id, bundleNo: r.bundle_no, status: r.status,
      adjusts: r.adjusts_bundle_id,
      po: cl?.commitments?.sn_po || cl?.commitments?.number || "—",
      lineNo: cl?.line_no ?? null, lineItem: cl?.item ?? "",
      notes: bl.length,
      qty: bl.reduce((s: number, x: any) => s + Number(x.qty || 0), 0),
      amount: bl.reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
      imported: !!r.imported_flag, snReference: r.sn_reference ?? "",
      createdAt: r.created_at,
    }
  })
}

async function callRpc(fn: string, args: Record<string, unknown>) {
  const { rpc } = await import("@/lib/supabase")
  const r = await rpc(fn, args)
  if (!r?.success) throw new Error(r?.error || "failed")
  return r
}
export async function createBundle(pin: string, lineId: number, channel: Channel, refs: number[]) {
  return callRpc("bundle_create", {
    p_pin: pin, p_commitment_line_id: lineId, p_source: channel,
    p_notes: refs.map((ref) => ({ ref })),
  })
}
export async function setBundleStatus(pin: string, id: number, status: string) {
  return callRpc("bundle_status_set", { p_pin: pin, p_bundle_id: id, p_status: status })
}
export async function deleteBundle(pin: string, id: number) {
  return callRpc("bundle_delete", { p_pin: pin, p_bundle_id: id })
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
