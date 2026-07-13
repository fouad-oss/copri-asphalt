/* Clerk dispatch form — faithful port of legacy renderDispatch().
   CAPTURE pattern: one column, pre-scoped pickers, three-tap goal via the
   planned-program quick-pick chips. The work order is a LOCKED auto-fill
   (autoWorkOrder over contractWorkOrders, discipline "asphalt") — never
   user-editable. The delivery-note number is DB-allocated at submit;
   submitRef is fixed per form mount so retries are idempotent. */

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useDispatchRef } from "./reference"
import type { Company, Project } from "./reference"
import {
  autoWorkOrder, cleanPhone, dbSubmitDispatch, fetchNextLoad, fetchPlannedPrograms,
  kwDayISO, localFromFull, normSp, phoneToFull, receiptLinkFor,
} from "./helpers"
import type { DispatchData } from "./helpers"
import { ErrorMsg, FieldGroup, InfoBox, PickSelect, SectionTitle } from "./components"

export type DispatchCtx = {
  companyName: string
  company: Company
  projectName: string
  project: Project
}

export default function DispatchForm({ ctx, clerkName, onChangeProject, onSuccess }: {
  ctx: DispatchCtx
  clerkName: string
  onChangeProject: () => void
  onSuccess: (data: DispatchData, receiptLink: string | null) => void
}) {
  const { t } = useTranslation("dispatch")
  const { cfg } = useDispatchRef()
  const { companyName, company, projectName, project } = ctx
  const isCopri = !!company.isCopri

  // Shipment data
  const [plant, setPlant] = useState("")
  const [naqel, setNaqel] = useState("")
  const [driverPick, setDriverPick] = useState("")
  const [driverName, setDriverName] = useState("")
  const [phoneLocal, setPhoneLocal] = useState("")
  const [truck, setTruck] = useState("")
  const [mix, setMix] = useState("")
  const [weight, setWeight] = useState("")
  const [temp, setTemp] = useState("")

  // Site + location
  const [site, setSite] = useState("")
  const [extraSites, setExtraSites] = useState<string[]>([])   // program sites missing from the reference list
  const [locMode, setLocMode] = useState<"blocks" | "named">("blocks")
  const [block, setBlock] = useState("")
  const [street, setStreet] = useState("")
  const [namedName, setNamedName] = useState("")
  const [extraNamed, setExtraNamed] = useState<Record<string, string[]>>({})
  const [kmFrom, setKmFrom] = useState("")
  const [kmTo, setKmTo] = useState("")

  const [notifyEngineer, setNotifyEngineer] = useState("")
  const [remarks, setRemarks] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState("")   // "" | checking | sending
  const [programs, setPrograms] = useState<any[]>([])
  const [liveLoad, setLiveLoad] = useState<number | null>(null)
  const [loadPending, setLoadPending] = useState(false)

  // submitRef is fixed per form render: if the response is lost mid-air the
  // retry sends the same ref and gets back the note that already landed.
  const [submitRef] = useState(() =>
    (window.crypto && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

  const kmRange = project.locationType === "km_range"
  const engineers = project.engineers || []

  const loc = useMemo(() => {
    if (kmRange) return { block: kmFrom.trim(), street: kmTo.trim(), locationType: "km_range" }
    if (locMode === "named" && project.allowNamedStreet)
      return { block: namedName.trim(), street: "", locationType: "named" }
    return { block: block.trim(), street: street.trim(), locationType: "block_street" }
  }, [kmRange, locMode, project.allowNamedStreet, kmFrom, kmTo, namedName, block, street])

  // Locked auto-fill work order — derived read-only for the asphalt discipline.
  const liveWO = useMemo(() => {
    if (!isCopri || loc.locationType === "km_range") return ""
    const woStreet = loc.locationType === "named" ? loc.block : loc.street   // named name lives in block
    const woBlock = loc.locationType === "named" ? "" : loc.block
    if (!woBlock && !woStreet) return ""
    return autoWorkOrder(cfg, projectName, site, woBlock, woStreet, "asphalt")
  }, [cfg, isCopri, loc, projectName, site])

  // Sites list: project reference sites + any planned-program sites.
  const siteOptions = useMemo(() => {
    const base = project.sites || []
    return [...base, ...extraSites.filter((s) => !base.includes(s))]
  }, [project.sites, extraSites])

  // Named-street options depend on the chosen site.
  const namedOptions = useMemo(() => {
    const base = (project.namedStreets && project.namedStreets[site]) || []
    const extra = (extraNamed[site] || []).filter((s) => !base.includes(s))
    return [...base, ...extra]
  }, [project.namedStreets, site, extraNamed])

  // ── Planned-program quick-pick (best-effort — the form works without it) ──
  useEffect(() => {
    let alive = true
    fetchPlannedPrograms(projectName)
      .then((p) => {
        if (!alive) return
        setPrograms(p)
        // A program site missing from the reference list still becomes pickable.
        const missing = [...new Set(p.map((x: any) => x.site).filter(Boolean))] as string[]
        if (missing.length) setExtraSites((xs) => [...xs, ...missing.filter((s) => !xs.includes(s))])
      })
      .catch(() => { /* quick-pick is a convenience */ })
    return () => { alive = false }
  }, [projectName])

  // ── Auto load number for this exact location (live preview, debounced).
  // Count by site only when block/street can't be relied on as a key:
  // non-Copri projects, or named-street entries (free-typed spelling varies).
  const loadSeq = useRef(0)
  useEffect(() => {
    const siteOnly = !isCopri || loc.locationType === "named"
    const ready = siteOnly ? !!site : (!!site && !!loc.block)
    if (!ready) { setLiveLoad(null); setLoadPending(false); return }
    const seq = ++loadSeq.current
    setLoadPending(true)
    const timer = setTimeout(async () => {
      const n = await fetchNextLoad(projectName, site, loc.block, loc.street, siteOnly)
      if (seq !== loadSeq.current) return   // a newer request superseded this one
      setLiveLoad(n)
      setLoadPending(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [isCopri, projectName, site, loc])

  function pickDriver(name: string) {
    setDriverPick(name)
    const d = cfg.copriDrivers.find((x) => x.name === name)
    if (d) { setDriverName(d.name); setPhoneLocal(localFromFull(d.phone)); setTruck(d.truck || "") }
  }

  function changeNaqel(v: string) {
    setNaqel(v)
    // Legacy rebuilds the driver section on الناقل change — fields reset.
    setDriverPick(""); setDriverName(""); setPhoneLocal(""); setTruck("")
  }

  function changeSite(v: string) {
    setSite(v)
    // Named-street options depend on the chosen site — legacy rebuilds (clears).
    if (locMode === "named") setNamedName("")
  }

  // One-tap chip fills site + location (+ mix). A street with no block is a
  // NAMED-street location — flip the address-type toggle so the mandatory
  // قطعة doesn't dead-end the clerk at validation.
  function applyProgram(p: any) {
    if (p.site) {
      if (!siteOptions.includes(p.site)) setExtraSites((xs) => [...xs, p.site])
      setSite(p.site)
    }
    if (!p.block && p.street && project.allowNamedStreet) {
      setLocMode("named")
      setExtraNamed((m) => {
        const list = m[p.site] || []
        return list.includes(p.street) ? m : { ...m, [p.site]: [...list, p.street] }
      })
      setNamedName(p.street)
    } else {
      setLocMode("blocks")
      if (p.block) setBlock(p.block)
      if (p.street) setStreet(p.street)
    }
    if (p.mix && cfg.mixTypes.includes(p.mix)) setMix(p.mix)
  }

  async function submit() {
    const data: DispatchData = {
      company: companyName,
      project: projectName,
      contract: project.contract || "",
      workOrder: liveWO,
      plant,
      truckNumber: truck.trim(),
      naqel,
      driverName: driverName.trim(),
      driverPhone: cleanPhone(phoneToFull(phoneLocal)),
      mixType: mix,
      weight,
      tempDispatch: temp,
      site: normSp(site),
      block: normSp(loc.block),
      street: normSp(loc.street),
      locationType: loc.locationType,
      clerkName,
      notifyEngineer: isCopri ? notifyEngineer : "",
      remarks: remarks.trim(),
    }
    const required: (keyof DispatchData)[] =
      ["plant", "truckNumber", "naqel", "driverName", "mixType", "weight", "tempDispatch", "block", "clerkName"]
    if (data.locationType !== "named") required.push("street")
    if (isCopri) required.push("site", "notifyEngineer")
    if (required.some((k) => !data[k])) { setErr(t("form.errRequired")); return }

    // Weight sanity — a real asphalt load is a few tens of tons. Reject an
    // out-of-range value so a typo can't be recorded; store the parsed number.
    const wNum = parseFloat(String(data.weight).replace(",", "."))
    if (!isFinite(wNum) || wNum <= 0 || wNum > cfg.maxWeight) {
      setErr(t("form.errWeight", { max: cfg.maxWeight })); return
    }
    data.weight = String(wNum)
    setErr("")
    setBusy("checking")

    // Authoritative load number, fetched right before writing so it reflects
    // the latest count (resets at noon Kuwait).
    const siteOnly = !isCopri || data.locationType === "named"
    const authLoad = await fetchNextLoad(data.project, data.site, data.block, data.street, siteOnly)
    data.loadNumber = authLoad != null ? authLoad : (liveLoad != null ? liveLoad : "")

    setBusy("sending")
    try {
      // The RPC allocates the serial note number and inserts atomically.
      const w = await dbSubmitDispatch(data, submitRef)
      if (!w.success || !w.note) throw new Error(w.error || "dispatch_submit failed")
      data.noteNumber = String(w.note)
      onSuccess(data, isCopri ? receiptLinkFor(data.noteNumber) : null)
    } catch {
      setBusy("")
      setErr(t("form.errSubmit"))
    }
  }

  const copriDriverPick = naqel === "كوبري" && cfg.copriDrivers.length > 0
  const woText =
    loc.locationType === "km_range" ? t("form.woNA")
    : !loc.block && !loc.street ? "—"
    : liveWO && liveWO !== "*" ? liveWO
    : t("form.woNone")

  return (
    <div className="flex flex-col gap-4">
      {/* Company + project banner */}
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
        <div>
          <div className="font-semibold">{projectName}</div>
          <div className="text-sm text-muted-foreground">
            {companyName}{project.contract ? <> · <bdi dir="rtl">{project.contract}</bdi></> : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onChangeProject}>{t("project.change")}</Button>
      </div>

      <Card><CardContent className="flex flex-col gap-4 px-4 py-4">
        <SectionTitle>{t("form.section")}</SectionTitle>

        {/* Note number is DB-allocated at submit — the clerk no longer types it. */}
        <InfoBox>{t("form.noteInfo")}</InfoBox>

        <FieldGroup label={t("form.plant")} required>
          <PickSelect value={plant} onChange={setPlant} options={cfg.plants} placeholder={t("form.pickPlant")} ltr />
        </FieldGroup>

        <FieldGroup label={t("form.naqel")} required>
          <PickSelect value={naqel} onChange={changeNaqel} options={cfg.naqelOptions} placeholder={t("form.pickNaqel")} />
        </FieldGroup>

        {/* Driver — quick-pick for Copri hauling auto-fills name/phone/plate; all stay editable */}
        {copriDriverPick && (
          <FieldGroup label={t("form.driverPick")} hint={t("form.driverPickHint")}>
            <PickSelect value={driverPick} onChange={pickDriver}
              options={cfg.copriDrivers.map((d) => d.name)} placeholder={t("form.pickFromList")} />
          </FieldGroup>
        )}
        <FieldGroup label={t("form.driverName")} required>
          <Input className="h-12" placeholder={t("form.fullName")} value={driverName}
            onChange={(e) => setDriverName(e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("form.phone")} hint={t("form.phoneHint")}>
          <div className="flex items-stretch gap-1.5" dir="ltr">
            <div className="flex items-center rounded-md border bg-secondary px-3 font-semibold text-muted-foreground">+965</div>
            <Input className="h-12 text-start" type="tel" inputMode="tel" maxLength={8} placeholder="XXXXXXXX"
              dir="ltr" value={phoneLocal} onChange={(e) => setPhoneLocal(e.target.value)} />
          </div>
        </FieldGroup>
        <FieldGroup label={t("form.truck")} required>
          <Input className="h-12" dir="ltr" placeholder={t("form.plate")} value={truck}
            onChange={(e) => setTruck(e.target.value)} />
        </FieldGroup>

        <FieldGroup label={t("form.mix")} required>
          <PickSelect value={mix} onChange={setMix} options={cfg.mixTypes} placeholder={t("form.pickMix")} ltr />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-2">
          <FieldGroup label={t("form.weight")} required>
            <Input className="h-12" dir="ltr" type="number" inputMode="decimal" step="0.01"
              min="0.01" max={String(cfg.maxWeight)} placeholder="33.00"
              value={weight} onChange={(e) => setWeight(e.target.value)} />
          </FieldGroup>
          <FieldGroup label={t("form.temp")} required>
            <Input className="h-12" dir="ltr" type="number" inputMode="numeric" placeholder="150"
              value={temp} onChange={(e) => setTemp(e.target.value)} />
          </FieldGroup>
        </div>

        {/* Planned-program quick-pick chips (hidden when none) */}
        {programs.length > 0 && (
          <InfoBox>
            <div className="mb-2 font-semibold">{t("form.programs")}</div>
            <div className="flex flex-wrap gap-1.5">
              {programs.map((p: any) => (
                <button key={p.id ?? `${p.work_date}-${p.site}-${p.block}-${p.street}-${p.mix}`}
                  type="button" onClick={() => applyProgram(p)}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary">
                  {p.work_date === kwDayISO(0) ? t("form.today") : p.work_date === kwDayISO(1) ? t("form.tomorrow") : p.work_date}
                  {` · ${p.site}${p.block ? " ق" + p.block : ""}${p.street ? " ش" + p.street : ""}${p.mix ? " · " + p.mix : ""}`}
                </button>
              ))}
            </div>
          </InfoBox>
        )}

        {/* Site: required pick for Copri; optional free text for plant-only companies */}
        {isCopri ? (
          <FieldGroup label={t("form.site")} required>
            <PickSelect value={site} onChange={changeSite} options={siteOptions} placeholder={t("form.pickSite")} />
          </FieldGroup>
        ) : (
          <FieldGroup label={t("form.site")}>
            <Input className="h-12" placeholder={t("form.optional")} value={site}
              onChange={(e) => setSite(e.target.value)} />
          </FieldGroup>
        )}

        {/* Location — km range | block+street with optional named-street toggle */}
        {kmRange ? (
          <div className="grid grid-cols-2 gap-2">
            <FieldGroup label={t("form.kmFrom")} required>
              <Input className="h-12" dir="ltr" inputMode="decimal" placeholder={t("form.kmFromPh")}
                value={kmFrom} onChange={(e) => setKmFrom(e.target.value)} />
            </FieldGroup>
            <FieldGroup label={t("form.kmTo")} required>
              <Input className="h-12" dir="ltr" inputMode="decimal" placeholder={t("form.kmToPh")}
                value={kmTo} onChange={(e) => setKmTo(e.target.value)} />
            </FieldGroup>
          </div>
        ) : (
          <>
            {project.allowNamedStreet && (
              <FieldGroup label={t("form.locType")}>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
                  {(["blocks", "named"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setLocMode(m)}
                      className={cn(
                        "rounded px-3 py-2 text-sm font-semibold",
                        locMode === m ? "bg-card shadow-sm" : "text-muted-foreground",
                      )}>
                      {m === "blocks" ? t("form.blocksMode") : t("form.namedMode")}
                    </button>
                  ))}
                </div>
              </FieldGroup>
            )}
            {locMode === "named" && project.allowNamedStreet ? (
              <FieldGroup label={t("form.namedName")} required>
                {namedOptions.length ? (
                  <PickSelect value={namedName} onChange={setNamedName} options={namedOptions} placeholder={t("form.pickStreet")} />
                ) : (
                  <Input className="h-12" placeholder={t("form.namedPh")} value={namedName}
                    onChange={(e) => setNamedName(e.target.value)} />
                )}
              </FieldGroup>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <FieldGroup label={t("form.block")} required>
                  <Input className="h-12" dir="ltr" inputMode="numeric" placeholder={t("form.blockPh")}
                    value={block} onChange={(e) => setBlock(e.target.value)} />
                </FieldGroup>
                <FieldGroup label={t("form.street")} required>
                  <Input className="h-12" dir="ltr" inputMode="numeric" placeholder={t("form.streetPh")}
                    value={street} onChange={(e) => setStreet(e.target.value)} />
                </FieldGroup>
              </div>
            )}
          </>
        )}

        {/* Live per-location load counter (resets at noon Kuwait) */}
        <InfoBox className="font-semibold">
          {t("form.loadNo")}: {loadPending ? t("form.loadCalc") : liveLoad != null
            ? <>{liveLoad} <span className="font-normal text-muted-foreground">· {t("form.loadSince")}</span></>
            : "—"}
        </InfoBox>

        {/* LOCKED auto work-order info box — derived, never editable */}
        {isCopri && (
          <InfoBox className="font-semibold">{t("form.wo")}: {woText}</InfoBox>
        )}

        {/* Engineer to notify — Copri only (other companies end at the plant) */}
        {isCopri && (
          <>
            <FieldGroup label={t("form.notify")} required hint={t("form.notifyHint")}>
              <PickSelect value={notifyEngineer} onChange={setNotifyEngineer}
                options={engineers.map((e) => e.name)} placeholder={t("form.pickEngineer")} />
            </FieldGroup>
            {!engineers.length && <InfoBox>{t("form.noEngineers")}</InfoBox>}
          </>
        )}

        <SectionTitle>{t("form.clerkSection")}</SectionTitle>
        <FieldGroup label={t("form.clerkName")} required>
          <Input className="h-12" value={clerkName} disabled />
        </FieldGroup>
        <FieldGroup label={t("form.remarks")}>
          <Textarea rows={2} placeholder={t("form.remarksPh")} value={remarks}
            onChange={(e) => setRemarks(e.target.value)} />
        </FieldGroup>

        {err && <ErrorMsg>{err}</ErrorMsg>}

        <Button size="lg" className="h-12 text-base" disabled={!!busy} onClick={() => void submit()}>
          {busy === "checking" ? t("form.checking")
            : busy === "sending" ? t("form.sending")
            : isCopri ? t("form.submitCopri") : t("form.submitPlant")}
        </Button>
      </CardContent></Card>
    </div>
  )
}
