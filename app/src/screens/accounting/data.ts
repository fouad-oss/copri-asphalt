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

/* ── PO SOURCE SEAM (SN sync brief v2) ─────────────────────────────────
   SpectroNova is the PO master (decision 2026-08-12). The register and
   the bundling picker read from ONE of two sources, chosen at runtime by
   pipeline_settings.po_source = {"source":"legacy"|"sn"} (migration
   0065 seeds 'legacy'; flip the row after the first full sync). Every
   consumer goes through the functions below — nothing else changes when
   the switch flips. In SN mode: PO ids are sn_po_id, line ids are
   sn_po_line_id, received qty is Σ stock-receipt lines, bundles are
   created with bundle_create_sn. */
export type PoSource = "legacy" | "sn"
let _poSource: PoSource | null = null
export async function poSource(): Promise<PoSource> {
  if (_poSource) return _poSource
  const { data } = await supabase.from("pipeline_settings").select("value").eq("key", "po_source").maybeSingle()
  _poSource = (data?.value as any)?.source === "sn" ? "sn" : "legacy"
  return _poSource
}
/** Force a re-read (settings changed in this session). */
export function resetPoSource() { _poSource = null }

export type Po = {
  id: number                 // legacy: commitments.id · sn: sn_po_id
  number: string
  sn_po: string
  po_date: string | null
  status: string
  vendor: string
  source: PoSource
  department?: string
  isFixedAsset?: boolean
  isClosed?: boolean
  netAmount?: number | null
}

export type PoLine = {
  line_id: number            // legacy: commitment_lines.id · sn: sn_po_line_id
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
  received_qty?: number | null   // sn only — Σ stock-receipt lines (PO QuantityReceived is never maintained)
  receipt_count?: number
}

/** Active POs for the register selector (newest by DATE — PO numbers
 *  reset each fiscal year and must never imply recency). */
export async function poList(opts: { includeClosed?: boolean } = {}): Promise<Po[]> {
  if ((await poSource()) === "sn") {
    let q = supabase.from("sn_purchase_orders")
      .select("sn_po_id,po_number,po_date,is_fixed_asset,is_closed,supplier_name,department,net_amount")
      .order("po_date", { ascending: false, nullsFirst: false })
      .order("sn_po_id", { ascending: false })
      .limit(3000)
    if (!opts.includeClosed) q = q.eq("is_closed", false)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r: any) => ({
      id: r.sn_po_id, number: r.po_number, sn_po: r.po_number, po_date: r.po_date,
      status: r.is_closed ? "closed" : "open", vendor: r.supplier_name || "—", source: "sn",
      department: r.department ?? "", isFixedAsset: !!r.is_fixed_asset, isClosed: !!r.is_closed,
      netAmount: r.net_amount,
    }))
  }
  const { data, error } = await supabase.from("commitments")
    .select("id,number,sn_po,po_date,status,vendors:vendor_id(name)")
    .eq("status", "نشط")
    .order("po_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, number: r.number, sn_po: r.sn_po ?? "", po_date: r.po_date,
    status: r.status, vendor: r.vendors?.name ?? "—", source: "legacy",
  }))
}

