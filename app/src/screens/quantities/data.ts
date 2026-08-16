// Quantities module data layer. Reads go through PostgREST (RLS:
// authenticated-only — an anon/PIN session gets empty sets / errors);
// writes go through the qm_* SECURITY DEFINER RPCs, which return the
// { success, error, … } envelope.
import { supabase, rpc } from "@/lib/supabase"

// 'chainage' locates a work order along a highway by station rather than
// by قطعة/شارع — the Expressway contract's model. locationText carries the
// ministry's own wording and is the authoritative field; km/direction are
// the optional structured extract. See migration 0049.
export type LocType = "block" | "street" | "misc" | "chainage"

export interface BopItem {
  id: number
  bab: number
  band: number
  suffix: string | null
  description: string
  unit: string
  rate: number
}

export interface KashefOverview {
  id: number
  contractCode: string
  pct: number
  kashefNo: number
  area: string
  locType: LocType
  blockNo: string
  streetName: string
  workType: string
  status: "kashef" | "wo"
  woNo: string
  woDate: string | null
  kashefDate: string
  lineCount: number
  subtotal: number
  totalAfterPct: number
  allocatedValue: number
  executedValue: number
  tadqiqCount: number
  durationDays: number | null
  closed: boolean
  contractValue: number | null
  locationText: string
  kmFrom: number | null
  kmTo: number | null
  direction: string
}

export interface LineStatus {
  kashefLineId: number
  bopItemId: number
  qty: number
  bab: number
  band: number
  suffix: string | null
  description: string
  unit: string
  rate: number
  lineTotal: number
  allocatedTotal: number
  executedTotal: number
}

export interface SubLineStatus {
  kashefLineId: number
  bopItemId: number
  vendorId: number
  vendorName: string
  bab: number
  band: number
  suffix: string | null
  description: string
  unit: string
  rate: number
  kashefQty: number
  allocated: number
  executed: number
}

export interface Subcontractor {
  id: number
  name: string
}

export interface TadqiqRow {
  id: number
  kashefId: number
  vendorId: number
  vendorName: string
  date: string
  serialNo: string
  streetNo: string
  note: string
  opening: boolean
  lines: { bopItemId: number; qty: number; outOfKashef: boolean; overAllocation: boolean }[]
}

export interface ChangelogRow {
  id: number
  entity: string
  action: string
  field: string
  lineRef: string
  oldValue: string
  newValue: string
  actorEmail: string
  createdAt: string
}

// bab/band display id — always rendered inside a dir="ltr" isolate.
export function itemRef(i: { bab: number; band: number; suffix?: string | null }): string {
  return `${i.bab}/${i.band}${i.suffix ?? ""}`
}

// ── Selected project ─────────────────────────────────────────────────
// Every qm_* table hangs off a contract (unique(contract_id, kashef_no),
// so each project keeps its own WO numbering and its own BOP). The whole
// module reads whichever contract is selected in the header.
const CONTRACT_KEY = "qm.contract"
const DEFAULT_CONTRACT = "HAW9"

let currentContract =
  (typeof localStorage !== "undefined" && localStorage.getItem(CONTRACT_KEY)) || DEFAULT_CONTRACT

export function getContract(): string {
  return currentContract
}

/** Switch project: clears the per-project caches so screens refetch. */
export function setContract(code: string) {
  if (code === currentContract) return
  currentContract = code
  try { localStorage.setItem(CONTRACT_KEY, code) } catch { /* private mode */ }
  contractCache.clear()
  bopCache.clear()
}

// ── Reads ────────────────────────────────────────────────────────────

export interface ContractInfo {
  id: number
  code: string
  contractNo: string
  name: string
  contractor: string
  pct: number
}

