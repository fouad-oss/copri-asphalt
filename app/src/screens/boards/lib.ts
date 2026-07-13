import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase, rpc } from "@/lib/supabase"

/* ── dash_payload shape (0001) — same slim rows the legacy boards consume.
   Days are already bucketed Asia/Kuwait server-side ("d"). ── */

export type DispatchRow = {
  d: string; c: string; p: string; s: string; w: string; m: string
  pl: string; n: string; t: number; st: 0 | 1 | 2; tr: number
  dw: number | null; dt: number | null
}
export type MaterialSlim = {
  d: string; p: string; s: string; rec: string; cat: string; item: string
  qty: number; unit: string; amt: number; sup: string; sub: string
}
export type DashPayload = {
  generatedAt: string; copri: string
  dispatch: DispatchRow[]; materials: MaterialSlim[]
}

/* Fetch once, filter locally — time-filter clicks never re-fetch (legacy behaviour). */
let dashCache: DashPayload | null = null
let dashInflight: Promise<DashPayload> | null = null

export async function fetchDash(): Promise<DashPayload> {
  if (dashCache) return dashCache
  if (!dashInflight) {
    dashInflight = rpc<DashPayload>("dash_payload", {}).then((d) => {
      if (!d || !d.dispatch) throw new Error("bad payload")
      dashCache = d
      return d
    }).finally(() => { dashInflight = null })
  }
  return dashInflight
}

export function useDash() {
  const [data, setData] = useState<DashPayload | null>(dashCache)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    fetchDash().then(setData).catch(() => setError(true))
  }, [])
  useEffect(() => { if (!data) load() }, [data, load])
  return { data, error, retry: load }
}

/* ── Reference data (ref_payload) — companies / projects / pick-lists /
   thresholds. Best-effort with baked fallbacks, like the legacy CONFIG. ── */

export type RefData = {
  settings: Record<string, string>
  clients: { company: string; isCopri: boolean }[]
  clientProjects: { company: string; project: string }[]
  projectInfo: { project: string; company: string }[]
  mixTypes: string[]
  plants: string[]
}

let refCache: RefData | null = null
let refInflight: Promise<RefData> | null = null

export async function fetchRef(): Promise<RefData> {
  if (refCache) return refCache
  if (!refInflight) {
    refInflight = rpc<any>("ref_payload", {}).then((r) => {
      const ref: RefData = {
        settings: r?.settings || {},
        clients: r?.clients || [],
        clientProjects: r?.clientProjects || [],
        projectInfo: r?.projectInfo || [],
        mixTypes: r?.mixTypes || [],
        plants: r?.plants || [],
      }
      refCache = ref
      return ref
    }).finally(() => { refInflight = null })
  }
  return refInflight
}

export function useRef_() {
  const [data, setData] = useState<RefData | null>(refCache)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setError(false)
    fetchRef().then(setData).catch(() => setError(true))
  }, [])
  useEffect(() => { if (!data) load() }, [data, load])
  return { data, error, retry: load }
}

export function copriProjectNames(ref: RefData | null): string[] {
  return (ref?.projectInfo || []).map((p) => p.project)
}

/* Quality-flag thresholds (exec board) — settings override baked defaults. */
export function thresholds(ref: RefData | null) {
  const s = ref?.settings || {}
  const num = (v: unknown, dflt: number) => {
    const n = Number(v)
    return v !== undefined && v !== "" && !Number.isNaN(n) ? n : dflt
  }
  return { weightShortage: num(s.weightShortage, 0.5), tempDropWarning: num(s.tempDropWarning, 30) }
}

/* ── Range state (today | day | range | all) — URL-backed so it survives
   navigation between boards, mirroring the legacy module-global. ── */

export type RangeMode = "today" | "day" | "range" | "all"
export type DashRange = { mode: RangeMode; day: string; from: string; to: string }

export function dayStr(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}
export function todayStr(): string { return dayStr(new Date()) }

/** Kuwait wall-clock calendar day, offset in days (fixed +03, no DST). */
export function kwISO(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" })
    .format(new Date(Date.now() + offsetDays * 864e5))
}

