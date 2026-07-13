import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { EmptyState, ErrorBox, LoadingList } from "@/components/patterns"
import { supabase } from "@/lib/supabase"

/* REGISTER pattern over the canonical masters (read-only — edits happen
   in the Supabase dashboard until the permissions phase). */

export default function Masters({ kind }: { kind: "vendors" | "items" | "ccs" }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState("")
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    setErr(""); setRows(null)
    try {
      const r = kind === "vendors"
        ? await supabase.from("vendors").select("*").eq("active", true).order("name").limit(1000)
        : kind === "items"
          ? await supabase.from("items").select("*").eq("active", true).order("name").limit(1000)
          : await supabase.from("cost_centers").select("*").order("kind", { ascending: false }).order("code")
      if (r.error) throw r.error
      setRows(r.data || [])
    } catch { setErr(t("common.error")) }
  }, [kind, t])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    if (!rows) return []
    const n = q.trim().toLowerCase()
    if (!n) return rows
    return rows.filter((r) =>
      [r.name, r.name_ar, r.name_en, r.code, r.category].filter(Boolean)
        .some((s: string) => String(s).toLowerCase().includes(n)))
  }, [rows, q])

  if (err && !rows) return <ErrorBox message={err} onRetry={load} />
  if (!rows) return <LoadingList />

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{t(`masters.${kind}`)}</h2>
        <span className="text-xs text-muted-foreground">{t("masters.hint")}</span>
      </div>
      <Input className="max-w-xs" placeholder={t("register.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {!filtered.length ? (
        <EmptyState title={kind === "items" ? t("masters.itemsEmpty") : t("register.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("masters.name")}</TableHead>
                {kind === "vendors" && <TableHead>{t("masters.kind")}</TableHead>}
                {kind === "items" && <><TableHead>{t("masters.unit")}</TableHead><TableHead>{t("masters.category")}</TableHead></>}
                {kind === "ccs" && <><TableHead>{t("masters.code")}</TableHead><TableHead>{t("masters.kind")}</TableHead><TableHead>{t("masters.spectronova")}</TableHead></>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-72 truncate">{r.name || r.name_ar || r.name_en || "—"}</TableCell>
                  {kind === "vendors" && (
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t(`masters.kindMap.${r.kind}`, { defaultValue: r.kind })}
                      </Badge>
                    </TableCell>
                  )}
                  {kind === "items" && <><TableCell>{r.unit || "—"}</TableCell><TableCell>{r.category || "—"}</TableCell></>}
                  {kind === "ccs" && (
                    <>
                      <TableCell><span className="ref-code">{r.code}</span></TableCell>
                      <TableCell>{r.kind === "division" ? t("masters.division") : t("masters.project")}</TableCell>
                      <TableCell>{r.spectronova_code || "—"}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
