/* Dispatch success — port of legacy renderDispatchSuccess(). Auto-opens the
   4-copy A5 print flow immediately: silent on the plant PC (Chrome
   --kiosk-printing), one confirm tap elsewhere. Popup blocked → the manual
   reprint button below is the fallback path. The WhatsApp send to the
   engineer stays the clerk's one manual step until the Cloud API automates
   it server-side — keep it the dominant action on success. */

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { RefCode } from "@/components/patterns"
import { useDispatchRef, findEngineer } from "./reference"
import { locDisplay, whatsappMessage } from "./helpers"
import type { DispatchData } from "./helpers"
import { printDeliveryNote } from "./print/printDeliveryNote"
import { InfoBox } from "./components"

export default function DispatchSuccess({ isCopri, data, receiptLink, onNew, onChangeProject, onLogout }: {
  isCopri: boolean
  data: DispatchData
  receiptLink: string | null
  onNew: () => void
  onChangeProject: () => void
  onLogout: () => void
}) {
  const { t } = useTranslation("dispatch")
  const { cfg } = useDispatchRef()
  const [autoPrinted, setAutoPrinted] = useState(false)
  const [copied, setCopied] = useState(false)

  // Auto-print once per success (guarded — StrictMode re-runs effects in dev).
  const printedOnce = useRef(false)
  useEffect(() => {
    if (printedOnce.current) return
    printedOnce.current = true
    setAutoPrinted(printDeliveryNote(data, isCopri ? receiptLink : null, { silent: true }))
  }, [data, isCopri, receiptLink])

  const notifyEng = isCopri && data.notifyEngineer ? findEngineer(cfg, data.notifyEngineer) : null
  const loc = locDisplay(data)

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">✓</div>
      <h2 className="text-xl font-semibold">{isCopri ? t("success.sentCopri") : t("success.sentPlant")}</h2>
      <p><strong>{data.company}</strong> — {data.project}</p>
      <p>
        {t("success.wo")}: <strong><RefCode>{data.workOrder}</RefCode></strong>
        {" — "}
        {t("success.note")}: <strong><RefCode>{data.noteNumber}</RefCode></strong>
      </p>
      <p className="text-muted-foreground">{data.plant} — {data.site}{loc ? " / " + loc : ""}</p>
      {data.loadNumber ? (
        <p className="text-sm text-muted-foreground">{t("success.loadLine", { n: data.loadNumber })}</p>
      ) : null}

      {/* WhatsApp handoff to the engineer — the dominant action (Copri only) */}
      {isCopri && notifyEng && notifyEng.phone && receiptLink && (
        <Button size="lg" className="h-12 w-full bg-[#25D366] text-base text-white hover:bg-[#1faa52]"
          onClick={() => window.open(`https://wa.me/${notifyEng.phone}?text=${whatsappMessage(data, receiptLink)}`, "_blank")}>
          {t("success.waSend", { name: notifyEng.name })}
        </Button>
      )}
      {isCopri && data.notifyEngineer && !(notifyEng && notifyEng.phone) && (
        <InfoBox className="w-full text-start">{t("success.waNoPhone", { name: data.notifyEngineer })}</InfoBox>
      )}

      {/* Reprint / fallback print (the only print path if the popup was blocked) */}
      <Button variant="secondary" size="lg" className="h-12 w-full"
        onClick={() => printDeliveryNote(data, isCopri ? receiptLink : null)}>
        {autoPrinted ? t("success.reprint") : t("success.printManual")}
      </Button>
      {autoPrinted && <p className="text-sm text-muted-foreground">{t("success.autoOpened")}</p>}

      {isCopri && receiptLink && (
        <>
          <div className="w-full rounded-md border bg-card p-3 text-start">
            <div className="mb-1 text-sm font-semibold">{t("success.linkLabel")}</div>
            <bdi dir="ltr" className="break-all font-mono text-sm">{receiptLink}</bdi>
          </div>
          <Button variant="outline" className="w-full"
            onClick={() => { void navigator.clipboard.writeText(receiptLink); setCopied(true) }}>
            {copied ? t("success.copied") : t("success.copyLink")}
          </Button>
        </>
      )}
      {!isCopri && <p className="text-sm text-muted-foreground">{t("success.plantDone")}</p>}

      <Button variant="ghost" className="w-full" onClick={onNew}>{t("success.newDispatch")}</Button>
      <Button variant="ghost" className="w-full" onClick={onChangeProject}>{t("success.changeProject")}</Button>
      <Button variant="ghost" className="w-full text-muted-foreground" onClick={onLogout}>{t("success.logout")}</Button>
    </div>
  )
}