const contractCache = new Map<string, ContractInfo>()
export async function contractInfo(code = getContract()): Promise<ContractInfo> {
  const hit = contractCache.get(code)
  if (hit) return hit
  const { data, error } = await supabase
    .from("qm_contracts")
    .select("id,code,contract_no,name,contractor,pct")
    .eq("code", code).single()
  if (error) throw error
  const info: ContractInfo = {
    id: data.id, code: data.code, contractNo: data.contract_no, name: data.name,
    contractor: data.contractor, pct: Number(data.pct),
  }
  contractCache.set(code, info)
  return info
}

/** All projects, for the header switcher. */
export async function contractList(): Promise<ContractInfo[]> {
  const { data, error } = await supabase
    .from("qm_contracts")
    .select("id,code,contract_no,name,contractor,pct")
    .order("id")
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, code: r.code, contractNo: r.contract_no, name: r.name,
    contractor: r.contractor, pct: Number(r.pct),
  }))
}

async function contractId(): Promise<number> {
  return (await contractInfo()).id
}

// Each project has its own BOP (~1,310 rows for Hawalli); PostgREST caps a
// single request at 1,000 — page through and cache per project.
const bopCache = new Map<string, BopItem[]>()
export async function bopItems(): Promise<BopItem[]> {
  const code = getContract()
  const hit = bopCache.get(code)
  if (hit) return hit
  const cid = await contractId()
  const out: BopItem[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("qm_bop_items")
      .select("id,bab,band,suffix,description,unit,rate")
      .eq("contract_id", cid)
      .order("bab").order("band").order("suffix", { nullsFirst: true })
      .range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []).map((r: any) => ({ ...r, rate: Number(r.rate) })))
    if (!data || data.length < 1000) break
  }
  // A project whose جدول الأسعار has not been seeded yet legitimately has
  // no items — return empty (and don't cache it, so the screens pick the
  // price book up as soon as it lands) rather than failing the screen.
  if (out.length > 0) bopCache.set(code, out)
  return out
}

export async function kashefList(): Promise<KashefOverview[]> {
  const { data, error } = await supabase
    .from("qm_kashef_overview")
    .select("*")
    .eq("contract_code", getContract())
    .order("kashef_no", { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOverview)
}

export async function kashefOne(id: number): Promise<KashefOverview | null> {
  const { data, error } = await supabase
    .from("qm_kashef_overview").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data ? mapOverview(data) : null
}

function mapOverview(r: any): KashefOverview {
  return {
    id: r.id, contractCode: r.contract_code, pct: Number(r.pct),
    kashefNo: r.kashef_no, area: r.area, locType: r.loc_type,
    blockNo: r.block_no, streetName: r.street_name, workType: r.work_type,
    status: r.status, woNo: r.wo_no, woDate: r.wo_date, kashefDate: r.kashef_date,
    lineCount: r.line_count, subtotal: Number(r.subtotal),
    totalAfterPct: Number(r.total_after_pct),
    allocatedValue: Number(r.allocated_value), executedValue: Number(r.executed_value),
    tadqiqCount: r.tadqiq_count,
    durationDays: r.duration_days ?? null,
    closed: !!r.closed,
    contractValue: r.contract_value != null ? Number(r.contract_value) : null,
    locationText: r.location_text ?? "",
    kmFrom: r.km_from != null ? Number(r.km_from) : null,
    kmTo: r.km_to != null ? Number(r.km_to) : null,
    direction: r.direction ?? "",
  }
}

// ── Dashboard reads (0039 views) ─────────────────────────────────────

export interface SubTotal {
  vendorId: number
  vendorName: string
  allocatedValue: number   // pre-pct KD
  executedValue: number    // pre-pct KD
  lastTadqiqDate: string | null  // latest non-opening tadqiq
  tadqiqCount: number
  allocatedWos: number
}

export async function subTotals(): Promise<SubTotal[]> {
  const { data, error } = await supabase
    .from("qm_sub_totals").select("*").eq("contract_id", await contractId())
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    vendorId: r.vendor_id, vendorName: r.vendor_name,
    allocatedValue: Number(r.allocated_value), executedValue: Number(r.executed_value),
    lastTadqiqDate: r.last_tadqiq_date ?? null, tadqiqCount: r.tadqiq_count,
    allocatedWos: r.allocated_wos,
  }))
}

