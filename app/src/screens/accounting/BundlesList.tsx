import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { qty } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/session"
import { kwd, L } from "./labels"
import { bundlesList, deleteBundle, setBundleStatus, type BundleRow, type Channel } from "./data"
import { ChannelTabs, EmptyCard, LoadError, Loading, seq } from "./ui"

/* ── Screen 4: Bundles list ───────────────────────────────────────────
   Bundle | PO / line | Qty · amount | Status | SN reference. Lifecycle
   badges: Draft (neutral) / Verified (accent) / Published (success);
   published without an SN reference shows "pending import". ── */

// Brief: Draft (neutral) / Verified (ACCENT — the brand primary, not
// info blue) / Published (success).
const LIFECYCLE_TONE: Record<BundleRow["status"], string> = {
  draft: "bg-secondary text-muted-foreground",
  verified: "bg-primary/10 text-primary",
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

  const seqRef = useRef(0)
  const load = useCallback(async (ch: Channel, silent = false) => {
    const live = seq(seqRef)
    setError(false)
    if (!silent) setRows(null)
    try {
      const r = await bundlesList(ch)
      if (live()) setRows(r)
    } catch { if (live()) setError(true) }
  }, [])
  useEffect(() => { void load(channel) }, [channel, load])

  async function act(b: BundleRow, fn: () => Promise<unknown>) {
    setBusyId(b.id)
    // silent reload: keep the table on screen instead of collapsing to
    // skeletons for a one-row status change
    try { await fn(); await load(channel, true) }
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
            if (confirm(L.bundles.confirmPublish(b.bundleNo, kwd(b.amount))))
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
      <ChannelTabs channel={channel} onChange={setChannel} />

      {error && <LoadError onRetry={() => void load(channel)} />}
      {!error && rows === null && <Loading rows={4} />}
      {!error && rows !== null && rows.length === 0 && (
        <EmptyCard title={L.bundles.empty} hint={L.bundles.emptyHint} />
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
                  <Link to={`/accounting/bundles/${b.id}`} className="underline-offset-2 hover:underline">
                    {b.bundleNo}
                  </Link>
                  {b.adjusts != null && (
                    <span className="ms-2 text-xs font-normal text-muted-foreground">({L.bundles.adjusting})</span>
                  )}
                </TableCell>
                <TableCell>
                  {b.commitmentId != null ? (
                    <Link to={`/accounting/po-register?po=${b.commitmentId}`}
                      className="underline-offset-2 hover:underline">
                      <RefCode>{b.po}</RefCode>
                    </Link>
                  ) : <RefCode>{b.po}</RefCode>}
                  {b.lineNo != null && <span className="ms-1 text-xs text-muted-foreground">/ {b.lineNo}</span>}
                  {b.lineItem && <span className="ms-2 text-xs text-muted-foreground">{b.lineItem}</span>}
                </TableCell>
                <TableCell className="text-end tabular-nums">{qty(b.qty)} · {kwd(b.amount)}</TableCell>
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
      {!error && rows !== null && rows.length >= 200 && (
        <p className="text-xs text-muted-foreground">{L.bundles.showingCap(rows.length)}</p>
      )}
    </div>
  )
}
