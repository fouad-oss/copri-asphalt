import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { RefCode } from "@/components/patterns"

import { cn } from "@/lib/utils"
import { L } from "./labels"
import {
  buildSnCsv, kwDay, snCells, SN_COLUMNS, snImportConfirm, snPageData, type SnPageRow,
} from "./data"
import { downloadBlob } from "./ui"
import logoInk from "@/assets/brand/copri-logo-ink.png"

/* ── Screen 7: SN data page — external, read-only, TOKEN access ───────
   Published bundles only (RLS-backed via the token RPC). The frozen
   12-column contract renders LITERALLY; the import confirmation is SN
   staff's ONLY write. The token rides the URL — no storage. ── */

// Qty / Unit Price / Amount columns right-align (skill: values
// right-aligned in registers)
const NUMERIC_COLS = new Set([5, 7, 8])

function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = "en"
    document.documentElement.dir = "ltr"
  }, [])
  return (
    <div dir="ltr" className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <img src={logoInk} alt="COPRI" className="h-7 w-auto" />
          <span className="text-sm font-semibold">{L.sn.title}</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">{children}</main>
    </div>
  )
}

function TokenGate({ error, onSubmit }: { error: string; onSubmit: (t: string) => void }) {
  const [t, setT] = useState("")
  return (
    <div className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-3 rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">{L.sn.tokenPrompt}</p>
      <label className="text-xs text-muted-foreground">{L.sn.tokenLabel}</label>
      <Input value={t} onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && t.trim()) onSubmit(t.trim()) }} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button disabled={!t.trim()} onClick={() => onSubmit(t.trim())}>{L.sn.tokenGo}</Button>
    </div>
  )
}

function BundleCard({ token, rows, onSaved }: { token: string; rows: SnPageRow[]; onSaved: () => void }) {
  const f = rows[0]
  const amount = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const [ref, setRef] = useState("")
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!ref.trim()) { toast.error(L.sn.refNeed); return }
    setBusy(true)
    try { await snImportConfirm(token, f.bundle_id, ref.trim()); onSaved() }
    catch { toast.error(L.sn.refFailed); setBusy(false) }
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ref-code text-sm font-semibold">{f.bundle_no}</span>
        <Badge variant="secondary" className={cn("font-normal",
          f.imported_flag ? "bg-success/10 text-success" : "bg-warning-surface text-warning")}>
          {f.imported_flag ? L.sn.imported : L.sn.pendingBadge}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {L.sn.publishedOn(kwDay(f.published_at))}
          {f.imported_flag && f.sn_reference && <> · <RefCode>{f.sn_reference}</RefCode></>}
        </span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse whitespace-nowrap text-xs">
          <thead>
            <tr>
              {SN_COLUMNS.map((h, i) => (
                <th key={h} className={cn("border bg-secondary/60 px-2 py-1 font-semibold",
                  NUMERIC_COLS.has(i) ? "text-end" : "text-start")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line_id}>
                {snCells(r).map((v, i) => (
                  <td key={i} className={cn("border px-2 py-1 tabular-nums",
                    NUMERIC_COLS.has(i) ? "text-end" : "text-start")}>{v}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td colSpan={8} className="border px-2 py-1 text-start font-semibold">{L.sn.totalKwd}</td>
              <td className="border px-2 py-1 text-end font-semibold tabular-nums">{amount.toFixed(3)}</td>
              <td colSpan={3} className="border" />
            </tr>
          </tbody>
        </table>
      </div>
      {!f.imported_flag && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{L.sn.reference}</span>
          <Input className="max-w-xs" placeholder={L.sn.refPlaceholder}
            value={ref} onChange={(e) => setRef(e.target.value)} />
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? L.sn.refSaving : L.sn.refSave}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SnDataPage() {
  const [params, setParams] = useSearchParams()
  const token = params.get("token") ?? ""
  const [rows, setRows] = useState<SnPageRow[] | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "badToken" | "error" | "ok">("idle")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [po, setPo] = useState("all")
  const [site, setSite] = useState("all")

  const load = useCallback(async (tk: string) => {
    setState("loading"); setRows(null)
    try { setRows(await snPageData(tk)); setState("ok") }
    catch (e: any) { setState(e?.message === "badToken" ? "badToken" : "error") }
  }, [])
  useEffect(() => { if (token) void load(token); else setState("idle") }, [token, load])

  const pos = useMemo(() => [...new Set((rows ?? []).map((r) => r.po_number))].sort(), [rows])
  const sites = useMemo(() => [...new Set((rows ?? []).map((r) => r.site).filter(Boolean))].sort(), [rows])
  const filtered = useMemo(() => (rows ?? []).filter((r) =>
    (!from || (r.delivery_date ?? "") >= from) &&
    (!to || (r.delivery_date ?? "") <= to) &&
    (po === "all" || r.po_number === po) &&
    (site === "all" || r.site === site)), [rows, from, to, po, site])

  const byBundle = useMemo(() => {
    const g: Record<number, SnPageRow[]> = {}; const order: number[] = []
    filtered.forEach((r) => { if (!g[r.bundle_id]) { g[r.bundle_id] = []; order.push(r.bundle_id) } g[r.bundle_id].push(r) })
    return order.map((id) => g[id])
  }, [filtered])

  const pending = useMemo(() => {
    const seen = new Set<number>(); const out: SnPageRow[] = []
    ;(rows ?? []).forEach((r) => {
      if (!r.imported_flag && !seen.has(r.bundle_id)) { seen.add(r.bundle_id); out.push(r) }
    })
    return out
  }, [rows])

  function downloadCsv() {
    downloadBlob(buildSnCsv(filtered), `copri-sn-bundles-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (!token || state === "badToken") return (
    <Shell>
      <TokenGate error={state === "badToken" ? L.sn.tokenBad : ""}
        onSubmit={(t) => setParams({ token: t })} />
    </Shell>
  )
  if (state === "loading" || state === "idle") return (
    <Shell>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</Shell>
  )
  if (state === "error") return (
    <Shell>
      <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
        {L.sn.loadFailed}
        <Button variant="outline" size="sm" className="ms-3" onClick={() => void load(token)}>
          {L.app.retry}
        </Button>
      </div>
    </Shell>
  )

  return (
    <Shell>
      <p className="text-xs text-muted-foreground">{L.sn.intro}</p>

      {/* pending-import list — visible to both sides */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-1 text-sm font-semibold">{L.sn.pending(pending.length)}</div>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">{L.sn.pendingNone}</p>
        ) : pending.map((p) => (
          <div key={p.bundle_id} className="text-xs tabular-nums">
            {L.sn.pendingLine(p.bundle_no, p.po_number,
              (rows ?? []).filter((r) => r.bundle_id === p.bundle_id).length,
              kwDay(p.published_at))}
          </div>
        ))}
      </div>

      {/* filters + download */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">{L.sn.filters}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input type="date" aria-label={L.sn.from} value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label={L.sn.to} value={to} onChange={(e) => setTo(e.target.value)} />
          <Select value={po} onValueChange={setPo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L.sn.allPos}</SelectItem>
              {pos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L.sn.allSites}</SelectItem>
              {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={downloadCsv}>
          {L.sn.csv(filtered.length)}
        </Button>
      </div>

      {byBundle.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {L.sn.noRows}
        </div>
      ) : byBundle.map((rowsOf) => (
        <BundleCard key={rowsOf[0].bundle_id} token={token} rows={rowsOf}
          onSaved={() => void load(token)} />
      ))}
    </Shell>
  )
}
