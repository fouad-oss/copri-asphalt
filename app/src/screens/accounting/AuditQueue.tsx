import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ageDays } from "@/lib/format"
import { cn } from "@/lib/utils"
import { L } from "./labels"
import {
  ASPHALT_STATUSES, MATERIAL_STATUSES, auditCounts, auditOldest, auditRows,
  type AuditRow, type Channel, type NoteStatus,
} from "./data"

/* ── Screen 1: Audit queue (landing) ──────────────────────────────────
   Tab pills · three status tiles (counts, act as filters) · dense
   table. No dispatched-vs-received comparison — one Qty column per
   note (brief: a receipt confirms a load, it does not re-weigh it). ── */

const TONE: Record<NoteStatus, { badge: string; tile: string }> = {
  matched:                 { badge: "bg-success/10 text-success", tile: "border-success/30" },
  dispatched_not_received: { badge: "bg-warning-surface text-warning", tile: "border-warning/40" },
  not_received:            { badge: "bg-warning-surface text-warning", tile: "border-warning/40" },
  received_not_dispatched: { badge: "bg-secondary text-muted-foreground", tile: "border-border" },
  no_po:                   { badge: "bg-secondary text-muted-foreground", tile: "border-border" },
}

function AuditBadge({ status }: { status: NoteStatus }) {
  return (
    <Badge variant="secondary" className={cn("font-normal", TONE[status].badge)}>
      {L.status[status]}
    </Badge>
  )
}

export default function AuditQueue() {
  const [channel, setChannel] = useState<Channel>("asphalt")
  const [filter, setFilter] = useState<NoteStatus | null>(null)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [oldest, setOldest] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const statuses = channel === "asphalt" ? ASPHALT_STATUSES : MATERIAL_STATUSES

  const load = useCallback(async (ch: Channel, st: NoteStatus | null) => {
    setError(false); setRows(null); setCounts(null)
    try {
      const [c, r, o] = await Promise.all([auditCounts(ch), auditRows(ch, st), auditOldest(ch)])
      setCounts(c); setRows(r); setOldest(o)
    } catch { setError(true) }
  }, [])

  useEffect(() => { void load(channel, filter) }, [channel, filter, load])

  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0
  const oldestDays = ageDays(oldest)

  function pickChannel(ch: Channel) {
    if (ch === channel) return
    setChannel(ch); setFilter(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {L.audit.heading} <span className="text-muted-foreground">({total})</span>
        </h2>
        {oldestDays > 0 && (
          <span className="text-xs text-warning">{L.audit.oldestUnmatched(oldestDays)}</span>
        )}
      </div>

      {/* channel pills */}
      <div className="flex gap-1 border-b pb-2">
        {(["asphalt", "materials"] as Channel[]).map((ch) => (
          <button key={ch} type="button" onClick={() => pickChannel(ch)}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              channel === ch ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
            )}>
            {L.tabs[ch]}
          </button>
        ))}
      </div>

      {/* status tiles — counts, act as filters */}
      <div className="grid grid-cols-3 gap-2">
        {statuses.map((s) => (
          <button key={s} type="button"
            onClick={() => setFilter(filter === s ? null : s)}
            className={cn(
              "rounded-lg border bg-card p-3 text-start transition-colors",
              TONE[s].tile,
              filter === s ? "ring-2 ring-primary" : "hover:bg-secondary/40",
            )}>
            <div className="text-xs text-muted-foreground">{L.status[s]}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {counts ? counts[s] : "…"}
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{L.audit.hint}</p>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
          {L.app.loadError}
          <Button variant="outline" size="sm" className="ms-3"
            onClick={() => void load(channel, filter)}>
            {L.app.retry}
          </Button>
        </div>
      )}

      {!error && rows === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
        </div>
      )}

      {!error && rows !== null && rows.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{L.audit.empty}</div>
          <div className="mt-1">{L.audit.emptyHint}</div>
        </div>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{L.audit.colNote}</TableHead>
                {channel === "asphalt" ? (
                  <TableHead>{L.audit.colSite}</TableHead>
                ) : (
                  <>
                    <TableHead>{L.audit.colVendor}</TableHead>
                    <TableHead>{L.audit.colItem}</TableHead>
                  </>
                )}
                <TableHead className="text-end">
                  {channel === "asphalt" ? L.audit.colQtyT : L.audit.colQty}
                </TableHead>
                <TableHead>{L.audit.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${channel}-${r.id}`}>
                  <TableCell className="ref-code font-semibold">{r.noteNo}</TableCell>
                  {channel === "asphalt" ? (
                    <TableCell>{r.site || "—"}</TableCell>
                  ) : (
                    <>
                      <TableCell>{r.vendor}</TableCell>
                      <TableCell>{r.item}</TableCell>
                    </>
                  )}
                  <TableCell className="text-end tabular-nums">{r.qty ?? "—"}</TableCell>
                  <TableCell><AuditBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {counts && rows.length < (filter ? counts[filter] : total) && (
            <p className="text-xs text-muted-foreground">
              {L.audit.showing(rows.length, filter ? counts[filter] : total)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
