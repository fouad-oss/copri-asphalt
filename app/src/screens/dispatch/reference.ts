/* Reference data for the dispatch module — a faithful port of the legacy
   CONFIG + applyReferenceData() overlay (index.html), restricted to the
   datasets dispatch consumes. The client fetches rpc/ref_payload (same
   shape the legacy app reads), overlays the baked defaults, caches in
   localStorage under the SAME key the legacy app uses, and re-syncs on
   focus / 60s visible poll by diffing the payload JSON. Any failure →
   cache → baked defaults, so the portal never blocks. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

export type Engineer = { name: string; pin: string; phone: string }
export type Project = {
  contract: string
  sites: string[]
  locationType: string            // "block_street" | "km_range"
  allowNamedStreet: boolean
  namedStreets: Record<string, string[]>
  engineers: Engineer[]
}
export type Company = { isCopri: boolean; projects: Record<string, Project> }
export type Driver = { name: string; phone: string; truck: string }
export type Clerk = { name: string; pin: string }
export type WorkOrderRule = {
  wo: string; project: string; site: string
  block?: string; street?: string; discipline?: string; label: string
}
export type DispatchConfig = {
  footerText: string
  tempDropWarning: number
  maxWeight: number
  companies: Record<string, Company>
  copriDrivers: Driver[]
  naqelOptions: string[]
  mixTypes: string[]
  plants: string[]
  rejectionReasons: string[]
  clerks: Clerk[]
  contractWorkOrders: WorkOrderRule[]
}

/* ── Baked defaults — the dispatch slice of the legacy CONFIG. Used only
   when both the fetch and the cache fail; ref_payload overlays them. ── */
