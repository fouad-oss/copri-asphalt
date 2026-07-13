import { rpc, supabase } from "@/lib/supabase"

/* ── Milling module data layer.
   Reads mirror the legacy `millingGet` translated queries (same filters,
   same UI row shape); writes go through the milling_* SECURITY DEFINER
   RPCs with EXACTLY the legacy payload shapes (0002). The server owns the
   state machine and the append-only jsonb audit trail. ── */

/* Status literals are stored in the DB in Arabic (constraint 0002) —
   these are DATA values, never translated on the wire. */
export const MILL_STATUS = {
  pending: "بانتظار الموافقة",
  rejected: "مرفوض",
  review: "مراجعة",
  approved: "معتمد",
  scheduled: "مجدول",
  progress: "قيد التنفيذ",
  complete: "مكتمل",
} as const
export type MillStatus = (typeof MILL_STATUS)[keyof typeof MILL_STATUS]

/** DB literal → i18n status code (milling namespace `status.*`). */
export const STATUS_CODE: Record<string, string> = {
  [MILL_STATUS.pending]: "pending",
  [MILL_STATUS.rejected]: "rejected",
  [MILL_STATUS.review]: "review",
  [MILL_STATUS.approved]: "approved",
  [MILL_STATUS.scheduled]: "scheduled",
  [MILL_STATUS.progress]: "progress",
  [MILL_STATUS.complete]: "complete",
}

/* Milling-depth BOQ items (Hawalli contract, Section 004 / باب ٤) — baked
   constants like the legacy CONFIG.millingDepths (not in ref_payload). */
export const MILLING_DEPTHS = [
  { code: "1/4", label: "قشط بسماكة 2 سم", depth: 2, unit: "م²", rate: 0.2 },
  { code: "2/4", label: "قشط بسماكة 3 سم", depth: 3, unit: "م²", rate: 0.22 },
  { code: "3/4", label: "قشط بسماكة 4 سم", depth: 4, unit: "م²", rate: 0.27 },
  { code: "4/4", label: "قشط بسماكة 5 سم", depth: 5, unit: "م²", rate: 0.29 },
  { code: "5/4", label: "قشط بسماكة 6 سم", depth: 6, unit: "م²", rate: 0.32 },
  { code: "6/4", label: "قشط بسماكة 7 سم", depth: 7, unit: "م²", rate: 0.37 },
  { code: "7/4", label: "قشط بسماكة 8 سم", depth: 8, unit: "م²", rate: 0.43 },
  { code: "8/4", label: "قشط بسماكة 9 سم", depth: 9, unit: "م²", rate: 0.49 },
  { code: "9/4", label: "قشط بسماكة 10 سم", depth: 10, unit: "م²", rate: 0.56 },
] as const

export const DEFAULT_PRIORITIES = ["عادي", "عاجل", "حرج"]

export type AuditEvent = {
  action: string
  by?: string
  role?: string
  ts?: string
  note?: string
}

export type Program = {
  programId: string
  project: string
  workOrder: string
  site: string
  block: string
  street: string
  depth: string
  itemCode: string
  area: number | ""
  machines: number | ""
  requestedDate: string
  priority: string
  engineer: string
  submittedAt: string
  status: string
  pmName: string
  pmDecision: string
  pmNote: string
  pmDecidedAt: string
  audit: AuditEvent[]
  marcoScheduledAt: string
  marcoNote: string
  engNotes: string
}

/** snake_case row → UI shape (same mapping as legacy millingRowToUI). */
export function rowToProgram(r: any): Program {
  return {
    programId: r.program_id,
    project: r.project || "",
    workOrder: r.work_order || "",
    site: r.site || "",
    block: r.block || "",
    street: r.street || "",
    depth: r.depth || "",
    itemCode: r.item_code || "",
    area: r.area == null ? "" : r.area,
    machines: r.machines == null ? "" : r.machines,
    requestedDate: r.requested_date || "",
    priority: r.priority || "",
    engineer: r.engineer || "",
    submittedAt: r.submitted_at || "",
    status: r.status || "",
    pmName: r.pm_name || "",
    pmDecision: r.pm_decision || "",
    pmNote: r.pm_note || "",
    pmDecidedAt: r.pm_decided_at || "",
    audit: Array.isArray(r.audit) ? r.audit : [],
    marcoScheduledAt: r.marco_scheduled_at || "",
    marcoNote: r.marco_note || "",
    engNotes: r.eng_notes || "",
  }
}

