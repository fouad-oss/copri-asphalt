// Project switcher — the module is per-contract (each project keeps its
// own BOP, its own WO numbering and its own certificates), so the header
// carries the selection. Changing it clears the per-project caches and
// remounts the screens via the key in QuantitiesPortal.
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { contractList, getContract, setContract, type ContractInfo } from "./data"

export function ProjectSwitcher({ onChange }: { onChange: (code: string) => void }) {
  const { t } = useTranslation("quantities")
  const [projects, setProjects] = useState<ContractInfo[]>([])
  const [code, setCode] = useState(getContract())

  useEffect(() => {
    let alive = true
    void contractList()
      .then((list) => {
        if (!alive || list.length === 0) return
        setProjects(list)
        // a saved selection can point at a contract that no longer exists
        if (!list.some((c) => c.code === getContract())) {
          setContract(list[0].code)
          setCode(list[0].code)
          onChange(list[0].code)
        }
      })
      .catch(() => { /* header stays quiet; screens surface the error */ })
    return () => { alive = false }
  }, [onChange])

  if (projects.length < 2) return null   // nothing to switch between

  return (
    <Select
      value={code}
      onValueChange={(v) => {
        setContract(v)
        setCode(v)
        onChange(v)
      }}
    >
      <SelectTrigger className="h-8 w-52 text-sm" aria-label={t("nav.project")}>
        <SelectValue placeholder={t("nav.project")} />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.code} value={p.code}>
            <span className="flex items-center gap-2">
              <span>{p.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">{p.contractNo}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
