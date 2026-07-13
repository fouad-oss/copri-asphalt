import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ErrorBox, LoadingList, RefCode } from "@/components/patterns"
import { cn } from "@/lib/utils"
import { autoWorkOrder, useCaptureRef } from "./ref"
import { getCaptureSession } from "./session"
import { compressImage } from "./photo"
import { enqueueReceipt, useQueue, type MaterialReceiptRow } from "./queue"

/* New receipt — the CAPTURE pattern reference: field density, one column,
   raw data only (no PO/commitment questions — that is the accountant's
   daily batch), locked WO auto-fill, required paper-receipt photo,
   offline-first submit (enqueue, never wait on the network).
   The "can't find X" paths never block and never free-pass: they submit
   raw free text with a flag remark that lands in the daily batch. */

const FIELD = "flex flex-col gap-1.5"
const CONTROL = "h-12 w-full text-base"

function PickField({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  options: string[]; placeholder: string
}) {
  return (
    <div className={FIELD}>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={CONTROL}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="py-2.5 text-base">{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function NewReceipt() {
  const { t } = useTranslation("capture")
  const nav = useNavigate()
  const session = getCaptureSession()
  const { ref, error, reload } = useCaptureRef()
  const queue = useQueue()

  const [project, setProject] = useState("")
  const [site, setSite] = useState("")
  const [locMode, setLocMode] = useState<"blocks" | "named">("blocks")
  const [block, setBlock] = useState("")
  const [street, setStreet] = useState("")
  const [namedStreet, setNamedStreet] = useState("")
  const [kmFrom, setKmFrom] = useState("")
  const [kmTo, setKmTo] = useState("")
  const [category, setCategory] = useState("")
  const [material, setMaterial] = useState("")
  const [freeMat, setFreeMat] = useState(false)
  const [freeMatText, setFreeMatText] = useState("")
  const [freeUnit, setFreeUnit] = useState("")
  const [q, setQ] = useState("")
  const [supplier, setSupplier] = useState("")
  const [freeSup, setFreeSup] = useState(false)
  const [freeSupText, setFreeSupText] = useState("")
  const [sub, setSub] = useState("")
  const [photoData, setPhotoData] = useState("")
  const [photoErr, setPhotoErr] = useState(false)
  const [remarks, setRemarks] = useState("")
  const [err, setErr] = useState("")
  const [doneId, setDoneId] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const name = session?.name || ""

  const proj = useMemo(() => ref?.projects.find((p) => p.name === project) || null, [ref, project])
  const isKm = proj?.locationType === "km_range"
  const named = (proj && site && proj.namedStreets[site]) || []
  const mode = named.length && locMode === "named" ? "named" : "blocks"
  const cat = useMemo(() => ref?.catalog.find((c) => c.category === category) || null, [ref, category])
  const unit = freeMat ? freeUnit : cat?.unit || ""

  const loc = isKm
    ? { block: kmFrom.trim(), street: kmTo.trim() }
    : mode === "named"
      ? { block: "", street: namedStreet.trim() }
      : { block: block.trim(), street: street.trim() }

  // Locked auto-fill (civil discipline) — displayed, never editable.
  const wo = !ref || !proj || isKm || (!loc.block && !loc.street)
    ? ""
    : autoWorkOrder(ref, project, site, loc.block, loc.street)
  const woText = isKm ? t("form.woNA") : wo === "" ? "—" : wo === "*" ? t("form.woNone") : wo

  function pickProject(v: string) {
    setProject(v); setSite(""); setNamedStreet(""); setBlock(""); setStreet("")
    setKmFrom(""); setKmTo(""); setLocMode("blocks")
  }
  function pickSite(v: string) { setSite(v); setNamedStreet("") }
  function pickCategory(v: string) { setCategory(v); setMaterial("") }

  async function onPhoto(f: File | undefined) {
    setPhotoErr(false)
    if (!f) return
    try { setPhotoData(await compressImage(f)) }
    catch { setPhotoData(""); setPhotoErr(true) }
  }

  function submit() {
    const matValue = freeMat ? freeMatText.trim() : material
    const supValue = freeSup ? freeSupText.trim() : supplier
    const catValue = freeMat && !category ? "أخرى" : category
    const need = [project, site, catValue, matValue, supValue, sub]
    if (need.some((v) => !v) || !(parseFloat(q) > 0)) return setErr(t("form.required"))
    if (!photoData) return setErr(t("form.needPhoto"))
    setErr("")

    // Escape-hatch flags ride in remarks so the accountant sees WHY in the
    // daily batch — an exception path, never a free pass, never a blocker.
    const notes: string[] = []
    if (freeMat) notes.push("⚠ مادة غير مدرجة في القائمة")
    if (freeSup) notes.push("⚠ مورد غير مدرج في القائمة")
    const row: MaterialReceiptRow = {
      receipt_id: `MAT-${crypto.randomUUID()}`, // client UUID = idempotency key
      receiver: name, project, site,
      work_order: isKm ? "" : wo,
      block: loc.block, street: loc.street,
      category: catValue, material: matValue,
      quantity: parseFloat(q) || null, unit,
      supplier: supValue, subcontractor: sub,
      remarks: [remarks.trim(), ...notes].filter(Boolean).join(" — "),
    }
    enqueueReceipt(row, photoData) // returns instantly; the sync loop delivers
    setDoneId(row.receipt_id)
  }

  if (!ref && error) return <div className="p-4"><ErrorBox message={t("login.noReceivers")} onRetry={reload} /></div>
  if (!ref) return <div className="p-4"><LoadingList rows={4} /></div>

  /* ── Success screen: id + live sync state of the queued item ── */
  if (doneId) {
    const item = queue.find((x) => x.receiptId === doneId)
    const state = item?.state || "queued"
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">✓</div>
        <h2 className="text-lg font-semibold">{t("done.title")}</h2>
        <div className="text-sm text-muted-foreground">{t("done.receiptNo")}</div>
        <RefCode className="break-all text-sm">{doneId}</RefCode>
        <div className={cn(
          "rounded-md p-2 text-sm",
          state === "synced" ? "bg-success/10 text-success" : "bg-warning-surface text-warning",
        )}>
          {state === "synced" ? t("sync.synced") : state === "failed" ? t("sync.failed") : navigator.onLine ? t(`sync.${state}`) : t("sync.offlineQueued")}
        </div>
        <Button className="h-12 w-full text-base" onClick={() => nav("/capture")}>{t("done.back")}</Button>
        <Button variant="secondary" className="h-12 w-full text-base" onClick={() => {
          // keep project/site/supplier/sub — the next delivery is usually the same context
          setDoneId(""); setCategory(""); setMaterial(""); setFreeMat(false); setFreeMatText("")
          setFreeUnit(""); setQ(""); setPhotoData(""); setRemarks("")
        }}>
          {t("done.another")}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 p-4">
      <h2 className="text-base font-semibold">{t("form.title")}</h2>
      <Card><CardContent className="flex flex-col gap-4 px-4 py-4">

        <PickField label={t("form.project")} value={project} onChange={pickProject}
          options={ref.projects.map((p) => p.name)} placeholder={t("form.projectPick")} />

        {proj && (
          <PickField label={t("form.site")} value={site} onChange={pickSite}
            options={proj.sites} placeholder={t("form.sitePick")} />
        )}

        {/* Location: km range (highways) / block+street / named street */}
        {proj && isKm && (
          <div className="grid grid-cols-2 gap-2">
            <div className={FIELD}>
              <Label>{t("form.kmFrom")}</Label>
              <Input dir="ltr" inputMode="decimal" className={CONTROL} value={kmFrom} onChange={(e) => setKmFrom(e.target.value)} />
            </div>
            <div className={FIELD}>
              <Label>{t("form.kmTo")}</Label>
              <Input dir="ltr" inputMode="decimal" className={CONTROL} value={kmTo} onChange={(e) => setKmTo(e.target.value)} />
            </div>
          </div>
        )}
        {proj && !isKm && (
          <>
            {named.length > 0 && (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
                {(["blocks", "named"] as const).map((m) => (
                  <button key={m} type="button"
                    className={cn("h-10 rounded-md text-sm", mode === m ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}
                    onClick={() => setLocMode(m)}>
                    {t(m === "blocks" ? "form.blocksTab" : "form.namedTab")}
                  </button>
                ))}
              </div>
            )}
            {mode === "named" ? (
              <PickField label={t("form.namedStreet")} value={namedStreet} onChange={setNamedStreet}
                options={named} placeholder={t("form.namedPick")} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className={FIELD}>
                  <Label>{t("form.block")}</Label>
                  <Input inputMode="numeric" className={CONTROL} placeholder={t("form.blockPh")}
                    value={block} onChange={(e) => setBlock(e.target.value)} />
                </div>
                <div className={FIELD}>
                  <Label>{t("form.street")}</Label>
                  <Input className={CONTROL} placeholder={t("form.streetPh")}
                    value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Locked WO info box — derived, read-only, submitted as derived */}
        <div className="rounded-lg border bg-secondary/50 p-3 text-sm">
          <span className="text-muted-foreground">{t("form.woLabel")}: </span>
          <span className="font-semibold">{wo && wo !== "*" && !isKm ? <RefCode>{wo}</RefCode> : woText}</span>
        </div>

        {/* Material: category → detailed item cascade, unit auto-set */}
        <PickField label={t("form.category")} value={category} onChange={pickCategory}
          options={ref.catalog.map((c) => c.category)} placeholder={t("form.categoryPick")} />

        {!freeMat ? (
          <div className={FIELD}>
            <Label>{t("form.material")}</Label>
            <Select value={material} onValueChange={setMaterial}>
              <SelectTrigger className={CONTROL}><SelectValue placeholder={t("form.materialPick")} /></SelectTrigger>
              <SelectContent>
                {(cat?.items || []).map((m) => (
                  <SelectItem key={m} value={m} className="py-2.5 text-base">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button type="button" className="self-start text-sm text-info underline"
              onClick={() => setFreeMat(true)}>
              {t("form.cantFindMaterial")}
            </button>
          </div>
        ) : (
          <div className={FIELD}>
            <Label>{t("form.material")}</Label>
            <Input className={CONTROL} placeholder={t("form.freeMaterialPh")}
              value={freeMatText} onChange={(e) => setFreeMatText(e.target.value)} />
            <button type="button" className="self-start text-sm text-muted-foreground underline"
              onClick={() => { setFreeMat(false); setFreeMatText(""); setFreeUnit("") }}>
              {t("form.backToList")}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className={FIELD}>
            <Label>{t("form.quantity")}</Label>
            <Input dir="ltr" inputMode="decimal" className={CONTROL}
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className={FIELD}>
            <Label>{t("form.unit")}</Label>
            {freeMat ? (
              <Input className={CONTROL} value={freeUnit} onChange={(e) => setFreeUnit(e.target.value)} />
            ) : (
              <Input className={cn(CONTROL, "bg-secondary/50")} value={unit} readOnly tabIndex={-1} />
            )}
          </div>
        </div>

        {/* Supplier + subcontractor */}
        {!freeSup ? (
          <div className={FIELD}>
            <PickField label={t("form.supplier")} value={supplier} onChange={setSupplier}
              options={ref.suppliers} placeholder={t("form.supplierPick")} />
            <button type="button" className="self-start text-sm text-info underline"
              onClick={() => setFreeSup(true)}>
              {t("form.cantFindSupplier")}
            </button>
          </div>
        ) : (
          <div className={FIELD}>
            <Label>{t("form.supplier")}</Label>
            <Input className={CONTROL} placeholder={t("form.freeSupplierPh")}
              value={freeSupText} onChange={(e) => setFreeSupText(e.target.value)} />
            <button type="button" className="self-start text-sm text-muted-foreground underline"
              onClick={() => { setFreeSup(false); setFreeSupText("") }}>
              {t("form.backToList")}
            </button>
          </div>
        )}
        <PickField label={t("form.subcontractor")} value={sub} onChange={setSub}
          options={ref.subcontractors} placeholder={t("form.subPick")} />

        {/* Required paper-receipt photo, compressed client-side */}
        <div className={FIELD}>
          <Label>{t("form.photo")}</Label>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => void onPhoto(e.target.files?.[0])} />
          <Button type="button" variant={photoData ? "secondary" : "outline"} className="h-12 text-base"
            onClick={() => fileRef.current?.click()}>
            {photoData ? t("form.photoRetake") : t("form.photoTake")}
          </Button>
          {!photoData && <div className="text-xs text-muted-foreground">{t("form.photoHint")}</div>}
          {photoErr && <div className="text-sm text-danger">{t("form.photoFail")}</div>}
          {photoData && <img src={photoData} alt="" className="max-h-64 w-full rounded-lg border object-contain" />}
        </div>

        <div className={FIELD}>
          <Label>{t("form.remarks")}</Label>
          <Textarea className="text-base" placeholder={t("form.remarksPh")}
            value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>

        {/* Receiver — locked */}
        <div className={FIELD}>
          <Label>{t("form.receiver")}</Label>
          <Input className={cn(CONTROL, "bg-secondary/50")} value={name} readOnly tabIndex={-1} />
        </div>

        {err && <ErrorBox message={err} />}
        <Button className="h-12 text-base" onClick={submit}>{t("form.submit")}</Button>
        <Button variant="ghost" className="h-12 text-base" onClick={() => nav("/capture")}>{t("form.cancel")}</Button>
      </CardContent></Card>
    </div>
  )
}
