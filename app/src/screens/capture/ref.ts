import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/* Reference data for the capture module, built from the same ref_payload()
   RPC the legacy app consumes (CLAUDE.md gotcha 2: consume the stable
   payload shape, don't fork a new one). Offline-first: the raw payload is
   cached in localStorage and applied instantly; a background fetch
   refreshes it. Any failure falls back to the cache. */

export type Receiver = { name: string; pin: string }
export type CatalogCategory = { category: string; unit: string; items: string[] }
export type CaptureProject = {
  name: string
  locationType: string // "block_street" | "km_range" | …
  sites: string[]
  namedStreets: Record<string, string[]>
}
type WoRef = { wo: string; project: string; site: string; block: string; street: string; discipline: string }

export type CaptureRef = {
  receivers: Receiver[]
  projects: CaptureProject[]
  suppliers: string[]
  subcontractors: string[]
  catalog: CatalogCategory[]
  workOrders: WoRef[]
}

const CACHE_KEY = "copri_capture_ref_v1"

const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ")

/** Build the capture-scoped shapes from the raw ref_payload JSON.
 *  Receivers = staff rows whose function is civil/both (legacy
 *  applyReferenceData). Projects = Copri projects (projectInfo) with their
 *  sites + named streets. Work orders = active only. */
function build(raw: any): CaptureRef {
  const receivers: Receiver[] = []
  for (const s of raw?.staff || []) {
    if (!s?.name) continue
    const fn = String(s.function || "").toLowerCase()
    if (/civil|مدني/.test(fn) || /both|كلا/.test(fn)) {
      const f = receivers.find((r) => r.name === s.name)
      if (f) f.pin = String(s.pin || "")
      else receivers.push({ name: s.name, pin: String(s.pin || "") })
    }
  }

  const byName: Record<string, CaptureProject> = {}
  const projects: CaptureProject[] = []
  for (const pi of raw?.projectInfo || []) {
    if (!pi?.project || byName[pi.project]) continue
    const p: CaptureProject = {
      name: pi.project,
      locationType: pi.locationType || "block_street",
      sites: [], namedStreets: {},
    }
    byName[pi.project] = p
    projects.push(p)
  }
  for (const s of raw?.sites || []) {
    const p = byName[s?.project]
    if (p && s.site && !p.sites.includes(s.site)) p.sites.push(s.site)
  }
  for (const st of raw?.streets || []) {
    const p = byName[st?.project]
    if (!p || !st.site || !st.street) continue
    const list = (p.namedStreets[st.site] = p.namedStreets[st.site] || [])
    if (!list.includes(st.street)) list.push(st.street)
  }

  const catalog: CatalogCategory[] = []
  for (const r of raw?.catalog || []) {
    if (!r?.category || !r?.item) continue
    let c = catalog.find((x) => x.category === r.category)
    if (!c) { c = { category: r.category, unit: r.unit || "", items: [] }; catalog.push(c) }
    c.items.push(r.item)
    if (r.unit && !c.unit) c.unit = r.unit
  }

  const workOrders: WoRef[] = (raw?.workOrders || [])
    .filter((w: any) => w?.wo && (!w.status || /جاري|active/i.test(String(w.status))))
    .map((w: any) => ({
      wo: String(w.wo), project: w.project || "", site: w.site || "",
      block: w.block || "", street: w.street || "", discipline: w.discipline || "",
    }))

  return {
    receivers, projects, catalog, workOrders,
    suppliers: (raw?.suppliers || []).filter(Boolean),
    subcontractors: (raw?.subcontractors || []).filter(Boolean),
  }
}

export function cachedRef(): CaptureRef | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
    return raw ? build(raw) : null
  } catch { return null }
}

export async function fetchRef(): Promise<CaptureRef> {
  const { data, error } = await supabase.rpc("ref_payload")
  if (error || !data) throw error || new Error("empty ref payload")
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* quota — keep going */ }
  return build(data)
}

/** Cached copy instantly, fresh copy in the background; error only when
 *  there is nothing at all to show. */
export function useCaptureRef() {
  const [ref, setRef] = useState<CaptureRef | null>(() => cachedRef())
  const [error, setError] = useState(false)
  const reload = useCallback(() => {
    setError(false)
    fetchRef()
      .then((r) => { setRef(r); setError(false) })
      .catch(() => { if (!cachedRef()) setError(true) })
  }, [])
  useEffect(() => { reload() }, [reload])
  return { ref, error, reload }
}

/** Locked auto-fill: the single active work order covering the location for
 *  the CIVIL discipline (materials is civil; a WO tagged both/كلا matches).
 *  Port of the legacy autoWorkOrder(). Returns the WO string, "*" when a
 *  location is set but no order covers it, "" when nothing to match yet. */
export function autoWorkOrder(ref: CaptureRef, project: string, site: string, block: string, street: string): string {
  const b = norm(block), st = norm(street)
  if (!b && !st) return ""
  const siteKey = norm(site)
  const discOK = (d: string) => {
    d = d.toLowerCase()
    if (!d || /both|كلا/.test(d)) return true
    return /civil|مدني/.test(d)
  }
  const hit = ref.workOrders.find((w) => {
    if (w.project && w.project !== project) return false
    if (w.site && norm(w.site) !== siteKey) return false
    if (!discOK(String(w.discipline || ""))) return false
    const wb = norm(w.block), ws = norm(w.street)
    if (b && wb) return wb === b && (!st || !ws || ws === st)
    if (st && ws) return ws === st
    return false
  })
  return hit ? String(hit.wo) : "*"
}