export interface MonthlyExec {
  month: string        // first of month, ISO
  opening: boolean
  execValue: number    // pre-pct KD
  tadqiqCount: number
}

export async function monthlyExec(): Promise<MonthlyExec[]> {
  const { data, error } = await supabase
    .from("qm_monthly_exec").select("*")
    .eq("contract_id", await contractId()).order("month")
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    month: r.month, opening: !!r.opening,
    execValue: Number(r.exec_value), tadqiqCount: r.tadqiq_count,
  }))
}

export interface WoFlags {
  kashefId: number
  overAllocLines: number
  execOverAllocLines: number
  outOfWoLines: number
}

export async function woFlags(): Promise<WoFlags[]> {
  const { data, error } = await supabase
    .from("qm_wo_flags").select("*").eq("contract_id", await contractId())
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    kashefId: r.kashef_id, overAllocLines: r.over_alloc_lines,
    execOverAllocLines: r.exec_over_alloc_lines, outOfWoLines: r.out_of_wo_lines,
  }))
}

export async function lineStatus(kashefId: number): Promise<LineStatus[]> {
  const { data, error } = await supabase
    .from("qm_line_status").select("*").eq("kashef_id", kashefId)
    .order("bab").order("band").order("suffix", { nullsFirst: true })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    kashefLineId: r.kashef_line_id, bopItemId: r.bop_item_id, qty: Number(r.qty),
    bab: r.bab, band: r.band, suffix: r.suffix, description: r.description,
    unit: r.unit, rate: Number(r.rate), lineTotal: Number(r.line_total),
    allocatedTotal: Number(r.allocated_total), executedTotal: Number(r.executed_total),
  }))
}

export async function subLineStatus(kashefId: number): Promise<SubLineStatus[]> {
  const { data, error } = await supabase
    .from("qm_sub_line_status").select("*").eq("kashef_id", kashefId)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    kashefLineId: r.kashef_line_id, bopItemId: r.bop_item_id,
    vendorId: r.vendor_id, vendorName: r.vendor_name,
    bab: r.bab, band: r.band, suffix: r.suffix, description: r.description,
    unit: r.unit, rate: Number(r.rate), kashefQty: Number(r.kashef_qty),
    allocated: Number(r.allocated), executed: Number(r.executed),
  }))
}

export async function subcontractors(): Promise<Subcontractor[]> {
  const { data, error } = await supabase
    .from("vendors").select("id,name").eq("qm_subcontractor", true).order("name")
  if (error) throw error
  return data ?? []
}

export async function tadqiqList(kashefId: number): Promise<TadqiqRow[]> {
  const { data, error } = await supabase
    .from("qm_tadqiq")
    .select("id,kashef_id,vendor_id,tadqiq_date,serial_no,street_no,note,opening,vendors(name),qm_tadqiq_lines(bop_item_id,qty,out_of_kashef,over_allocation)")
    .eq("kashef_id", kashefId)
    .order("tadqiq_date", { ascending: false }).order("id", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, kashefId: r.kashef_id, vendorId: r.vendor_id,
    vendorName: r.vendors?.name ?? "", date: r.tadqiq_date,
    serialNo: r.serial_no ?? "", streetNo: r.street_no, note: r.note, opening: r.opening,
    lines: (r.qm_tadqiq_lines ?? []).map((l: any) => ({
      bopItemId: l.bop_item_id, qty: Number(l.qty),
      outOfKashef: l.out_of_kashef, overAllocation: l.over_allocation,
    })),
  }))
}

