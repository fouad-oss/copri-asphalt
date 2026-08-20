import { useCallback, useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { qty as fmtQty } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/session"
import { kwd, L } from "./labels"
import {
  kwDay, legacyRecon, poSource, snAlertDismiss, snAlerts, snRuns, snSyncStatus, snSyncTrigger,
  type PoSource, type ReconRow, type SnAlert, type SnRun, type SnSyncStatus,
} from "./data"
import { EmptyCard, LoadError, Loading } from "./ui"

/* ── SN sync panel (SN sync brief v2, Phase B §3.4) ───────────────────
   Last run + counts, "Sync now" (admins), stage table, open alerts
   (dismissable — never auto-hidden), recent runs, and the legacy ↔ SN
   PO reconciliation report. Polls while a run is in flight. ── */

const fmtTs = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—"
const fmtMs = (ms: number) => (ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(0)} s`)

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      "rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
      status === "ok" && "bg-success/15 text-success",
      status === "running" && "bg-warning/15 text-warning",
      status === "partial" && "bg-warning/15 text-warning",
      status === "error" && "bg-danger/15 text-danger",
    )}>{status === "running" ? L.sync.running : status}</span>
  )
}

function Stages({ stages }: { stages: SnSyncStatus["stages"] }) {
  if (!stages?.length) return null
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{L.sync.colStage}</TableHead><TableHead className="text-end">{L.sync.colFetched}</TableHead>
        <TableHead className="text-end">{L.sync.colNew}</TableHead><TableHead className="text-end">{L.sync.colChanged}</TableHead>
        <TableHead className="text-end">{L.sync.colSame}</TableHead><TableHead className="text-end">{L.sync.colMissed}</TableHead>
        <TableHead className="text-end">{L.sync.colErrors}</TableHead><TableHead className="text-end">{L.sync.colTime}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {stages.map((s) => (
          <TableRow key={s.stage}>
            <TableCell className="font-medium">{s.stage}{s.note && <span className="ms-2 text-xs text-muted-foreground">{s.note}</span>}</TableCell>
            <TableCell className="text-end tabular-nums">{s.fetched}</TableCell>
            <TableCell className="text-end tabular-nums">{s.inserted}</TableCell>
            <TableCell className={cn("text-end tabular-nums", s.updated > 0 && "font-semibold text-warning")}>{s.updated}</TableCell>
            <TableCell className="text-end tabular-nums">{s.unchanged}</TableCell>
            <TableCell className="text-end tabular-nums">{s.missed}</TableCell>
            <TableCell className={cn("text-end tabular-nums", s.errors > 0 && "font-semibold text-danger")}>{s.errors}</TableCell>
            <TableCell className="text-end tabular-nums">{fmtMs(s.ms)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AlertRow({ a, onDismiss, canDismiss }: { a: SnAlert; onDismiss: (id: number) => void; canDismiss: boolean }) {
  const [open, setOpen] = useState(false)
  const d = a.detail ?? {}
  const summary = useMemo(() => {
    if (a.kind === "po_revised" || a.kind === "sr_revised" || a.kind === "invoice_revised") {
      const h = (d.header ?? []).map((x: any) => x.field).join(", ")
      const l = d.lines ? `lines +${d.lines.added?.length ?? 0} −${d.lines.removed?.length ?? 0} ~${d.lines.changed?.length ?? 0}` : ""
      return [h && `header: ${h}`, l].filter(Boolean).join(" · ")
    }
    if (a.kind === "header_line_mismatch") return `net ${kwd(d.net_amount)} vs Σ lines ${kwd(d.lines_amount)}`
    if (a.kind.startsWith("po_discovered")) return d.sr_number || d.doc_number || ""
    return d.message || ""
  }, [a, d])
  return (
    <div className={cn("rounded-lg border bg-card p-3", a.dismissedAt && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">{L.sync.kind[a.kind] ?? a.kind}</span>
          {a.refNumber && <RefCode className="ms-2">{a.refNumber}</RefCode>}
          {a.refId != null && !a.refNumber && <span className="ms-2 text-xs text-muted-foreground">#{a.refId}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>{fmtTs(a.createdAt)}</span>
          {a.dismissedAt ? <span>· dismissed by {a.dismissedBy}</span> : canDismiss && (
            <Button size="sm" variant="outline" onClick={() => onDismiss(a.id)}>{L.sync.dismiss}</Button>
          )}
        </div>
      </div>
      {summary && <div className="mt-1 text-xs text-muted-foreground">{summary}</div>}
      {(d.header?.length || d.lines) && (
        <button type="button" className="mt-1 text-xs underline-offset-2 hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? "hide diff" : "show diff"}
        </button>
      )}
      {open && <pre className="mt-2 max-h-64 overflow-auto rounded bg-secondary/40 p-2 text-[11px]">{JSON.stringify(d, null, 1)}</pre>}
    </div>
  )
}

export default function SnSync() {
  const user = useOutletContext<Profile>()
  const [status, setStatus] = useState<SnSyncStatus | null | undefined>(undefined)
  const [runs, setRuns] = useState<SnRun[] | null>(null)
  const [alerts, setAlerts] = useState<SnAlert[] | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [recon, setRecon] = useState<ReconRow[] | null>(null)
  const [reconBucket, setReconBucket] = useState<ReconRow["bucket"] | "all">("all")
  const [source, setSource] = useState<PoSource>("legacy")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const [st, rs, al, src] = await Promise.all([snSyncStatus(), snRuns(10), snAlerts(showDismissed), poSource()])
      setStatus(st); setRuns(rs); setAlerts(al); setSource(src)
    } catch { setError(true) }
  }, [showDismissed])
  useEffect(() => { void load() }, [load])
  useEffect(() => { legacyRecon().then(setRecon).catch(() => setRecon([])) }, [status?.runId])

  // poll while a run is in flight
  useEffect(() => {
    if (status?.status !== "running") return
    const t = setInterval(() => { void load() }, 8000)
    return () => clearInterval(t)
  }, [status?.status, load])

  async function trigger(scope: "quick" | "full") {
    if (!user.admin) { toast.error(L.sync.notAdmin); return }
    setBusy(true)
    try {
      const r = await snSyncTrigger(scope)
      toast.success(L.sync.started(r.runId))
      await load()
    } catch (e: any) {
      toast.error(`${L.sync.startFailed}${e?.message ? ` — ${e.message}` : ""}`)
    } finally { setBusy(false) }
  }
  async function dismiss(id: number) {
    try { await snAlertDismiss(id); toast.success(L.sync.dismissed); await load() }
    catch (e: any) { toast.error(e?.message || L.app.loadError) }
  }

  const reconCounts = useMemo(() => {
    const c = { matched: 0, legacy_only: 0, sn_only: 0 }
    for (const r of recon ?? []) c[r.bucket]++
    return c
  }, [recon])
  const reconShown = useMemo(() => (recon ?? []).filter((r) => reconBucket === "all" || r.bucket === reconBucket), [recon, reconBucket])
  const CAP = 200

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{L.sync.heading}</h2>
        <p className="text-xs text-muted-foreground">{L.sync.intro}</p>
      </div>

      {error && <LoadError onRetry={() => void load()} />}
      {!error && status === undefined && <Loading rows={3} />}

      {!error && status !== undefined && (
        <>
          {/* status card */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <div>
                  <span className="text-muted-foreground">{L.sync.lastRun}:</span>{" "}
                  <b className="tabular-nums">{status ? fmtTs(status.startedAt) : L.sync.never}</b>
                  {status && <span className="ms-2"><StatusPill status={status.status} /></span>}
                  {status && <span className="ms-2 text-xs text-muted-foreground">{status.trigger}{status.triggeredBy ? ` · ${status.triggeredBy}` : ""}{status.finishedAt ? ` · ${fmtTs(status.finishedAt)}` : ""}</span>}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {L.sync.counts}: {status?.poCount ?? 0} {L.sync.pos} · {status?.srCount ?? 0} {L.sync.receipts} · {status?.invoiceCount ?? 0} {L.sync.invoices} · {status?.vendorCount ?? 0} {L.sync.vendors} · {status?.itemCount ?? 0} {L.sync.items}
                  {status?.requests ? ` · ${status.requests} SN requests` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {L.sync.poSource}: <b>{source === "sn" ? L.sync.poSourceSn : L.sync.poSourceLegacy}</b>
                  {user.admin && <span className="ms-2 font-mono text-[11px]">{L.sync.poSourceHint}</span>}
                </div>
                {status?.error && <div className="text-xs text-danger">{status.error}</div>}
              </div>
              {user.admin && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void trigger("quick")} disabled={busy || status?.status === "running"}>
                    {busy ? L.sync.syncing : L.sync.syncNow}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void trigger("full")} disabled={busy || status?.status === "running"}>
                    {L.sync.syncFull}
                  </Button>
                </div>
              )}
            </div>
            {status?.stages?.length ? <div className="mt-3"><Stages stages={status.stages} /></div> : null}
          </div>

          {/* alerts */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{L.sync.alerts}{status ? ` (${status.openAlerts})` : ""}</h3>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={showDismissed} onCheckedChange={(v) => setShowDismissed(!!v)} />{L.sync.showDismissed}
              </label>
            </div>
            {alerts === null && <Loading rows={2} />}
            {alerts !== null && alerts.length === 0 && <EmptyCard title={L.sync.noAlerts} />}
            {alerts?.map((a) => <AlertRow key={a.id} a={a} onDismiss={(id) => void dismiss(id)} canDismiss={!!(user.admin || user.accountant)} />)}
          </div>

          {/* recent runs */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{L.sync.runs}</h3>
            {runs === null ? <Loading rows={2} /> : runs.length === 0 ? <EmptyCard title={L.sync.never} /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>{L.sync.lastRun}</TableHead><TableHead>{L.sync.status}</TableHead>
                  <TableHead>scope</TableHead><TableHead className="text-end">requests</TableHead><TableHead className="text-end">calls</TableHead><TableHead>by</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{r.id}</TableCell>
                      <TableCell className="tabular-nums">{fmtTs(r.startedAt)}{r.finishedAt ? ` → ${fmtTs(r.finishedAt)}` : ""}</TableCell>
                      <TableCell><StatusPill status={r.status} />{r.cursor?.stage && r.status === "running" && <span className="ms-2 text-xs text-muted-foreground">{r.cursor.stage}{r.cursor.nextId ? ` @${r.cursor.nextId}` : ""}</span>}</TableCell>
                      <TableCell>{r.scope}</TableCell>
                      <TableCell className="text-end tabular-nums">{r.requests}</TableCell>
                      <TableCell className="text-end tabular-nums">{r.invocations}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.trigger}{r.triggeredBy ? ` · ${r.triggeredBy}` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* legacy reconciliation */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{L.sync.recon}</h3>
            <p className="text-xs text-muted-foreground">{L.sync.reconHint}</p>
            {recon === null ? <Loading rows={2} /> : recon.length === 0 ? <EmptyCard title={L.sync.reconEmpty} /> : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(["all", "matched", "legacy_only", "sn_only"] as const).map((b) => (
                    <Button key={b} size="sm" variant={reconBucket === b ? "default" : "outline"} onClick={() => setReconBucket(b)}>
                      {b === "all" ? `all ${recon.length}` : `${b === "matched" ? L.sync.matched : b === "legacy_only" ? L.sync.legacyOnly : L.sync.snOnly} ${reconCounts[b]}`}
                    </Button>
                  ))}
                </div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{L.sync.colBucket}</TableHead><TableHead>{L.sync.colApp}</TableHead><TableHead>{L.sync.colSn}</TableHead>
                    <TableHead>{L.sync.colVendor}</TableHead><TableHead className="text-end">{L.sync.colValue}</TableHead>
                    <TableHead className="text-end">{L.sync.colSnNet}</TableHead><TableHead className="text-end">{L.sync.colDelta}</TableHead><TableHead className="text-end">{L.sync.colBundles}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {reconShown.slice(0, CAP).map((r, i) => (
                      <TableRow key={`${r.bucket}-${r.commitmentId ?? ""}-${r.snPoId ?? ""}-${i}`}>
                        <TableCell className="text-xs">{r.bucket === "matched" ? L.sync.matched : r.bucket === "legacy_only" ? L.sync.legacyOnly : L.sync.snOnly}</TableCell>
                        <TableCell>{r.appNumber ? <RefCode>{r.appNumber}</RefCode> : "—"}{r.appLines ? <span className="ms-1 text-xs text-muted-foreground">({r.appLines} lines)</span> : null}</TableCell>
                        <TableCell>{r.poNumber ? <RefCode>{r.poNumber}</RefCode> : "—"}
                          {r.isFixedAsset && <span className="ms-1 text-[10px] uppercase text-muted-foreground">FA</span>}
                          {r.isClosed && <span className="ms-1 text-[10px] uppercase text-muted-foreground">closed</span>}
                        </TableCell>
                        <TableCell className="text-xs">{r.supplierName || r.appVendor}{r.department ? ` · ${r.department}` : ""}</TableCell>
                        <TableCell className="text-end tabular-nums">{r.appValue != null ? kwd(r.appValue) : "—"}</TableCell>
                        <TableCell className="text-end tabular-nums">{r.snNet != null ? kwd(r.snNet) : "—"}</TableCell>
                        <TableCell className={cn("text-end tabular-nums", r.valueDelta && Math.abs(r.valueDelta) > 0.005 && "font-semibold text-warning")}>{r.valueDelta != null ? fmtQty(r.valueDelta) : ""}</TableCell>
                        <TableCell className="text-end tabular-nums">{r.appBundles || ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {reconShown.length > CAP && <p className="text-xs text-muted-foreground">{L.sync.showing(CAP, reconShown.length)}</p>}
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{kwDay(new Date().toISOString())}</p>
        </>
      )}
    </div>
  )
}
