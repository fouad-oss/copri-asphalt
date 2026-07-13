import { useTranslation } from "react-i18next"
import { EmptyState } from "@/components/patterns"

/* Next migration wave: the gate-aware approval queue (QUEUE pattern).
   Until it lands here, approvers keep using the legacy portal (?rf=1). */
export default function RequestQueue() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("home.queue")}</h2>
      <EmptyState title={t("stub.title")} hint={t("stub.hint")} />
    </div>
  )
}
