import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  EmptyState, ErrorBox, LoadingList, RefCode, StatusBadge, TwinBars,
} from "@/components/patterns"
import { supabase } from "@/lib/supabase"
import { kd } from "@/lib/format"

/* REGISTER pattern — filter bar above a dense table; twin bars for
   received/invoiced; values end-aligned; rows open the DETAIL. Nobody
   browses a register; they query it. */

type MatchRow = {
  commitment_id: number; number: string; ctype: string; origin: string
  status: string; cost_center_id: number; vendor_id: number
  ordered_value: number; received_amount: number; invoiced_amount: number
  pending_count: number
}

export default function PORegister() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<MatchRow[] | null>(null)
  const [vendors, setVendors] = useState<Record<number, string>>({})
  const [ccs, setCcs] = useState<{ id: number; code: string; name_ar: string; name_en: string }[]>([])
  const [err, setErr] = useState("")
  const [q, setQ] = useState("")
  const [cc, setCc] = useState("all")

  const load = useCallback(async () => {
    setErr(""); setRows(null)
    try {
      const [m, v, c] = await Promise.all([
        supabase.from("po_match").select("*").order("commitment_id", { ascending: false }).limit(300),
        supabase.from("vendors").select("id,name"),
        supabase.from("cost_centers").select("id,code,name_ar,name_en"),
      ])
      if (m.error) throw m.error
      const vmap: Record<number, string> = {}
      ;(v.data || []).forEach((x: any) => { vmap[x.id] = x.name })
      setVendors(vmap); setCcs(c.data || []); setRows((m.data || []) as MatchRow[])
    } catch { setErr(t("common.error")) }
  }, [t])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    return rows.filter((r) =>
      (cc === "all" || String(r.cost_center_id) === cc) &&
      (!needle || r.number.toLowerCase().includes(needle) ||
        (vendors[r.vendor_id] || "").toLowerCase().includes(needle)))
  }, [rows, q, cc, vendors])

  if (err && !rows) return <ErrorBox message={err} onRetry={load} />
  if (!rows) return <LoadingList />

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("register.title")}</h2>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t("register.search")}
          value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cc} onValueChange={setCc}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("register.costCenter")}: —</SelectItem>
            {ccs.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {(c.name_ar || c.name_en) ? `${c.name_ar || c.name_en} (${c.code})` : c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!filtered.length ? (
        <EmptyState title={t("register.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("register.number")}</TableHead>
                <TableHead>{t("register.vendor")}</TableHead>
                <TableHead className="text-end">{t("register.value")}</TableHead>
                <TableHead className="w-36">{t("register.received")} / {t("register.invoiced")}</TableHead>
                <TableHead>{t("register.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.commitment_id}>
                  <TableCell>
                    {/* every reference code is a link to its detail */}
                    <Link className="hover:underline" to={`/commitments/${r.commitment_id}`}>
                      <RefCode>{r.number}</RefCode>
                    </Link>
                    {r.origin !== "rf" && (
                      <span className="ms-1 text-xs text-muted-foreground">
                        {t(`register.origin.${r.origin}`)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{vendors[r.vendor_id] || "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">{kd(r.ordered_value)}</TableCell>
                  <TableCell>
                    <TwinBars total={Number(r.ordered_value)}
                      a={Number(r.received_amount)} b={Number(r.invoiced_amount)} />
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