const BAKED: DispatchConfig = {
  footerText: "شركة كوبري للمشاريع الإنشائية",
  tempDropWarning: 30,
  maxWeight: 50,
  companies: {
    "كوبري": {
      isCopri: true,
      projects: {
        "كوبري — صيانة حولي": {
          contract: "ق ص / ط ش / 9",
          sites: ["بيان", "مشرف", "سلوى", "أخرى"],
          locationType: "block_street",
          allowNamedStreet: true,
          namedStreets: { "بيان": ["خالد بن عبد العزيز"], "مشرف": ["59"] },
          engineers: [
            { name: "أحمد عبد العزيز", pin: "8798", phone: "96551334626" },
            { name: "أحمد بدوي", pin: "8255", phone: "96566911641" },
            { name: "إيهاب حسن", pin: "5686", phone: "96550571838" },
            { name: "فؤاد الزغبي", pin: "7764", phone: "96566767764" },
            { name: "توفيق", pin: "4193", phone: "96594779974" },
          ],
        },
        "كوبري — الطرق السريعة": {
          contract: "هـ ص / ط / 9",
          sites: ["طريق الملك فهد", "طريق الفحيحيل", "أخرى"],
          locationType: "km_range",
          allowNamedStreet: false,
          namedStreets: {},
          engineers: [
            { name: "أحمد عبد الرحمن", pin: "7058", phone: "96550385607" },
          ],
        },
      },
    },
    "المدى الأخضر — Green Line": {
      isCopri: false,
      projects: {
        "صيانة جذرية — العاصمة (النطاق الأول)": {
          contract: "ق ص / ط ش / 7", locationType: "block_street",
          allowNamedStreet: true, sites: [], namedStreets: {}, engineers: [],
        },
        "صيانة جذرية — حولي (النطاق الثاني)": {
          contract: "ق ص / ط ش / 10", locationType: "block_street",
          allowNamedStreet: true, sites: [], namedStreets: {}, engineers: [],
        },
        "تحسين البنية التحتية — اليرموك": {
          contract: "هـ ص / 193", locationType: "block_street",
          allowNamedStreet: true, sites: [], namedStreets: {}, engineers: [],
        },
      },
    },
  },
  copriDrivers: [
    { name: "أيمن", phone: "96560326834", truck: "90126" },
    { name: "هلال", phone: "96560307865", truck: "5875" },
    { name: "محمود عامر", phone: "96596788086", truck: "64802" },
    { name: "راكيش", phone: "96565611467", truck: "70927" },
    { name: "هاربرت", phone: "96597752364", truck: "22640" },
    { name: "حازم خالد", phone: "96599605083", truck: "5689" },
    { name: "أحمد محمود", phone: "96599020469", truck: "12165" },
    { name: "سامح", phone: "96541030405", truck: "12063" },
    { name: "محمد حسين", phone: "96599418262", truck: "12136" },
    { name: "محمد منصور", phone: "96566014047", truck: "48892" },
    { name: "مسعود", phone: "96555274966", truck: "" },
    { name: "أناندا", phone: "96551327138", truck: "30464" },
  ],
  naqelOptions: ["كوبري", "مقاول خارجي"],
  mixTypes: [
    "Type I (60/70)", "Type II (60/70)", "Type III (60/70)",
    "Type I AS", "Type II AS", "Type III AS",
    "Type I PMB", "Type II PMB", "Type III PMB",
    "Tack Coat", "Prime Coat", "Cold Mix",
  ],
  plants: ["AP01", "AP02"],
  rejectionReasons: ["درجة حرارة منخفضة جداً", "وزن ناقص عند الاستلام", "نوع خلطة خاطئ", "تأخر وصول الشاحنة", "أخرى"],
  clerks: [
    { name: "خالد", pin: "1098" },
    { name: "سيد زكي", pin: "1098" },
    { name: "طاهر", pin: "1098" },
  ],
  contractWorkOrders: [
    { wo: "41", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 9 أعمال مدنية" },
    { wo: "42", project: "كوبري — صيانة حولي", site: "مشرف", label: "مشرف قطعة 4 أعمال الاسفلت" },
    { wo: "43", project: "كوبري — صيانة حولي", site: "بيان", label: "صيانة بيان قطعة 15 (أعمال مدنية + أسفلت)" },
    { wo: "45", project: "كوبري — صيانة حولي", site: "مشرف", label: "صيانة مشرف قطعة 2 أعمال مدنية + خطوط الامطار" },
    { wo: "46", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 12 اعمال مدنية" },
    { wo: "48", project: "كوبري — صيانة حولي", site: "مشرف", label: "مشرف قطعة 1 (أعمال مدنية + خطوط الامطار)" },
    { wo: "49", project: "كوبري — صيانة حولي", site: "مشرف", label: "مشرف شارع 52 (أعمال اسفلت)" },
    { wo: "50", project: "كوبري — صيانة حولي", site: "مشرف", label: "مشرف قطعة 6 (أعمال مدنية + خطوط الامطار)" },
    { wo: "52", project: "كوبري — صيانة حولي", site: "", label: "متفرقات وطوارئ" },
    { wo: "53", project: "كوبري — صيانة حولي", site: "بيان", label: "شارع خالد بن عبدالعزيز - أعمال أسفلت" },
    { wo: "54", project: "كوبري — صيانة حولي", site: "سلوى", label: "سلوى قطعة 5 - أعمال مدنية" },
    { wo: "55", project: "كوبري — صيانة حولي", site: "سلوى", label: "سلوى قطعة 6 - أعمال مدنية" },
    { wo: "58", project: "كوبري — صيانة حولي", site: "بيان", label: "شارع خالد بن عبدالعزيز - أعمال مدنية" },
    { wo: "59", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 2 تنظيف وتصوير شبكة المجاري الصحية" },
    { wo: "60", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 1 تنظيف وتصوير شبكة المجاري الصحية" },
    { wo: "61", project: "كوبري — صيانة حولي", site: "سلوى", label: "سلوى شارع 104+105 اعمال مدنية" },
    { wo: "62", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 1 - اعمال مدنية" },
    { wo: "63", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 2 - اعمال مدنية" },
    { wo: "64", project: "كوبري — صيانة حولي", site: "سلوى", label: "سلوى قطعة 9 - اعمال اسفلت" },
    { wo: "65", project: "كوبري — صيانة حولي", site: "سلوى", label: "سلوى شارع المتنبي - اعمال مدنية" },
    { wo: "66", project: "كوبري — صيانة حولي", site: "مشرف", label: "متفرقات وطوارئ - محطة مضخات مشرف" },
    { wo: "67", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 11 - أعمال اسفلت" },
    { wo: "68", project: "كوبري — صيانة حولي", site: "بيان", label: "بيان قطعة 10 - اعمال اسفلت" },
  ],
}

/* ── Legacy applyReferenceData() port (dispatch datasets only) ── */
function refBool(v: unknown) { return /^(1|true|نعم|yes|y)$/i.test(String(v ?? "").trim()) }
function cleanPhoneRef(p: unknown) { return String(p ?? "").replace(/[^\d]/g, "") }

function projectCtx(companies: Record<string, Company>, projectName: string) {
  for (const cn of Object.keys(companies)) {
    const c = companies[cn]
    if (c.projects && c.projects[projectName]) return { companyName: cn, company: c, project: c.projects[projectName] }
  }
  return null
}

export function buildConfig(ref: any): DispatchConfig {
  const cfg: DispatchConfig = JSON.parse(JSON.stringify(BAKED))
  if (!ref) return cfg

  // Settings / thresholds / branding.
  const s = ref.settings || {}
  if (s.tempDropWarning !== undefined && s.tempDropWarning !== "") cfg.tempDropWarning = Number(s.tempDropWarning)
  if (s.maxWeight !== undefined && s.maxWeight !== "") cfg.maxWeight = Number(s.maxWeight)
  if (s.footerText) cfg.footerText = s.footerText

  // Companies/projects — rebuilt from Clients + Client Projects + Project Info.
  if ((ref.clients || []).length) {
    const companies: Record<string, Company> = {}
    ;(ref.clients || []).forEach((c: any) => {
      if (c.company) companies[c.company] = { isCopri: refBool(c.isCopri), projects: {} }
    })
    ;(ref.clientProjects || []).forEach((r: any) => {
      if (!r.company || !r.project) return
      companies[r.company] = companies[r.company] || { isCopri: false, projects: {} }
      companies[r.company].projects[r.project] = {
        contract: r.contract || "", locationType: r.locationType || "block_street",
        allowNamedStreet: refBool(r.allowNamedStreet), sites: [], namedStreets: {}, engineers: [],
      }
    })
    ;(ref.projectInfo || []).forEach((pi: any) => {
      if (!pi.company || !pi.project) return
      companies[pi.company] = companies[pi.company] || { isCopri: true, projects: {} }
      const p = companies[pi.company].projects[pi.project] =
        companies[pi.company].projects[pi.project] ||
        { contract: "", locationType: "block_street", allowNamedStreet: false, sites: [], namedStreets: {}, engineers: [] }
      if (pi.contract) p.contract = pi.contract
      p.locationType = pi.locationType || p.locationType || "block_street"
      p.allowNamedStreet = refBool(pi.allowNamedStreet)
    })
    cfg.companies = companies
  }
  // Sites & named streets into their projects.
  ;(ref.sites || []).forEach((r: any) => {
    const ctx = projectCtx(cfg.companies, r.project)
    if (ctx && r.site) {
      ctx.project.sites = ctx.project.sites || []
      if (!ctx.project.sites.includes(r.site)) ctx.project.sites.push(r.site)
    }
  })
  ;(ref.streets || []).forEach((r: any) => {
    const ctx = projectCtx(cfg.companies, r.project)
    if (!ctx || !r.site || !r.street) return
    const p = ctx.project
    p.namedStreets = p.namedStreets || {}
    p.namedStreets[r.site] = p.namedStreets[r.site] || []
    if (!p.namedStreets[r.site].includes(r.street)) p.namedStreets[r.site].push(r.street)
    p.allowNamedStreet = true
  })

  // Staff → asphalt engineers per project (civil/milling roles belong to
  // the materials/milling modules, not dispatch).
  ;(ref.staff || []).forEach((r: any) => {
    if (!r.name) return
    const fn = String(r.function || "").toLowerCase()
    const pin = String(r.pin || "")
    const asph = /asphalt|أسفلت/.test(fn) || /both|كلا/.test(fn)
    if (!asph) return
    const ctx = projectCtx(cfg.companies, r.project)
    if (!ctx) return
    const e = ctx.project.engineers = ctx.project.engineers || []
    const f = e.find((x) => x.name === r.name)
    if (f) { f.pin = pin; if (r.phone) f.phone = cleanPhoneRef(r.phone) }
    else e.push({ name: r.name, pin, phone: cleanPhoneRef(r.phone) })
  })

  // Clerks (Plant file).
  if ((ref.clerks || []).length) {
    cfg.clerks = ref.clerks.filter((r: any) => r.name).map((r: any) => ({ name: r.name, pin: String(r.pin || "") }))
  }

  // Work orders (active only) → contractWorkOrders (drives autoWorkOrder).
  const wos = (ref.workOrders || []).filter((r: any) => r.wo && (!r.status || /جاري|active/i.test(r.status)))
  if (wos.length) {
    cfg.contractWorkOrders = wos.map((r: any) => ({
      wo: String(r.wo), project: r.project || "", site: r.site || "", block: r.block || "", street: r.street || "",
      discipline: r.discipline || "",
      label: r.description || [r.site, r.block ? `قطعة ${r.block}` : "", r.discipline].filter(Boolean).join(" "),
    }))
  }

  // Drivers (Copri + contractor; still editable at dispatch).
  const drv = (ref.drivers || []).filter((r: any) => r.name)
  if (drv.length) cfg.copriDrivers = drv.map((r: any) => ({ name: r.name, phone: cleanPhoneRef(r.phone), truck: r.plate || "" }))

  // Simple pick-lists.
  if ((ref.mixTypes || []).length) cfg.mixTypes = ref.mixTypes
  if ((ref.plants || []).length) cfg.plants = ref.plants
  if ((ref.transporters || []).length) cfg.naqelOptions = ref.transporters
  if ((ref.rejectionReasons || []).length) cfg.rejectionReasons = ref.rejectionReasons

  return cfg
}

/* Flattened, de-duplicated engineer list across all projects — engineer
   login where the project isn't known yet (receipt confirmation). */
export function allEngineers(cfg: DispatchConfig): Engineer[] {
  const seen: Record<string, 1> = {}
  const out: Engineer[] = []
  Object.values(cfg.companies).forEach((c) =>
    Object.values(c.projects).forEach((p) =>
      (p.engineers || []).forEach((e) => { if (!seen[e.name]) { seen[e.name] = 1; out.push(e) } })
    )
  )
  return out
}
export function findEngineer(cfg: DispatchConfig, name: string): Engineer | null {
  return allEngineers(cfg).find((e) => e.name === name) || null
}

/* ── Fetch + cache + sync (same key + cadence as legacy) ── */
const REF_CACHE_KEY = "copri_ref_cache_v1"

function readCache(): any {
  try { return JSON.parse(localStorage.getItem(REF_CACHE_KEY) || "null") } catch { return null }
}

async function fetchReference(): Promise<any> {
  const { data, error } = await supabase.rpc("ref_payload")
  if (error) throw error
  if (data && (data.streets || data.workOrders || data.settings)) {
    try { localStorage.setItem(REF_CACHE_KEY, JSON.stringify(data)) } catch { /* quota — keep going */ }
  }
  return data
}

type RefCtxValue = { cfg: DispatchConfig; refresh: () => Promise<void>; refreshing: boolean }

const RefContext = createContext<RefCtxValue>({
  cfg: BAKED, refresh: async () => {}, refreshing: false,
})

export function useDispatchRef() { return useContext(RefContext) }

export function useDispatchRefProvider(): RefCtxValue {
  const [cfg, setCfg] = useState<DispatchConfig>(() => buildConfig(readCache()))
  const [refreshing, setRefreshing] = useState(false)
  const lastJson = useRef<string>(JSON.stringify(readCache() ?? null))

  const sync = useCallback(async () => {
    let fresh: any
    try { fresh = await fetchReference() } catch { return }   // silent no-op — cache/baked stay
    if (!fresh) return
    const json = JSON.stringify(fresh)
    if (json === lastJson.current) return
    lastJson.current = json
    setCfg(buildConfig(fresh))
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await sync()
    setRefreshing(false)
  }, [sync])

  useEffect(() => {
    void sync()
    const onVis = () => { if (document.visibilityState === "visible") void sync() }
    document.addEventListener("visibilitychange", onVis)
    const timer = setInterval(() => { if (document.visibilityState === "visible") void sync() }, 60000)
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(timer) }
  }, [sync])

  return { cfg, refresh, refreshing }
}

export { RefContext }