/** Per-LINE balances — never aggregated per PO or per item code. */
export async function poLines(poId: number): Promise<PoLine[]> {
  if ((await poSource()) === "sn") {
    const { data, error } = await supabase.from("sn_po_line_balance")
      .select("line_id,line_no,item,item_code,unit,rate,order_qty,received_qty,receipt_count,published_qty,pending_qty,remaining_qty")
      .eq("sn_po_id", poId)
      .order("line_no", { ascending: true, nullsFirst: false })
      .order("line_id", { ascending: true })
    if (error) throw error
    return (data ?? []).map((r: any) => ({
      line_id: r.line_id, line_no: r.line_no ?? 0, item: r.item ?? "", item_code: r.item_code || null,
      unit: r.unit ?? "", rate: r.rate, order_qty: r.order_qty, remarks: "",
      published_qty: Number(r.published_qty ?? 0), pending_qty: Number(r.pending_qty ?? 0),
      remaining_qty: r.remaining_qty, received_qty: r.received_qty, receipt_count: Number(r.receipt_count ?? 0),
    }))
  }
  const commitmentId = poId
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
  commitmentId: number | null
  snPoId?: number | null
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

let _plantContacts: Set<string> | null = null
/** SN ContactDirectoryIDs of the plant supplier (settings row; 5205 fallback). */
async function plantContactIds(): Promise<Set<string>> {
  if (_plantContacts) return _plantContacts
  const { data: setting } = await supabase.from("pipeline_settings")
    .select("value").eq("key", "plant_dispatch_supplier").maybeSingle()
  const contact = String((setting?.value as any)?.contact_id || "5205")
  const { data } = await supabase.from("vendor_spectronova_ids").select("contact_id")
    .in("vendor_id", [...(await plantVendorIds())])
  _plantContacts = new Set([contact, ...(data ?? []).map((r: any) => String(r.contact_id))])
  return _plantContacts
}

/** Active PO lines offered for bundling on this channel. */
export async function poLineOptions(channel: Channel): Promise<PoLineOption[]> {
  if ((await poSource()) === "sn") {
    // SN mirror: open, non-fixed-asset POs only; asphalt = plant supplier, materials = everyone else
    const [plant, { data, error }] = await Promise.all([
      plantContactIds(),
      supabase.from("sn_po_line_balance")
        .select("line_id,sn_po_id,po_number,line_no,item,app_item_id,unit,remaining_qty,supplier_contact_id,is_closed,is_fixed_asset")
        .eq("is_closed", false).eq("is_fixed_asset", false)
        .order("po_date", { ascending: false, nullsFirst: false })
        .order("line_no", { ascending: true })
        .limit(3000),
    ])
    if (error) throw error
    return (data ?? [])
      .filter((r: any) => channel === "asphalt"
        ? plant.has(String(r.supplier_contact_id))
        : !plant.has(String(r.supplier_contact_id)))
      .map((r: any) => ({
        lineId: r.line_id, commitmentId: r.sn_po_id,
        po: r.po_number, lineNo: r.line_no ?? 0, item: r.item ?? "",
        itemId: r.app_item_id, unit: r.unit ?? "", remaining: r.remaining_qty,
      }))
  }
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
  if ((await poSource()) === "sn") {
    const { data, error } = await supabase.from("sn_bundle_last_line")
      .select("item_id,sn_po_line_id,created_at")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map((r: any) => ({ itemId: r.item_id, lineId: r.sn_po_line_id }))
  }
  const { data, error } = await supabase.from("bundle_last_line")
    .select("item_id,commitment_line_id,created_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({ itemId: r.item_id, lineId: r.commitment_line_id }))
}

export async function bundlesList(channel: Channel): Promise<BundleRow[]> {
  const { data, error } = await supabase.from("bundles")
    .select("id,bundle_no,status,adjusts_bundle_id,imported_flag,sn_reference,created_at," +
      "bundle_lines(qty,amount),commitment_lines(line_no,item,commitments(id,number,sn_po))," +
      "sn_po_lines(order_line_number,item_description,sn_purchase_orders(sn_po_id,po_number))")
    .eq("source", channel)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((r: any) => {
    const bl = r.bundle_lines ?? []
    const cl = r.commitment_lines
    const sl = r.sn_po_lines
    return {
      id: r.id, bundleNo: r.bundle_no, status: r.status,
      adjusts: r.adjusts_bundle_id,
      po: sl?.sn_purchase_orders?.po_number || cl?.commitments?.sn_po || cl?.commitments?.number || "—",
      commitmentId: cl?.commitments?.id ?? null,
      snPoId: sl?.sn_purchase_orders?.sn_po_id ?? null,
      lineNo: sl?.order_line_number ?? cl?.line_no ?? null, lineItem: sl?.item_description ?? cl?.item ?? "",
      notes: bl.length,
      qty: bl.reduce((s: number, x: any) => s + Number(x.qty || 0), 0),
      amount: bl.reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
      imported: !!r.imported_flag, snReference: r.sn_reference ?? "",
      createdAt: r.created_at,
    }
  })
}

/* ── Bundle detail (screen 5) ─────────────────────────────────────────
   The FROZEN column contract (agreed with SN staff — implement
   LITERALLY, additions at the END only, never rename or reorder). */
export const SN_COLUMNS = [
  "Supplier", "PO Number", "PO Line", "Item Code", "Item Description",
  "Qty", "UOM", "Unit Price", "Amount", "Delivery Date",
  "Supplier DN Number", "Site",
] as const

export type TranscriptionRow = {
  line_id: number
  supplier: string
  po_number: string
  po_line: number
  item_code: string
  description: string
  qty: number
  uom: string
  unit_price: number | null
  amount: number
  delivery_date: string | null
  supplier_dn: string
  site: string
}

export type BundleDetailData = {
  id: number
  bundleNo: string
  status: "draft" | "verified" | "published"
  source: Channel
  adjusts: number | null
  imported: boolean
  snReference: string
  publishedAt: string | null
  commitmentLineId: number | null
  commitmentId: number | null
  snPoLineId: number | null
  snPoId: number | null
  rows: TranscriptionRow[]
}

export function snCells(r: TranscriptionRow): (string | number)[] {
  const n3 = (v: number | null) => (v == null ? "" : Number(v).toFixed(3))
  return [r.supplier, r.po_number, r.po_line, r.item_code, r.description, r.qty,
          r.uom, n3(r.unit_price), n3(r.amount), r.delivery_date ?? "", r.supplier_dn, r.site]
}

/** The frozen contract as CSV bytes (BOM so Excel opens Arabic sites). */
export function buildSnCsv(rows: TranscriptionRow[]): Blob {
  const q = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const csv = "﻿" + [SN_COLUMNS.map(q).join(",")]
    .concat(rows.map((r) => snCells(r).map(q).join(",")))
    .join("\r\n")
  return new Blob([csv], { type: "text/csv;charset=utf-8" })
}

/* ── SN data page (screen 7 — external, token access) ─────────────────
   Reads go through the token-gated SECURITY DEFINER RPC (published rows
   only); the token rides the URL — no localStorage. */

export type SnPageRow = TranscriptionRow & {
  bundle_id: number
  bundle_no: string
  imported_flag: boolean
  sn_reference: string
  published_at: string | null
}

export async function snPageData(token: string): Promise<SnPageRow[]> {
  const { rpc } = await import("@/lib/supabase")
  const r = await rpc("sn_page_data", { p_token: token })
  if (!r?.success) throw new Error(r?.error === "bad token" ? "badToken" : "failed")
  return (r.rows ?? []) as SnPageRow[]
}

export async function snImportConfirm(token: string, bundleId: number, snReference: string) {
  const { rpc } = await import("@/lib/supabase")
  const r = await rpc("sn_import_confirm", { p_token: token, p_bundle_id: bundleId, p_sn_reference: snReference })
  if (!r?.success) throw new Error(r?.error || "failed")
}

export async function bundleDetail(id: number): Promise<BundleDetailData | null> {
  const [{ data: b, error: be }, { data: rows, error: re }] = await Promise.all([
    supabase.from("bundles")
      .select("id,bundle_no,status,source,adjusts_bundle_id,imported_flag,sn_reference,published_at,commitment_line_id,commitment_lines(commitment_id),sn_po_line_id,sn_po_lines(sn_po_id)")
      .eq("id", id).maybeSingle(),
    supabase.from("bundle_transcription")
      .select("line_id,supplier,po_number,po_line,item_code,description,qty,uom,unit_price,amount,delivery_date,supplier_dn,site")
      .eq("bundle_id", id).order("line_id", { ascending: true }),
  ])
  if (be) throw be
  if (re) throw re
  if (!b) return null
  return {
    id: b.id, bundleNo: b.bundle_no, status: b.status, source: b.source,
    adjusts: b.adjusts_bundle_id, imported: !!b.imported_flag,
    snReference: b.sn_reference ?? "", publishedAt: b.published_at,
    commitmentLineId: b.commitment_line_id ?? null,
    commitmentId: (b as any).commitment_lines?.commitment_id ?? null,
    snPoLineId: (b as any).sn_po_line_id ?? null,
    snPoId: (b as any).sn_po_lines?.sn_po_id ?? null,
    rows: (rows ?? []) as TranscriptionRow[],
  }
}

/** Original note refs of a bundle — the adjusting editor's source. */
export async function bundleNoteRefs(id: number): Promise<{ ref: number; noteNo: string; qty: number }[]> {
  const { data, error } = await supabase.from("bundle_lines")
    .select("note_ref,note_no,qty").eq("bundle_id", id).order("id", { ascending: true })
  if (error) throw error
  return (data ?? []).map((r: any) => ({ ref: r.note_ref, noteNo: r.note_no, qty: Number(r.qty ?? 0) }))
}

export async function importConfirm(pin: string, id: number, snReference: string) {
  return callRpc("bundle_import_confirm", { p_pin: pin, p_bundle_id: id, p_sn_reference: snReference })
}

async function callRpc(fn: string, args: Record<string, unknown>) {
  const { rpc } = await import("@/lib/supabase")
  const r = await rpc(fn, args)
  if (!r?.success) throw new Error(r?.error || "failed")
  return r
}
/** notes: qty override is the ADJUSTING mechanism only (negative =
 *  deduction); normal bundles pass refs without qty. */
export async function createBundle(
  pin: string, lineId: number, channel: Channel,
  notes: { ref: number; qty?: number }[], adjusts?: number,
  lineSource?: PoSource,
) {
  const src = lineSource ?? (await poSource())
  if (src === "sn") {
    return callRpc("bundle_create_sn", {
      p_pin: pin, p_sn_po_line_id: lineId, p_source: channel,
      p_notes: notes, ...(adjusts != null ? { p_adjusts: adjusts } : {}),
    })
  }
  return callRpc("bundle_create", {
    p_pin: pin, p_commitment_line_id: lineId, p_source: channel,
    p_notes: notes, ...(adjusts != null ? { p_adjusts: adjusts } : {}),
  })
}
export async function setBundleStatus(pin: string, id: number, status: string) {
  return callRpc("bundle_status_set", { p_pin: pin, p_bundle_id: id, p_status: status })
}
export async function deleteBundle(pin: string, id: number) {
  return callRpc("bundle_delete", { p_pin: pin, p_bundle_id: id })
}

/* ── GRN generator (screen 6) ─────────────────────────────────────────
   Numbers are REGISTERED (GRN-C-####, grn_docs + grn_doc_no RPC): one
   per target, so a reprint carries the same number. */

export type GrnNote = {
  ref: number
  noteNo: string
  date: string          // Kuwait calendar day, YYYY-MM-DD
  site: string
  item: string
  qty: number | null
  po: string            // via bundle membership; "" when unbundled
}

export type GrnNoteDetail = {
  ref: number
  noteNo: string
  date: string
  project: string
  site: string
  po: string
  supplier: string
  item: string
  qty: number | null
  unit: string
  engineer: string
  extra: "wo" | "sub"    // print label picked from L.grn by the builder
  extraValue: string
}

/** Kuwait calendar day as YYYY-MM-DD — i18n-independent (the shared
 *  fmtKWDate follows the saved language; its Arabic-locale RTL marks
 *  scramble inside these LTR English screens). */
export const kwDay = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(iso)) : ""

/** DN → PO map through bundle membership (anon sees published only).
 *  Newest bundles first so the 2000-row cap drops the oldest, not an
 *  arbitrary subset. */
export async function grnPoByDn(channel: Channel): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("bundle_transcription")
    .select("supplier_dn,po_number").eq("source", channel)
    .order("bundle_id", { ascending: false }).limit(2000)
  if (error) throw error
  const out: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { if (!(r.supplier_dn in out)) out[r.supplier_dn] = r.po_number })
  return out
}

