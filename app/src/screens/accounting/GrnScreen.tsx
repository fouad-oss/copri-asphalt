import { useEffect, useMemo, useRef, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qty as fmtQty } from "@/lib/format"
import type { Profile } from "@/lib/session"
import { L } from "./labels"
import {
  bundleDetail, bundlesList, grnDocNo, grnNoteDetails, grnNotes,
  type BundleRow, type Channel, type GrnNote,
} from "./data"
import { bundleSheet, noteSheet, openPrint } from "./grnPrint"
import { ChannelTabs, LoadError, Loading, seq } from "./ui"

/* ── Screen 6: GRN generator ──────────────────────────────────────────
   Printable per note or per bundle (filters: day / site / PO), with
   registered GRN-C-#### numbers — a reprint is the same document.
   GRNs are minted for PUBLISHED bundles only: a registered number on a
   deletable draft would orphan the registry (grn_docs FK). ── */

export async function printBundleGrn(pin: string, bundleId: number) {
  const [no, b] = await Promise.all([grnDocNo(pin, { bundleId }), bundleDetail(bundleId)])
  if (!b) throw new Error("not found")
  if (!openPrint(no, "size: A4 portrait; margin: 12mm", bundleSheet(no, b)))
    toast.error(L.grn.popupBlocked)
}

const CAP = 200

