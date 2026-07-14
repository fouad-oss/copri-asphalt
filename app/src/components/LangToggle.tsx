import { useTranslation } from "react-i18next"
import { setLang, type Lang } from "@/lib/i18n"

/** AR ⇄ EN switch — shows the language you would switch TO. dir flips on
 *  the root via setLang; logical properties make the rest follow. */
export default function LangToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation()
  const other: Lang = i18n.language === "ar" ? "en" : "ar"
  return (
    <button type="button" onClick={() => setLang(other)}
      className={"rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary " + (className || "")}>
      {other === "ar" ? "العربية" : "English"}
    </button>
  )
}