/* ── Reads (anon-readable milling_programs, like the legacy sbGet) ── */

async function list(build: (q: any) => any): Promise<Program[]> {
  const q = build(supabase.from("milling_programs").select("*"))
    .order("submitted_at", { ascending: false })
    .limit(500)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(rowToProgram)
}

export async function fetchProgram(programId: string): Promise<Program | null> {
  const { data, error } = await supabase
    .from("milling_programs").select("*").eq("program_id", programId).limit(1)
  if (error) throw error
  return data && data.length ? rowToProgram(data[0]) : null
}

export function fetchByEngineer(name: string) {
  return list((q) => q.eq("engineer", name))
}
/** PM queue: pending + revised programs (legacy millingPMQueue). */
export function fetchPMQueue() {
  return list((q) => q.in("status", [MILL_STATUS.pending, MILL_STATUS.review]))
}
/** Decided log: everything NOT pending/review (legacy millingDecided). */
export function fetchDecided() {
  return list((q) => q.not("status", "in", `("${MILL_STATUS.pending}","${MILL_STATUS.review}")`))
}
/** Marco queue: approved + scheduled + in-progress (legacy millingMarcoQueue). */
export function fetchMarcoQueue() {
  return list((q) => q.in("status", [MILL_STATUS.approved, MILL_STATUS.scheduled, MILL_STATUS.progress]))
}

/* ── Writes — atomic milling_* RPCs, legacy payload shapes exactly ── */

export type ProgramDraft = {
  programId: string
  project: string
  workOrder: string
  site: string
  block: string
  street: string
  depth: string
  itemCode: string
  area: string
  machines: string
  requestedDate: string
  priority: string
  engineerName: string
  notes: string
}

function submitArgs(p: ProgramDraft) {
  return {
    p_program_id: p.programId,
    p_project: p.project || "",
    p_work_order: p.workOrder || "",
    p_site: p.site || "",
    p_block: p.block || "",
    p_street: p.street || "",
    p_depth: p.depth || "",
    p_item_code: p.itemCode || "",
    p_area: parseFloat(p.area) || null,
    p_machines: parseInt(p.machines, 10) || null,
    p_requested_date: p.requestedDate || null,
    p_priority: p.priority || "",
    p_engineer: p.engineerName || "",
    p_notes: p.notes || "",
  }
}

export async function millingSubmit(p: ProgramDraft) {
  const r = await rpc<any>("milling_submit", submitArgs(p))
  if (!r?.success) throw new Error(r?.duplicate ? "duplicate" : r?.error || "milling submit failed")
  return r
}

export async function millingRevise(p: ProgramDraft) {
  const r = await rpc<any>("milling_revise", submitArgs(p))
  if (!r?.success) throw new Error(r?.error || "milling revise failed")
  return r
}

export type MillDecision = "approve" | "reject" | "schedule" | "start" | "complete"

export async function millingDecide(p: {
  programId: string
  decision: MillDecision
  by?: string
  note?: string
  role?: string
}) {
  const r = await rpc<any>("milling_decide", {
    p_program_id: p.programId,
    p_decision: p.decision,
    p_by: p.by || "",
    p_note: p.note || "",
    p_role: p.role || "",
  })
  if (!r?.success) throw new Error(r?.error || "milling update failed")
  return r
}

/** Client-side unique id, same scheme the legacy app allocated. */
export function newProgramId() {
  return `MILL-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`
}

/* ── Reference data (ref_payload RPC — same source as the legacy CONFIG
   overlay): Copri projects w/ sites + named streets + location type,
   milling-flagged staff as engineers, milling_managers as PM/Marco. ── */

export type MillingProject = {
  name: string
  locationType: string // "block_street" | "km_range"
  sites: string[]
  namedStreets: Record<string, string[]>
}
export type NamePin = { name: string; pin: string }
export type PMUser = NamePin & { projects: string[] }
export type MillingRef = {
  projects: MillingProject[]
  engineers: NamePin[]
  pms: PMUser[]
  marco: NamePin | null
  priorities: string[]
}