/** Received notes for per-note GRNs (asphalt: matched = receipted).
 *  A day filter is applied SERVER-side — the newest-300 window would
 *  otherwise hide older days entirely. */
export async function grnNotes(channel: Channel, day?: string): Promise<GrnNote[]> {
  const poByDnP = grnPoByDn(channel)
  let rows: AuditRow[]
  if (channel === "asphalt") {
    let q = supabase.from("note_recon")
      .select("note_ref,note_no,site,bill_qty,recon_status,delivery_date,item_text")
      .eq("note_source", "dispatch").eq("recon_status", "matched")
      .in("company", await copriNames())
      .order("note_ref", { ascending: false }).limit(300)
    if (day) q = q.eq("delivery_date", day)
    const { data, error } = await q
    if (error) throw error
    rows = (data ?? []).map((r: any) => ({
      id: r.note_ref, noteNo: r.note_no, site: r.site ?? "", vendor: "",
      item: r.item_text ?? "", qty: r.bill_qty, status: r.recon_status, ts: r.delivery_date,
    }))
  } else {
    let q = supabase.from("material_receipts")
      .select("id,receipt_id,site,material,quantity,recon_status,ts")
      .order("id", { ascending: false }).limit(300)
    if (day) {
      // Kuwait calendar day → UTC range (fixed +03, no DST)
      const start = new Date(`${day}T00:00:00+03:00`)
      q = q.gte("ts", start.toISOString())
        .lt("ts", new Date(start.getTime() + 86400000).toISOString())
    }
    const { data, error } = await q
    if (error) throw error
    rows = (data ?? []).map((r: any) => ({
      id: r.id, noteNo: r.receipt_id, site: r.site ?? "", vendor: "",
      item: r.material ?? "", qty: r.quantity, status: r.recon_status, ts: r.ts,
    }))
  }
  const poByDn = await poByDnP
  return rows.map((r) => ({
    ref: r.id, noteNo: r.noteNo,
    date: channel === "asphalt" ? (r.ts ?? "") : kwDay(r.ts),
    site: r.site, item: r.item, qty: r.qty,
    po: poByDn[r.noteNo] ?? "",
  }))
}