export function useDashRange(): [DashRange, (p: Partial<DashRange>) => void] {
  const [sp, setSp] = useSearchParams()
  const mode = (["today", "day", "range", "all"].includes(sp.get("r") || "") ? sp.get("r") : "today") as RangeMode
  const range: DashRange = {
    mode,
    day: sp.get("d") || todayStr(),
    from: sp.get("f") || dayStr(new Date(Date.now() - 6 * 864e5)),
    to: sp.get("t") || todayStr(),
  }
  const set = (p: Partial<DashRange>) => {
    const next = { ...range, ...p }
    setSp({ r: next.mode, d: next.day, f: next.from, t: next.to }, { replace: true })
  }
  return [range, set]
}

export function isSingleDay(r: DashRange): boolean { return r.mode === "today" || r.mode === "day" }
export function currentDay(r: DashRange): string { return r.mode === "day" ? r.day : todayStr() }

export function rangeBounds(r: DashRange): [string, string] {
  return r.from <= r.to ? [r.from, r.to] : [r.to, r.from]
}

/** Filter slim rows (anything carrying a Kuwait-day `d`) to the window. */
export function windowRows<T extends { d: string }>(rows: T[] | null | undefined, r: DashRange): T[] {
  const all = rows || []
  if (isSingleDay(r)) { const d = currentDay(r); return all.filter((x) => x.d === d) }
  if (r.mode === "range") { const [f, t] = rangeBounds(r); return all.filter((x) => x.d >= f && x.d <= t) }
  return all
}

/* ── Aggregation (ports of _aggBy / _aggDays / _sum) ── */

export type AggItem = { name: string; value: number }

export function aggBy<T>(rows: T[], keyFn: (r: T) => string | null | undefined, valFn?: (r: T) => number): AggItem[] {
  const map: Record<string, number> = {}
  rows.forEach((r) => {
    const k = keyFn(r)
    if (!k || k === "—") return
    map[k] = (map[k] || 0) + (valFn ? valFn(r) || 0 : 1)
  })
  return Object.keys(map)
    .map((k) => ({ name: k, value: Math.round(map[k] * 10) / 10 }))
    .sort((a, b) => b.value - a.value)
}

export function aggDays<T extends { d: string }>(rows: T[], valFn?: (r: T) => number): { date: string; tons: number }[] {
  const map: Record<string, number> = {}
  rows.forEach((r) => { map[r.d] = (map[r.d] || 0) + (valFn ? valFn(r) || 0 : 1) })
  return Object.keys(map).sort().map((d) => ({ date: d, tons: Math.round(map[d] * 10) / 10 }))
}

export function sum<T>(rows: T[], f: (r: T) => number | null | undefined): number {
  return rows.reduce((a, r) => a + (f(r) || 0), 0)
}

export const numFmt = (n: number) => new Intl.NumberFormat("en").format(n)

/** Kuwait wall-clock time-of-day (HH:mm) — the localized fmtKW string has
    no stable slice offsets, so format the time part directly. */
export function fmtKWTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit",
  })
}

/* ── Direct reads (drill-downs and the accountant board) ── */

export type DayLoad = {
  note: string; ts: string; status: string | null; weight: number | null
  company: string; project: string; site: string; block: string | null
  street: string | null; mix: string; plant: string | null
}

/** Every dispatch of one Kuwait calendar day (trip drill-down + day reports). */
export async function fetchDayLoads(dayISO: string): Promise<DayLoad[]> {
  const start = new Date(dayISO + "T00:00:00+03:00")
  const end = new Date(start.getTime() + 864e5)
  const { data, error } = await supabase
    .from("dispatch_loads")
    .select("note,ts,status,weight,company,project,site,block,street,mix,plant")
    .gte("ts", start.toISOString()).lt("ts", end.toISOString())
    .order("ts", { ascending: true }).limit(1000)
  if (error) throw error
  return (data || []) as DayLoad[]
}

export type MaterialReceipt = {
  id: number; ts: string; receipt_id: string | null; project: string
  site: string; block: string | null; street: string | null
  category: string | null; material: string | null; quantity: number | null
  unit: string | null; supplier: string | null; subcontractor: string | null
  receiver: string | null; photo_url: string | null; remarks: string | null
  d: string
}