function refBool(v: unknown): boolean {
  return v === true || /^(1|true|نعم|yes|y)$/i.test(String(v ?? "").trim())
}

function shapeRef(ref: any): MillingRef {
  const byName = new Map<string, MillingProject>()
  ;(ref?.projectInfo || []).forEach((pi: any) => {
    if (!pi?.project) return
    if (!byName.has(pi.project)) {
      byName.set(pi.project, {
        name: pi.project,
        locationType: pi.locationType || "block_street",
        sites: [],
        namedStreets: {},
      })
    }
  })
  ;(ref?.sites || []).forEach((r: any) => {
    const p = byName.get(r?.project)
    if (p && r.site && !p.sites.includes(r.site)) p.sites.push(r.site)
  })
  ;(ref?.streets || []).forEach((r: any) => {
    const p = byName.get(r?.project)
    if (!p || !r.site || !r.street) return
    const arr = (p.namedStreets[r.site] = p.namedStreets[r.site] || [])
    if (!arr.includes(r.street)) arr.push(r.street)
  })

  // Engineers = staff flagged for milling; fall back to asphalt-function
  // staff (the legacy PIN screen's list) if no rows carry the flag yet.
  const milling: NamePin[] = []
  const asphalt: NamePin[] = []
  const upsert = (l: NamePin[], name: string, pin: string) => {
    const f = l.find((x) => x.name === name)
    if (f) f.pin = pin
    else l.push({ name, pin })
  }
  ;(ref?.staff || []).forEach((r: any) => {
    if (!r?.name) return
    const pin = String(r.pin || "")
    if (refBool(r.milling)) upsert(milling, r.name, pin)
    const fn = String(r.function || "").toLowerCase()
    if (/asphalt|أسفلت|both|كلا/.test(fn)) upsert(asphalt, r.name, pin)
  })

  // milling_managers rows: role marco → the scheduler, everything else PM.
  const pms: PMUser[] = []
  let marco: NamePin | null = null
  ;(ref?.managers || []).forEach((r: any) => {
    if (!r?.name || !r?.pin) return
    const role = String(r.role || "").toLowerCase()
    const pin = String(r.pin)
    const projects = Array.isArray(r.projects)
      ? r.projects.map((x: unknown) => String(x).trim()).filter(Boolean)
      : String(r.projects || "").split(",").map((x) => x.trim()).filter(Boolean)
    if (/marco|ماركو/.test(role)) marco = { name: r.name, pin }
    else pms.push({ name: r.name, pin, projects })
  })

  return {
    projects: [...byName.values()],
    engineers: milling.length ? milling : asphalt,
    pms,
    marco,
    priorities: (ref?.priorities || []).length ? ref.priorities : DEFAULT_PRIORITIES,
  }
}

const REF_CACHE_KEY = "copri_milling_ref"
let refPromise: Promise<MillingRef> | null = null

export function loadMillingRef(force = false): Promise<MillingRef> {
  if (!refPromise || force) {
    refPromise = (async () => {
      try {
        const data = await rpc<any>("ref_payload", {})
        try { localStorage.setItem(REF_CACHE_KEY, JSON.stringify(data)) } catch { /* quota */ }
        return shapeRef(data)
      } catch (e) {
        const cached = localStorage.getItem(REF_CACHE_KEY)
        if (cached) return shapeRef(JSON.parse(cached))
        refPromise = null
        throw e
      }
    })()
  }
  return refPromise
}

export function projectByName(ref: MillingRef | null, name: string): MillingProject | null {
  return ref?.projects.find((p) => p.name === name) || null
}
export function isKmRange(ref: MillingRef | null, projectName: string): boolean {
  return projectByName(ref, projectName)?.locationType === "km_range"
}

/* ── Per-role sessions (sessionStorage, like the legacy portals) ── */

export type MillRole = "engineer" | "pm" | "marco"
const sessionKey = (role: MillRole) => `milling_${role}_session`

export function getMillSession(role: MillRole): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(sessionKey(role)) || "null")
    return s?.name || null
  } catch { return null }
}
export function setMillSession(role: MillRole, name: string) {
  sessionStorage.setItem(sessionKey(role), JSON.stringify({ name, ts: Date.now() }))
}
export function clearMillSession(role: MillRole) {
  sessionStorage.removeItem(sessionKey(role))
}