async function plantSupplierLabel(): Promise<string> {
  const { data } = await supabase.from("pipeline_settings")
    .select("value").eq("key", "plant_dispatch_supplier").maybeSingle()
  return (data?.value as any)?.sn_name || "Asphalt Plant Amghara"
}

/** Full per-note rows for the printed sheets (engineer names, units). */
export async function grnNoteDetails(channel: Channel, refs: number[]): Promise<GrnNoteDetail[]> {
  const poByDn = await grnPoByDn(channel)
  if (channel === "asphalt") {
    const [{ data: loads, error }, supplier] = await Promise.all([
      supabase.from("dispatch_loads")
        .select("id,note,ts,project,site,block,street,mix,weight,work_order").in("id", refs),
      plantSupplierLabel(),
    ])
    if (error) throw error
    const notes = (loads ?? []).map((d: any) => d.note)
    const { data: recs, error: re } = await supabase.from("receipts")
      .select("note,engineer,ts").in("note", notes).order("ts", { ascending: true })
    if (re) throw re
    const recByNote: Record<string, any> = {}
    ;(recs ?? []).forEach((r: any) => { recByNote[r.note] = r })  // ts.asc → latest wins
    return (loads ?? []).map((d: any) => {
      const r = recByNote[d.note] ?? {}
      return {
        ref: d.id, noteNo: d.note,
        date: kwDay(r.ts ?? d.ts),
        project: d.project ?? "", site: [d.site, d.block && `B${d.block}`, d.street && `St ${d.street}`].filter(Boolean).join(" "),
        po: poByDn[d.note] ?? "",
        supplier, item: d.mix ?? "", qty: d.weight, unit: "Tons",
        engineer: r.engineer ?? "",
        extra: "wo" as const, extraValue: d.work_order && d.work_order !== "*" ? d.work_order : "",
      }
    })
  }
  const { data, error } = await supabase.from("material_receipts")
    .select("id,receipt_id,ts,project,site,block,street,material,quantity,unit,supplier,subcontractor,receiver,vendors:supplier_id(name)")
    .in("id", refs)
  if (error) throw error
  return (data ?? []).map((m: any) => ({
    ref: m.id, noteNo: m.receipt_id,
    date: kwDay(m.ts),
    project: m.project ?? "", site: [m.site, m.block && `B${m.block}`, m.street && `St ${m.street}`].filter(Boolean).join(" "),
    po: poByDn[m.receipt_id] ?? "",
    supplier: m.vendors?.name || m.supplier || "—",
    item: m.material ?? "", qty: m.quantity, unit: m.unit ?? "",
    engineer: m.receiver ?? "",
    extra: "sub" as const, extraValue: m.subcontractor ?? "",
  }))
}