export async function changelog(kashefId: number): Promise<ChangelogRow[]> {
  const { data, error } = await supabase
    .from("qm_changelog")
    .select("id,entity,action,field,line_ref,old_value,new_value,actor_email,created_at")
    .eq("entity_id", kashefId)
    .in("entity", ["kashef", "kashef_line", "allocation", "tadqiq"])
    .order("id", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, entity: r.entity, action: r.action, field: r.field,
    lineRef: r.line_ref, oldValue: r.old_value, newValue: r.new_value,
    actorEmail: r.actor_email, createdAt: r.created_at,
  }))
}

// ── Payment certificates (0040) ──────────────────────────────────────

export interface PayCertOverview {
  id: number
  pct: number
  certNo: number
  periodEnd: string | null
  source: "mpw" | "site"
  status: "draft" | "submitted" | "certified"
  note: string
  createdAt: string
  lineCount: number
  woCount: number
  subtotal: number        // pre-pct
  totalAfterPct: number
}

function mapPayCert(r: any): PayCertOverview {
  return {
    id: r.id, pct: Number(r.pct), certNo: r.cert_no, periodEnd: r.period_end ?? null,
    source: r.source, status: r.status, note: r.note, createdAt: r.created_at,
    lineCount: r.line_count, woCount: r.wo_count,
    subtotal: Number(r.subtotal), totalAfterPct: Number(r.total_after_pct),
  }
}

export async function paycertList(): Promise<PayCertOverview[]> {
  const { data, error } = await supabase
    .from("qm_paycert_overview").select("*")
    .eq("contract_code", getContract()).order("cert_no", { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPayCert)
}

export async function paycertOne(id: number): Promise<PayCertOverview | null> {
  const { data, error } = await supabase
    .from("qm_paycert_overview").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data ? mapPayCert(data) : null
}

export interface PayCertLine {
  id: number
  certId: number
  kashefId: number | null
  kashefNo: number | null
  woNo: string
  area: string
  bopItemId: number
  bab: number
  band: number
  suffix: string | null
  description: string
  unit: string
  rate: number
  qty: number
  amount: number
}

export async function paycertLines(certId: number): Promise<PayCertLine[]> {
  const { data, error } = await supabase
    .from("qm_paycert_lines_v").select("*").eq("cert_id", certId)
    .order("kashef_no").order("bab").order("band")
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, certId: r.cert_id, kashefId: r.kashef_id ?? null,
    kashefNo: r.kashef_no ?? null, woNo: r.wo_no ?? "", area: r.area ?? "",
    bopItemId: r.bop_item_id, bab: r.bab, band: r.band, suffix: r.suffix,
    description: r.description, unit: r.unit, rate: Number(r.rate),
    qty: Number(r.qty), amount: Number(r.amount ?? 0),
  }))
}

// Per-line detail in the ministry's own كشف تنفيذي جزئي shape: this
// payment's qty, the previous cumulative, and اجمالي الكمية المتبقية.
export interface PayCertLineDetail extends PayCertLine {
  certNo: number
  qtyPrevious: number
  qtyCumulative: number
  qtyRemaining: number
  woQty: number | null
  woDate: string | null
  durationDays: number | null
  dailyPenalty: number | null
  locType: LocType | null
  blockNo: string
  streetName: string
  workType: string
}

export async function paycertLineDetail(certId: number): Promise<PayCertLineDetail[]> {
  const { data, error } = await supabase
    .from("qm_paycert_line_detail").select("*").eq("cert_id", certId)
    .order("kashef_no").order("bab").order("band")
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id, certId: r.cert_id, certNo: r.cert_no,
    kashefId: r.kashef_id ?? null, kashefNo: r.kashef_no ?? null,
    woNo: r.wo_no ?? "", area: r.area ?? "",
    bopItemId: r.bop_item_id, bab: r.bab, band: r.band, suffix: r.suffix,
    description: r.description, unit: r.unit, rate: Number(r.rate),
    qty: Number(r.qty_current), amount: Number(r.amount_current ?? 0),
    qtyPrevious: Number(r.qty_previous ?? 0),
    qtyCumulative: Number(r.qty_cumulative ?? 0),
    qtyRemaining: Number(r.qty_remaining ?? 0),
    woQty: r.wo_qty != null ? Number(r.wo_qty) : null,
    woDate: r.wo_date ?? null,
    durationDays: r.duration_days ?? null,
    dailyPenalty: r.daily_penalty != null ? Number(r.daily_penalty) : null,
    locType: r.loc_type ?? null, blockNo: r.block_no ?? "",
    streetName: r.street_name ?? "", workType: r.work_type ?? "",
  }))
}

