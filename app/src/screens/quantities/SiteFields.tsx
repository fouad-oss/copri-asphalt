// Location fields for a work order, shaped by the contract's site model
// (see site.ts). Used by KashefNew (create) and KashefDetail (edit).
// Renders as grid cells so it slots straight into the parent's grid.
import { useId } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ROADS, type RoadCode, type SiteModel, type SiteState, type SubKind } from "./site"

const DIRECTIONS = ["بالاتجاهين", "اتجاه الشمال", "اتجاه الجنوب", "اتجاه الكويت", "اتجاه الفحيحيل"]

export function SiteFields({ model, value: s, onChange, areas = [], wide = "col-span-2 lg:col-span-3" }: {
  model: SiteModel
  value: SiteState
  onChange: (patch: Partial<SiteState>) => void
  areas?: string[]          // known areas / free-text roads, offered as suggestions
  wide?: string             // class for the full-width cell
}) {
  const { t, i18n } = useTranslation("quantities")
  const listId = useId()
  const dirId = useId()
  const en = i18n.language.startsWith("en")
  const text = (key: keyof SiteState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [key]: e.target.value })

  if (model === "areas") {
    return (
      <>
        <div className="space-y-1">
          <Label>{t("new.area")}</Label>
          <Input value={s.area} onChange={text("area")} list={listId} />
          <datalist id={listId}>{areas.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
        <div className="space-y-1">
          <Label>{t("new.locType")}</Label>
          <Select value={s.locType} onValueChange={(v) => onChange({ locType: v as SiteState["locType"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="block">{t("loc.block")}</SelectItem>
              <SelectItem value="street">{t("loc.street")}</SelectItem>
              <SelectItem value="misc">{t("loc.misc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {s.locType === "block" && (
          <div className="space-y-1">
            <Label>{t("new.blockNo")}</Label>
            <Input dir="ltr" value={s.blockNo} onChange={text("blockNo")} />
            <p className="text-xs text-muted-foreground">{t("new.blockStreetHint")}</p>
          </div>
        )}
        {s.locType === "street" && (
          <div className="space-y-1">
            <Label>{t("new.streetName")}</Label>
            <Input value={s.streetName} onChange={text("streetName")} />
          </div>
        )}
      </>
    )
  }

  // ── roads model ────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-1">
        <Label>{t("new.road")}</Label>
        <Select value={s.road} onValueChange={(v) => onChange({ road: v as RoadCode })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROADS.map((r) => (
              <SelectItem key={r.code} value={r.code}>
                {en ? r.en : r.name} <span className="ms-1 font-mono text-[11px] text-muted-foreground" dir="ltr">({r.code})</span>
              </SelectItem>
            ))}
            <SelectItem value="other">{t("loc.otherRoad")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {s.road === "other" && (
        <div className="space-y-1">
          <Label>{t("new.roadOther")}</Label>
          <Input value={s.area} onChange={text("area")} list={listId}
                 placeholder="طريق الساحلي / اعمال طارئة ومتفرقة…" />
          <datalist id={listId}>{areas.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
      )}
      <div className="space-y-1">
        <Label>{t("new.sub")}</Label>
        <Select value={s.sub} onValueChange={(v) => onChange({ sub: v as SubKind })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="range">{t("sub.range")}</SelectItem>
            <SelectItem value="spot">{t("sub.spot")}</SelectItem>
            <SelectItem value="none">{t("sub.none")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {s.sub === "range" && (
        <>
          <div className="space-y-1">
            <Label>{t("new.kmFrom")}</Label>
            <Input dir="ltr" inputMode="decimal" value={s.kmFrom} onChange={text("kmFrom")} placeholder="9+200" />
          </div>
          <div className="space-y-1">
            <Label>{t("new.kmTo")}</Label>
            <Input dir="ltr" inputMode="decimal" value={s.kmTo} onChange={text("kmTo")} placeholder="12+200" />
          </div>
        </>
      )}
      {s.sub === "spot" && (
        <div className={`space-y-1 ${wide}`}>
          <Label>{t("new.spot")}</Label>
          <Input value={s.locationText} onChange={text("locationText")}
                 placeholder="تقاطع (78) مع نادي الفحيحيل / مدخل ومخرج سلوى…" />
        </div>
      )}
      {s.sub !== "none" || s.road !== "other" ? (
        <div className="space-y-1">
          <Label>{t("new.direction")}</Label>
          <Input value={s.direction} onChange={text("direction")} list={dirId} placeholder="بالاتجاهين / اتجاه الشمال…" />
          <datalist id={dirId}>{DIRECTIONS.map((d) => <option key={d} value={d} />)}</datalist>
        </div>
      ) : null}
      {s.sub === "range" && (
        <div className={`space-y-1 ${wide}`}>
          <Label>{t("new.locationText")} <span className="text-xs text-muted-foreground">({t("common.optional")})</span></Label>
          <Input value={s.locationText} onChange={text("locationText")} placeholder={t("new.locationTextPh")} />
        </div>
      )}
    </>
  )
}