/** Mint-or-return a registered GRN-C-#### number for one target. */
export async function grnDocNo(
  pin: string,
  target: { bundleId?: number; dispatchId?: number; materialReceiptId?: number },
): Promise<string> {
  const r = await callRpc("grn_doc_no", {
    p_pin: pin,
    p_bundle_id: target.bundleId ?? null,
    p_dispatch_id: target.dispatchId ?? null,
    p_material_receipt_id: target.materialReceiptId ?? null,
  })
  return r.grnNo as string
}

/* ── Cost-center scope (SN-style page-top filter) ─────────────────────
   The masters row is the config point. Delivery notes carry no cost
   center of their own — kind='project' rows scope by the linked app
   project's name; 'division' rows can never tag a note, so selecting
   one honestly matches nothing (the queue shows its empty state). */

export type CostCenter = { id: number; code: string; name: string; project: string | null }

let _costCenters: CostCenter[] | null = null
export async function costCenters(): Promise<CostCenter[]> {
  if (_costCenters) return _costCenters
  const { data, error } = await supabase.from("cost_centers")
    .select("id,code,name_en,name_ar,kind,projects:project_id(name)")
    .eq("active", true)
    .order("kind", { ascending: false })   // projects first, divisions after
    .order("code", { ascending: true })
  if (error) throw error
  _costCenters = (data ?? []).map((r: any) => ({
    id: r.id, code: r.code,
    name: r.name_en || r.name_ar || "",
    project: r.projects?.name ?? null,
  }))
  return _costCenters
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
export async function auditCounts(channel: Channel, cc?: CostCenter | null): Promise<Record<string, number>> {
  const statuses = channel === "asphalt" ? ASPHALT_STATUSES : MATERIAL_STATUSES
  const out: Record<string, number> = {}
  if (cc && cc.project == null) {          // division cost center — no notes can match
    statuses.forEach((s) => { out[s] = 0 })
    return out
  }
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
    if (cc?.project) q = q.eq("project", cc.project)
    const { count, error } = await q
    if (error) throw error
    out[s] = count ?? 0
  }))
  return out
}