export interface ContractProgress {
  contractValue: number
  changeOrdersValue: number
  totalValue: number
  startDate: string | null
  durationDays: number | null
  elapsedDays: number
  timePct: number | null
  executedAfterPct: number
  financialPct: number | null
  woCount: number
  woClosed: number
  woOpen: number
}

export async function contractProgress(): Promise<ContractProgress | null> {
  const { data, error } = await supabase
    .from("qm_contract_progress").select("*").eq("code", getContract()).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    contractValue: Number(data.contract_value ?? 0),
    changeOrdersValue: Number(data.change_orders_value ?? 0),
    totalValue: Number(data.total_value ?? 0),
    startDate: data.start_date ?? null,
    durationDays: data.duration_days ?? null,
    elapsedDays: Number(data.elapsed_days ?? 0),
    timePct: data.time_pct != null ? Number(data.time_pct) : null,
    executedAfterPct: Number(data.executed_after_pct ?? 0),
    financialPct: data.financial_pct != null ? Number(data.financial_pct) : null,
    woCount: data.wo_count ?? 0, woClosed: data.wo_closed ?? 0, woOpen: data.wo_open ?? 0,
  }
}

// Executed vs certified per work order (0044). A closed WO with a
// positive uncertified value is finished work still waiting to be billed.
export interface WoCertification {
  kashefId: number
  kashefNo: number
  closed: boolean
  executedValue: number      // pre-pct
  certifiedValue: number     // pre-pct
  uncertifiedValue: number   // pre-pct
  lastCertNo: number | null
  lastPeriodEnd: string | null
}

export async function woCertification(): Promise<WoCertification[]> {
  const { data, error } = await supabase
    .from("qm_wo_certification").select("*").eq("contract_id", await contractId())
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    kashefId: r.kashef_id, kashefNo: r.kashef_no, closed: !!r.closed,
    executedValue: Number(r.executed_value), certifiedValue: Number(r.certified_value),
    uncertifiedValue: Number(r.uncertified_value),
    lastCertNo: r.last_cert_no ?? null, lastPeriodEnd: r.last_period_end ?? null,
  }))
}

export interface QtyByWoItem {
  kashefId: number
  bopItemId: number
  qty: number
}

export async function certifiedTotals(): Promise<QtyByWoItem[]> {
  const { data, error } = await supabase
    .from("qm_certified_totals").select("*").eq("contract_id", await contractId())
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    kashefId: r.kashef_id, bopItemId: r.bop_item_id, qty: Number(r.qty_certified),
  }))
}

export async function execTotals(): Promise<QtyByWoItem[]> {
  const { data, error } = await supabase
    .from("qm_exec_totals").select("*").eq("contract_id", await contractId())
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    kashefId: r.kashef_id, bopItemId: r.bop_item_id, qty: Number(r.qty_executed),
  }))
}

// ── Writes (RPC envelope) ────────────────────────────────────────────

async function call(fn: string, args: Record<string, unknown>) {
  const r = await rpc<any>(fn, args)
  if (!r?.success) throw new Error(r?.error || "failed")
  return r
}

// Direct-WO model: the QA creates work orders only — status is always
// 'wo' and the WO number doubles as the record number.
export interface KashefCreateInput {
  woNo: number
  area: string
  locType: LocType
  blockNo: string
  streetName: string
  workType: string
  woDate: string | null
  durationDays: number | null
  locationText: string
  kmFrom: number | null
  kmTo: number | null
  direction: string
  lines: { bopItemId: number; qty: number }[]
}