const matCache: Record<string, MaterialReceipt[]> = {}

/** Itemized material receipts for one project — the slim payload drops
    rate / receipt id / photo / remarks, which the accountant needs. */
export async function fetchProjectMaterials(proj: string, force = false): Promise<MaterialReceipt[]> {
  if (!force && matCache[proj]) return matCache[proj]
  const { data, error } = await supabase
    .from("material_receipts").select("*")
    .eq("project", proj).order("ts", { ascending: false }).limit(2000)
  if (error) throw error
  const kwDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" })
  const rows = (data || []).map((r: any) => ({ ...r, d: kwDay.format(new Date(r.ts)) })) as MaterialReceipt[]
  matCache[proj] = rows
  return rows
}

/* ── Desks: managers, programs, recipient requests ── */

export type Manager = { id: number; name: string; pin: string; phone?: string; active: boolean }

export async function fetchManagers(kind: "plant" | "finance"): Promise<Manager[]> {
  const { data, error } = await supabase
    .from(kind === "plant" ? "plant_managers" : "finance_managers")
    .select("*").eq("active", true).order("id")
  if (error) throw error
  return (data || []) as Manager[]
}

export type Program = {
  id: number; created_at: string; work_date: string; company: string; project: string
  site: string; block: string; street: string; mix: string; loads: number | null
  mixes: { mix: string; loads: number }[]; plant: string; load_time: string
  pave_time: string; notes: string; status: string; created_by: string
}

/** Upcoming plus the last week — the plant plans forward, glances back. */
export async function fetchPrograms(): Promise<Program[]> {
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("asphalt_programs").select("*")
    .gte("work_date", from).order("work_date", { ascending: true }).limit(300)
  if (error) throw error
  return (data || []) as Program[]
}

export type RecipientRequest = {
  id: number; created_at: string; company: string; client: string; contract: string
  payment: string; details: string; requested_by: string; status: string
  decided_by: string; decided_at: string | null; office_note: string
  items?: { mix: string; qty: number; rate: number }[] | null
}

export async function fetchRequests(): Promise<RecipientRequest[]> {
  const { data, error } = await supabase
    .from("recipient_requests").select("*")
    .order("created_at", { ascending: false }).limit(100)
  if (error) throw error
  return (data || []) as RecipientRequest[]
}

/* Writes — SECURITY DEFINER RPCs (0006/0007). Program ENTRY here is for
   NON-Copri clients only (user decision 2026-07-11). */
export async function programSubmit(p: {
  p_work_date: string; p_company: string; p_project: string; p_site: string
  p_block: string; p_street: string; p_mixes: { mix: string; loads: number }[]
  p_plant: string; p_load_time: string; p_pave_time: string; p_notes: string; p_by: string
}) {
  return rpc("asphalt_program_submit", { ...p, p_mix: "", p_loads: null })
}
export async function programSetStatus(id: number, status: string, by: string) {
  return rpc("asphalt_program_set_status", { p_id: id, p_status: status, p_by: by })
}
export async function requestSubmit(p: {
  p_company: string; p_client: string; p_contract: string; p_payment: string
  p_details: string; p_by: string; p_items: { mix: string; qty: number; rate: number }[]
}) {
  return rpc("recipient_request_submit", p)
}
export async function requestDecide(id: number, decision: string, by: string, note: string) {
  return rpc("recipient_request_decide", { p_id: id, p_decision: decision, p_by: by, p_note: note })
}

/* ── Interim desk sessions (same sessionStorage keys as legacy, so a
   signed-in manager survives the app switch on the same origin) ── */

export function getDeskSession(kind: "plant" | "finance"): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(kind + "_session") || "null")
    return s && s.name ? String(s.name) : null
  } catch { return null }
}
export function setDeskSession(kind: "plant" | "finance", name: string | null) {
  if (name) sessionStorage.setItem(kind + "_session", JSON.stringify({ name, ts: Date.now() }))
  else sessionStorage.removeItem(kind + "_session")
}