/** Oldest unmatched note (queue aging, skill §standing rules). */
export async function auditOldest(channel: Channel, cc?: CostCenter | null): Promise<string | null> {
  if (cc && cc.project == null) return null
  if (channel === "asphalt") {
    let q = supabase.from("note_recon")
      .select("delivery_date")
      .eq("note_source", "dispatch").neq("recon_status", "matched")
      .in("company", await copriNames())
      .order("delivery_date", { ascending: true }).limit(1)
    if (cc?.project) q = q.eq("project", cc.project)
    const { data, error } = await q
    if (error) throw error
    return data?.[0]?.delivery_date ?? null
  }
  let q = supabase.from("material_receipts")
    .select("ts").neq("recon_status", "matched")
    .order("ts", { ascending: true }).limit(1)
  if (cc?.project) q = q.eq("project", cc.project)
  const { data, error } = await q
  if (error) throw error
  return data?.[0]?.ts ?? null
}

const PAGE = 300

export async function auditRows(channel: Channel, status: NoteStatus | null, cc?: CostCenter | null): Promise<AuditRow[]> {
  if (cc && cc.project == null) return []
  if (channel === "asphalt") {
    let q = supabase.from("note_recon")
      .select("note_ref,note_no,site,bill_qty,recon_status,delivery_date")
      .eq("note_source", "dispatch")
      .in("company", await copriNames())
      .order("note_ref", { ascending: false })
      .limit(PAGE)
    if (status) q = q.eq("recon_status", status)
    if (cc?.project) q = q.eq("project", cc.project)
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
  if (cc?.project) q = q.eq("project", cc.project)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, noteNo: r.receipt_id, site: r.site ?? "",
    vendor: r.vendors?.name || r.supplier || "—",
    item: r.material ?? "", qty: r.quantity, status: r.recon_status,
    ts: r.ts,
  }))
}

/* ── Note detail (screen 1b — the clickable audit row) ────────────────
   The WHOLE record, both sides: asphalt = the clerk's dispatch entry +
   every site receipt entry for the note (latest decides the match);
   materials = the capture row (the capture IS the receival) + its
   approval state. Bundle membership rides along for context. */

export const kwDateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso)) : "—"

export type NoteBundleRef = { id: number; bundleNo: string; status: string; isAdjustment: boolean }

export type AsphaltReceiptEntry = {
  id: number; ts: string; engineer: string; decision: string
  weightArrival: number | null; tempArrival: number | null
  workOrder: string; remarks: string
}

export type AsphaltNoteDetail = {
  channel: "asphalt"
  id: number; note: string; ts: string
  company: string; project: string; contract: string; workOrder: string
  plant: string; mix: string; weight: number | null; tempDispatch: number | null
  truck: string; driver: string; driverPhone: string; naqel: string
  site: string; block: string; street: string; locType: string
  clerk: string; status: string; remarks: string
  loadNumber: number | null; isMisc: boolean
  notifyEngineer: string
  reconStatus: NoteStatus; followupFlag: boolean
  receipts: AsphaltReceiptEntry[]
  bundles: NoteBundleRef[]
}

export type MaterialNoteDetail = {
  channel: "materials"
  id: number; receiptId: string; ts: string
  receiver: string; project: string; site: string; block: string; street: string
  workOrder: string; category: string; material: string
  quantity: number | null; unit: string
  supplier: string; subcontractor: string
  photoUrl: string; remarks: string
  approvalStatus: string; approvedBy: string; approvedAt: string | null
  exceptionNote: string; noPoFlag: boolean
  reconStatus: NoteStatus
  bundles: NoteBundleRef[]
}

export type NoteDetailData = AsphaltNoteDetail | MaterialNoteDetail

async function noteBundles(channel: Channel, ref: number): Promise<NoteBundleRef[]> {
  const { data, error } = await supabase.from("bundle_lines")
    .select("is_adjustment,bundles(id,bundle_no,status)")
    .eq("note_source", channel === "asphalt" ? "dispatch" : "material")
    .eq("note_ref", ref)
  if (error) throw error
  return (data ?? [])
    .filter((r: any) => r.bundles)
    .map((r: any) => ({
      id: r.bundles.id, bundleNo: r.bundles.bundle_no,
      status: r.bundles.status, isAdjustment: !!r.is_adjustment,
    }))
}

