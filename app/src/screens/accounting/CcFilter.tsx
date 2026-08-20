import { createContext, useContext, useEffect, useState } from "react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { L } from "./labels"
import { costCenters, type CostCenter } from "./data"

/* ── Cost-center scope — the SN-style page-top filter ─────────────────
   The shell owns the selection and renders the picker in its header;
   screens read it via useCostCenter(). For now only the audit queue
   applies it (end-to-end test scope — permissions refinement later).
   Selection persists per browser so the scope survives navigation. */

const STORE_KEY = "acct_cost_center"
const ALL = "__all__"

const CcContext = createContext<CostCenter | null>(null)
export const CcProvider = CcContext.Provider
export const useCostCenter = () => useContext(CcContext)

/** Shell-side state: master list + persisted selection. A failed list
 *  fetch just hides the picker — screens fall back to unfiltered. */
export function useCcState() {
  const [list, setList] = useState<CostCenter[]>([])
  const [cc, setCc] = useState<CostCenter | null>(null)
  useEffect(() => {
    void costCenters().then((l) => {
      setList(l)
      const saved = localStorage.getItem(STORE_KEY)
      if (saved) setCc(l.find((c) => c.code === saved) ?? null)
    }).catch(() => {})
  }, [])
  function pick(code: string) {
    const next = list.find((c) => c.code === code) ?? null
    setCc(next)
    if (next) localStorage.setItem(STORE_KEY, next.code)
    else localStorage.removeItem(STORE_KEY)
  }
  return { list, cc, pick }
}

export function ccLabel(c: CostCenter): string {
  return c.name ? `${c.code} — ${c.name}` : c.code
}

export function CcPicker({ list, cc, onPick }: {
  list: CostCenter[]; cc: CostCenter | null; onPick: (code: string) => void
}) {
  if (list.length === 0) return null
  return (
    <Select value={cc?.code ?? ALL} onValueChange={(v) => onPick(v === ALL ? "" : v)}>
      <SelectTrigger size="sm" className="max-w-48 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{L.app.allCostCenters}</SelectItem>
        {list.map((c) => (
          <SelectItem key={c.id} value={c.code}>{ccLabel(c)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