export function kashefCreate(k: KashefCreateInput) {
  return call("qm_kashef_create", {
    p_contract_code: getContract(),
    p_kashef_no: k.woNo,
    p_area: k.area,
    p_loc_type: k.locType,
    p_block_no: k.blockNo,
    p_street_name: k.streetName,
    p_work_type: k.workType,
    p_lines: k.lines.map((l) => ({ bop_item_id: l.bopItemId, qty: l.qty })),
    p_kashef_date: k.woDate,
    p_status: "wo",
    p_wo_no: String(k.woNo),
    p_wo_date: k.woDate,
    p_duration_days: k.durationDays,
    p_location_text: k.locationText,
    p_km_from: k.kmFrom,
    p_km_to: k.kmTo,
    p_direction: k.direction,
  })
}

export function kashefUpdate(id: number, fields: Record<string, string>) {
  return call("qm_kashef_update", { p_kashef_id: id, p_fields: fields })
}

export function kashefSetClosed(id: number, closed: boolean) {
  return kashefUpdate(id, { closed: String(closed) })
}

export function kashefApprove(id: number, woNo: string, woDate: string | null) {
  return call("qm_kashef_approve", { p_kashef_id: id, p_wo_no: woNo, p_wo_date: woDate })
}

export function kashefLineSet(kashefId: number, bopItemId: number, qty: number | null) {
  return call("qm_kashef_line_set", { p_kashef_id: kashefId, p_bop_item_id: bopItemId, p_qty: qty })
}

export function allocSet(kashefLineId: number, vendorId: number, qty: number | null) {
  return call("qm_alloc_set", { p_kashef_line_id: kashefLineId, p_vendor_id: vendorId, p_qty: qty })
}

export interface TadqiqCreateInput {
  kashefId: number
  vendorId: number
  date: string
  serial: string
  streetNo: string
  note: string
  opening: boolean
  lines: { bopItemId: number; qty: number }[]
}

export function tadqiqCreate(t: TadqiqCreateInput) {
  return call("qm_tadqiq_create", {
    p_kashef_id: t.kashefId,
    p_vendor_id: t.vendorId,
    p_date: t.date,
    p_street_no: t.streetNo,
    p_note: t.note,
    p_lines: t.lines.map((l) => ({ bop_item_id: l.bopItemId, qty: l.qty })),
    p_opening: t.opening,
    p_serial: t.serial,
  })
}

export function tadqiqDelete(id: number) {
  return call("qm_tadqiq_delete", { p_tadqiq_id: id })
}

export function kashefDelete(id: number) {
  return call("qm_kashef_delete", { p_kashef_id: id })
}

export interface PayCertCreateInput {
  certNo: number
  periodEnd: string | null
  source: "mpw" | "site"
  note: string
  lines: { kashefId: number | null; bopItemId: number; qty: number }[]
}

export function paycertCreate(c: PayCertCreateInput) {
  return call("qm_paycert_create", {
    p_contract_code: getContract(),
    p_cert_no: c.certNo,
    p_period_end: c.periodEnd,
    p_source: c.source,
    p_note: c.note,
    p_lines: c.lines.map((l) => ({
      kashef_id: l.kashefId, bop_item_id: l.bopItemId, qty: l.qty,
    })),
  })
}

export function paycertUpdate(id: number, fields: Record<string, string>) {
  return call("qm_paycert_update", { p_cert_id: id, p_fields: fields })
}

export function paycertLineSet(certId: number, kashefId: number | null, bopItemId: number, qty: number | null) {
  return call("qm_paycert_line_set", {
    p_cert_id: certId, p_kashef_id: kashefId, p_bop_item_id: bopItemId, p_qty: qty,
  })
}

export function paycertDelete(id: number) {
  return call("qm_paycert_delete", { p_cert_id: id })
}