export async function noteDetail(channel: Channel, ref: number): Promise<NoteDetailData | null> {
  if (channel === "asphalt") {
    const [{ data, error }, bundles] = await Promise.all([
      supabase.from("dispatch_loads")
        .select("id,ts,note,project,contract,work_order,plant,truck,driver,mix,weight," +
          "temp_dispatch,site,block,street,loc_type,clerk,remarks,status,company,naqel," +
          "driver_phone,load_number,notify_engineer,is_misc,recon_status,followup_flag")
        .eq("id", ref).maybeSingle(),
      noteBundles(channel, ref),
    ])
    if (error) throw error
    if (!data) return null
    const d: any = data
    const { data: recs, error: re } = await supabase.from("receipts")
      .select("id,ts,engineer,decision,weight_arrival,temp_arrival,work_order,remarks")
      .eq("note", d.note).order("ts", { ascending: false })
    if (re) throw re
    return {
      channel: "asphalt",
      id: d.id, note: d.note, ts: d.ts,
      company: d.company ?? "", project: d.project ?? "", contract: d.contract ?? "",
      workOrder: d.work_order ?? "", plant: d.plant ?? "", mix: d.mix ?? "",
      weight: d.weight, tempDispatch: d.temp_dispatch,
      truck: d.truck ?? "", driver: d.driver ?? "", driverPhone: d.driver_phone ?? "",
      naqel: d.naqel ?? "", site: d.site ?? "", block: d.block ?? "", street: d.street ?? "",
      locType: d.loc_type ?? "", clerk: d.clerk ?? "", status: d.status ?? "",
      remarks: d.remarks ?? "", loadNumber: d.load_number, isMisc: !!d.is_misc,
      notifyEngineer: d.notify_engineer ?? "",
      reconStatus: d.recon_status, followupFlag: !!d.followup_flag,
      receipts: (recs ?? []).map((r: any) => ({
        id: r.id, ts: r.ts, engineer: r.engineer ?? "", decision: r.decision ?? "",
        weightArrival: r.weight_arrival, tempArrival: r.temp_arrival,
        workOrder: r.work_order ?? "", remarks: r.remarks ?? "",
      })),
      bundles,
    }
  }
  const [{ data, error }, bundles] = await Promise.all([
    supabase.from("material_receipts")
      .select("id,receipt_id,ts,receiver,project,site,work_order,block,street,category," +
        "material,quantity,unit,supplier,subcontractor,photo_url,remarks,approval_status," +
        "approved_by,approved_at,exception_note,no_po_flag,recon_status,vendors:supplier_id(name)")
      .eq("id", ref).maybeSingle(),
    noteBundles(channel, ref),
  ])
  if (error) throw error
  if (!data) return null
  const r: any = data
  return {
    channel: "materials",
    id: r.id, receiptId: r.receipt_id, ts: r.ts,
    receiver: r.receiver ?? "", project: r.project ?? "", site: r.site ?? "",
    block: r.block ?? "", street: r.street ?? "", workOrder: r.work_order ?? "",
    category: r.category ?? "", material: r.material ?? "",
    quantity: r.quantity, unit: r.unit ?? "",
    supplier: r.vendors?.name || r.supplier || "",
    subcontractor: r.subcontractor ?? "",
    photoUrl: r.photo_url ?? "", remarks: r.remarks ?? "",
    approvalStatus: r.approval_status ?? "", approvedBy: r.approved_by ?? "",
    approvedAt: r.approved_at, exceptionNote: r.exception_note ?? "",
    noPoFlag: !!r.no_po_flag, reconStatus: r.recon_status,
    bundles,
  }
}

/* ── SN sync panel (SN sync brief v2) ─────────────────────────────────
   Reads: sn_sync_status view, sn_sync_runs, sn_sync_alerts, the legacy
   reconciliation view. Writes: sn_alert_dismiss RPC (accountant/admin)
   and the sn-sync edge function ("Sync now", admins — checked server-side
   via sn_sync_may_trigger()). */

