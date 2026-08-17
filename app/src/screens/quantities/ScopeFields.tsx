// Scope-of-works multi-select + the description box, shared by the
// new-WO form and the detail edit dialog. Renders as grid cells.
import { useId } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ScopeCode } from "./data"
import { CATEGORIES, SCOPES, normalizeScopes, scopeLabel } from "./scopes"

export function ScopeFields({ scopes, description, onChange, wide = "col-span-2 lg:col-span-3" }: {
  scopes: ScopeCode[]
  description: string
  onChange: (patch: { scopes?: ScopeCode[]; description?: string }) => void
  wide?: string
}) {
  const { t, i18n } = useTranslation("quantities")
  const id = useId()
  const toggle = (code: ScopeCode, on: boolean) =>
    onChange({ scopes: normalizeScopes(on ? [...scopes, code] : scopes.filter((c) => c !== code)) })

  return (
    <>
      <div className={`space-y-1 ${wide}`}>
        <Label>{t("new.scopes")}</Label>
        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border px-3 py-2">
          {CATEGORIES.map((cat) => {
            const members = SCOPES.filter((s) => s.category === cat.code)
            return (
              <div key={cat.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {members.length > 1 && (
                  <span className="text-xs text-muted-foreground">{i18n.language.startsWith("en") ? cat.en : cat.ar}:</span>
                )}
                {members.map((s) => (
                  <label key={s.code} htmlFor={`${id}-${s.code}`} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <Checkbox id={`${id}-${s.code}`} checked={scopes.includes(s.code)}
                              onCheckedChange={(v) => toggle(s.code, v === true)} />
                    {scopeLabel(s.code, i18n.language)}
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <div className={`space-y-1 ${wide}`}>
        <Label>{t("new.description")} <span className="text-xs text-muted-foreground">({t("common.optional")})</span></Label>
        <Textarea rows={2} value={description} onChange={(e) => onChange({ description: e.target.value })}
                  placeholder={t("new.descriptionPh")} />
      </div>
    </>
  )
}
