/* Printer calibration — port of legacy ?printTest=1. Opens the exact
   4-copy A5 flow with clearly-marked sample data (note 999999, remarks say
   it's a test). No PIN, and deliberately NO database write. */

import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { DispatchData } from "./helpers"
import { receiptLinkFor } from "./helpers"
import { printDeliveryNote } from "./print/printDeliveryNote"
import { InfoBox, PortalShell, SectionTitle } from "./components"

const SAMPLE: DispatchData = {
  noteNumber: "999999", loadNumber: 3,
  company: "كوبري", project: "كوبري — صيانة حولي", contract: "ق ص / ط ش / 9",
  workOrder: "43", plant: "AP02", truckNumber: "5875", driverName: "هلال",
  driverPhone: "", naqel: "كوبري", notifyEngineer: "",
  mixType: "Type II (60/70)", tempDispatch: "160", weight: "33.0",
  site: "سلوى", block: "6", street: "6.1", locationType: "block_street",
  clerkName: "خالد", remarks: "سند تجريبي لمعايرة الطابعة — ليس سنداً فعلياً",
}

export default function PrintTest() {
  const { t } = useTranslation("dispatch")
  return (
    <PortalShell badge={t("badge.printTest")}>
      <Card><CardContent className="flex flex-col gap-4 px-4 py-4">
        <SectionTitle>{t("printTest.title")}</SectionTitle>
        <InfoBox>{t("printTest.info")}</InfoBox>
        <Button size="lg" className="h-12 text-base"
          onClick={() => printDeliveryNote(SAMPLE, receiptLinkFor(SAMPLE.noteNumber!))}>
          {t("printTest.button")}
        </Button>
      </CardContent></Card>
    </PortalShell>
  )
}