export type SnSyncStatus = {
  runId: number | null; startedAt: string | null; finishedAt: string | null
  trigger: string; triggeredBy: string; status: string
  stages: SnStage[]; requests: number; error: string
  openAlerts: number; poCount: number; srCount: number; invoiceCount: number; vendorCount: number; itemCount: number
}
export type SnStage = { stage: string; ms: number; requests: number; fetched: number; inserted: number; updated: number; unchanged: number; missed: number; errors: number; note?: string }
export type SnRun = { id: number; startedAt: string; finishedAt: string | null; trigger: string; triggeredBy: string; status: string; scope: string; requests: number; invocations: number; error: string; stages: SnStage[]; cursor: any }
export type SnAlert = { id: number; runId: number | null; kind: string; refType: string; refId: number | null; refNumber: string; detail: any; createdAt: string; dismissedAt: string | null; dismissedBy: string }
export type ReconRow = {
  bucket: "matched" | "legacy_only" | "sn_only"
  commitmentId: number | null; appNumber: string; snPo: string; appStatus: string; appVendor: string; appValue: number | null; appLines: number; appBundles: number
  snPoId: number | null; poNumber: string; isFixedAsset: boolean; isClosed: boolean; supplierName: string; department: string; snNet: number | null; snLines: number; valueDelta: number | null
}

export async function snSyncStatus(): Promise<SnSyncStatus | null> {
  const { data, error } = await supabase.from("sn_sync_status").select("*").maybeSingle()
  if (error) throw error
  if (!data) return null
  const r: any = data
  return {
    runId: r.run_id, startedAt: r.started_at, finishedAt: r.finished_at, trigger: r.trigger, triggeredBy: r.triggered_by,
    status: r.status, stages: (r.stages ?? []) as SnStage[], requests: r.requests, error: r.error ?? "",
    openAlerts: Number(r.open_alerts ?? 0), poCount: Number(r.po_count ?? 0), srCount: Number(r.sr_count ?? 0),
    invoiceCount: Number(r.invoice_count ?? 0), vendorCount: Number(r.vendor_count ?? 0), itemCount: Number(r.item_count ?? 0),
  }
}
export async function snRuns(limit = 10): Promise<SnRun[]> {
  const { data, error } = await supabase.from("sn_sync_runs")
    .select("id,started_at,finished_at,trigger,triggered_by,status,scope,requests,invocations,error,stages,cursor")
    .order("started_at", { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, trigger: r.trigger, triggeredBy: r.triggered_by,
    status: r.status, scope: r.scope, requests: r.requests, invocations: r.invocations, error: r.error ?? "",
    stages: (r.stages ?? []) as SnStage[], cursor: r.cursor,
  }))
}
export async function snAlerts(includeDismissed = false, limit = 200): Promise<SnAlert[]> {
  let q = supabase.from("sn_sync_alerts")
    .select("id,run_id,kind,ref_type,ref_id,ref_number,detail,created_at,dismissed_at,dismissed_by")
    .order("created_at", { ascending: false }).limit(limit)
  if (!includeDismissed) q = q.is("dismissed_at", null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, runId: r.run_id, kind: r.kind, refType: r.ref_type, refId: r.ref_id, refNumber: r.ref_number ?? "",
    detail: r.detail, createdAt: r.created_at, dismissedAt: r.dismissed_at, dismissedBy: r.dismissed_by ?? "",
  }))
}
export async function snAlertDismiss(id: number) {
  const { rpc } = await import("@/lib/supabase")
  const r = await rpc("sn_alert_dismiss", { p_alert_id: id })
  if (!r?.success) throw new Error(r?.error || "failed")
}
/** Start a sync run via the edge function with the caller's JWT (admins only, enforced server-side). */
export async function snSyncTrigger(scope: "quick" | "full"): Promise<{ runId: number; resume: boolean }> {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import("@/lib/supabase")
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error("no session")
  const r = await fetch(`${SUPABASE_URL}/functions/v1/sn-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ scope }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`)
  return { runId: j.runId, resume: !!j.resume }
}
export async function legacyRecon(): Promise<ReconRow[]> {
  const { data, error } = await supabase.from("sn_legacy_po_recon").select("*").limit(3000)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    bucket: r.bucket, commitmentId: r.commitment_id, appNumber: r.app_number ?? "", snPo: r.sn_po ?? "", appStatus: r.app_status ?? "",
    appVendor: r.app_vendor ?? "", appValue: r.app_value, appLines: Number(r.app_lines ?? 0), appBundles: Number(r.app_bundles ?? 0),
    snPoId: r.sn_po_id, poNumber: r.po_number ?? "", isFixedAsset: !!r.is_fixed_asset, isClosed: !!r.is_closed,
    supplierName: r.supplier_name ?? "", department: r.department ?? "", snNet: r.sn_net_amount, snLines: Number(r.sn_lines ?? 0), valueDelta: r.value_delta,
  }))
}
