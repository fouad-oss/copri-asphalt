import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { kd, qty } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/session"
import { L } from "./labels"
import { bundlesList, deleteBundle, setBundleStatus, type BundleRow, type Channel } from "./data"

/* ── Screen 4: Bundles list ───────────────────────────────────────────
   Bundle | PO / line | Qty · amount | Status | SN reference. Lifecycle
   badges: Draft (neutral) / Verified (accent) / Published (success);
   published without an SN reference shows "pending import". ── */

const LIFECYCLE_TONE: Record<BundleRow["status"], string> = {
  draft: "bg-secondary text-muted-foreground",
  verified: "bg-info/10 text-info",
  published: "bg-success/10 text-success",
}

export function LifecycleBadge({ status }: { status: BundleRow["status"] }) {
  return (
    <Badge variant="secondary" className={cn("font-normal", LIFECYCLE_TONE[status])}>
      {L.bundles.lifecycle[status]}
    </Badge>
  )
}

export default function BundlesList() {
  const user = useOutletContext<Profile>()
  const [channel, setChannel] = useState<Channel>("asphalt")
  const [rows, setRows] = useState<BundleRow[] | null>(null)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async (ch: Channel) => {
    setError(false); setRows(null)
    try { setRows(await bundlesList(ch)) } catch { setError(true) }
  }, [])
  useEffect(() => { void load(channel) }, [channel, load])

  async function act(b: BundleRow, fn: () => Promise<unknown>) {
    setBusyId(b.id)
    try { await fn(); await load(channel) }
    catch (e: any) { toast.error(`${L.bundles.actionFailed}${e?.message ? ` — ${e.message}` : ""}`) }
    setBusyId(null)
  }

  function actions(b: BundleRow) {
    const pin = user.pin ?? ""
    const busy = busyId === b.id
    if (b.status === "draft") return (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => void act(b, () => setBundleStatus(pin, b.id, "verified"))}>
          {L.bundles.verify}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy}
          onClick={() => { if (confirm(L.bundles.confirmDelete(b.bundleNo))) void act(b, () => deleteBundle(pin, b.id)) }}>
          {L.bundles.del}
        </Button>
      </div>
    )
    if (b.status === "verified") return (
      <div className="flex justify-end gap-1">
        <Button size="sm" disabled={busy}
          onClick={() => {
            if (confirm(L.bundles.confirmPublish(b.bundleNo, kd(b.amount))))
              void act(b, () => setBundleStatus(pin, b.id, "published"))
          }}>
          {L.bundles.publish}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy}
          onClick={() => void act(b, () => setBundleStatus(pin, b.id, "draft"))}>
          {L.bundles.demote}
        </Button>
      </div>
    )
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{L.bundles.heading}</h2>
      <div className="flex gap-1 border-b pb-2">
        {(["asphalt", "materials"] as Channel[]).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              channel === ch ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60",
            )}>
            {L.tabs[ch]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
          {L.app.loadError}
          <Button variant="outline" size="sm" className="ms-3" onClick={() => void load(channel)}>
            {L.app.retry}
          </Button>
        </div>
      )}
      {!error && rows === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
        </div>
      )}
      {!error && rows !== null && rows.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{L.bundles.empty}</div>
          <div className="mt-1">{L.bundles.emptyHint}</div>
        </div>
      )}
      {!error && rows !== null && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{L.bundles.colBundle}</TableHead>
              <TableHead>{L.bundles.colPoLine}</TableHead>
              <TableHead className="text-end">{L.bundles.colQtyAmount}</TableHead>
              <TableHead>{L.bundles.colStatus}</TableHead>
              <TableHead>{L.bundles.colSnRef}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="ref-code font-semibold">
                  {b.bundleNo}
                  {b.adjusts != null && (
                    <span className="ms-2 text-xs font-normal text-muted-foreground">({L.bundles.adjusting})</span>
                  )}
                </TableCell>
                <TableCell>
                  <RefCode>{b.po}</RefCode>
                  {b.lineNo != null && <span className="ms-1 text-xs text-muted-foreground">/ {b.lineNo}</span>}
                  {b.lineItem && <span className="ms-2 text-xs text-muted-foreground">{b.lineItem}</span>}
                </TableCell>
                <TableCell className="text-end tabular-nums">{qty(b.qty)} · {kd(b.amount)}</TableCell>
                <TableCell><LifecycleBadge status={b.status} /></TableCell>
                <TableCell>
                  {b.snReference
                    ? <RefCode>{b.snReference}</RefCode>
                    : b.status === "published"
                      ? <span className="text-xs text-warning">{L.bundles.pendingImport}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>{actions(b)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