export default function GrnScreen() {
  const user = useOutletContext<Profile>()
  const [channel, setChannel] = useState<Channel>("asphalt")
  const [notes, setNotes] = useState<GrnNote[] | null>(null)
  const [bundles, setBundles] = useState<BundleRow[] | null>(null)
  const [error, setError] = useState(false)
  const [bundleId, setBundleId] = useState("")
  const [day, setDay] = useState("")
  const [site, setSite] = useState("all")
  const [po, setPo] = useState("all")
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  // Channel change resets everything and refetches the bundle picker;
  // the DAY filter refetches notes SERVER-side (the newest-300 window
  // would otherwise hide older days entirely).
  const bSeq = useRef(0)
  useEffect(() => {
    setDay(""); setSite("all"); setPo("all"); setPicked(new Set()); setBundleId("")
    setError(false); setBundles(null)
    const live = seq(bSeq)
    bundlesList(channel)
      .then((b) => { if (live()) setBundles(b.filter((x) => x.status === "published")) })
      .catch(() => { if (live()) setError(true) })
  }, [channel, reload])

  const nSeq = useRef(0)
  useEffect(() => {
    setNotes(null); setPicked(new Set())
    const live = seq(nSeq)
    grnNotes(channel, day || undefined)
      .then((n) => { if (live()) setNotes(n) })
      .catch(() => { if (live()) setError(true) })
  }, [channel, day, reload])

  const sites = useMemo(() => [...new Set((notes ?? []).map((n) => n.site).filter(Boolean))].sort(), [notes])
  const pos = useMemo(() => [...new Set((notes ?? []).map((n) => n.po).filter(Boolean))].sort(), [notes])
  const filtered = useMemo(() => (notes ?? []).filter((n) =>
    (site === "all" || n.site === site) &&
    (po === "all" || n.po === po)), [notes, site, po])
  const shown = filtered.slice(0, CAP)

  useEffect(() => { setPicked(new Set()) }, [site, po])

  async function printNotes() {
    const refs = [...picked]
    setBusy(true)
    try {
      const details = await grnNoteDetails(channel, refs)
      const numbers = await Promise.all(refs.map((ref) => grnDocNo(user.pin ?? "",
        channel === "asphalt" ? { dispatchId: ref } : { materialReceiptId: ref })))
      const byRef: Record<number, string> = {}
      refs.forEach((ref, i) => { byRef[ref] = numbers[i] })
      const html = details.map((d) => noteSheet(byRef[d.ref], d)).join("")
      if (!openPrint("GRN", "size: A5 landscape; margin: 8mm", html)) toast.error(L.grn.popupBlocked)
    } catch (e: any) {
      toast.error(`${L.grn.mintFailed}${e?.message ? ` — ${e.message}` : ""}`)
    }
    setBusy(false)
  }

  async function printBundle() {
    setBusy(true)
    try { await printBundleGrn(user.pin ?? "", Number(bundleId)) }
    catch (e: any) { toast.error(`${L.grn.mintFailed}${e?.message ? ` — ${e.message}` : ""}`) }
    setBusy(false)
  }

  const allPicked = shown.length > 0 && shown.every((n) => picked.has(n.ref))

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{L.grn.heading}</h2>
      <ChannelTabs channel={channel} onChange={setChannel} />

      {error && <LoadError onRetry={() => setReload((n) => n + 1)} />}
      {!error && (notes === null || bundles === null) && <Loading />}

      {!error && notes !== null && bundles !== null && (
        <>
          {/* per bundle — published only */}
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-1 text-sm font-semibold">{L.grn.perBundle}</div>
            <p className="mb-2 text-xs text-muted-foreground">{L.grn.publishedOnly}</p>
            {bundles.length === 0 ? (
              <p className="text-xs text-muted-foreground">{L.grn.noBundles}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Select value={bundleId} onValueChange={setBundleId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={L.grn.bundlePick} /></SelectTrigger>
                  <SelectContent>
                    {bundles.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.bundleNo} · {b.po}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={!bundleId || busy} onClick={() => void printBundle()}>
                  {busy ? L.grn.printing : L.grn.print}
                </Button>
              </div>
            )}
          </div>

          {/* per note — filters: day / site / PO */}
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 text-sm font-semibold">{L.grn.perNote}</div>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <Input type="date" aria-label={L.grn.day} value={day} onChange={(e) => setDay(e.target.value)} />
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L.grn.allSites}</SelectItem>
                  {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={po} onValueChange={setPo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L.grn.allPos}</SelectItem>
                  {pos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {shown.length === 0 ? (
              <p className="text-xs text-muted-foreground">{L.grn.noNotes}</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={allPicked}
                          onCheckedChange={(v) => setPicked(v ? new Set(shown.map((n) => n.ref)) : new Set())} />
                      </TableHead>
                      <TableHead>{L.bundling.colNote}</TableHead>
                      <TableHead>{L.bundling.colDate}</TableHead>
                      <TableHead>{L.bundling.colSite}</TableHead>
                      <TableHead>{L.bundling.colItem}</TableHead>
                      <TableHead className="text-end">{L.bundling.colQty}</TableHead>
                      <TableHead>{L.grn.po}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((n) => (
                      <TableRow key={n.ref} className="cursor-pointer"
                        onClick={() => setPicked((p) => {
                          const next = new Set(p)
                          if (next.has(n.ref)) next.delete(n.ref); else next.add(n.ref)
                          return next
                        })}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={picked.has(n.ref)}
                            onCheckedChange={(v) => setPicked((p) => {
                              const next = new Set(p)
                              if (v) next.add(n.ref); else next.delete(n.ref)
                              return next
                            })} />
                        </TableCell>
                        <TableCell className="ref-code font-semibold">{n.noteNo}</TableCell>
                        <TableCell className="tabular-nums">{n.date || "—"}</TableCell>
                        <TableCell>{n.site || "—"}</TableCell>
                        <TableCell>{n.item}</TableCell>
                        <TableCell className="text-end tabular-nums">{n.qty == null ? "—" : fmtQty(n.qty)}</TableCell>
                        <TableCell className="ref-code text-xs">{n.po || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filtered.length > CAP && (
                  <p className="mt-1 text-xs text-muted-foreground">{L.grn.showingCap(CAP)}</p>
                )}
                <Button className="mt-2" disabled={!picked.size || busy} onClick={() => void printNotes()}>
                  {busy ? L.grn.printing : L.grn.printCount(picked.size)}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
