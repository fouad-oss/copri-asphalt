import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qty as fmtQty } from "@/lib/format"
import type { Profile } from "@/lib/session"
import { L } from "./labels"
import {
  createBundle, lastUsedLines, poLineOptions, readyNotes,
  type Channel, type PoLineOption, type ReadyNote,
} from "./data"
import { ChannelTabs, EmptyCard, LoadError, Loading, seq } from "./ui"

/* ── Screen 3: Bundling ───────────────────────────────────────────────
   Matched notes with checkboxes, live selected-count and qty total, PO
   line selector pre-set to the last-used line for this item on this PO
   (accountant confirms), create-bundle. One bundle = one PO line. ── */

export default function Bundling() {
  const user = useOutletContext<Profile>()
  const nav = useNavigate()
  const [channel, setChannel] = useState<Channel>("asphalt")
  const [notes, setNotes] = useState<ReadyNote[] | null>(null)
  const [lines, setLines] = useState<PoLineOption[] | null>(null)
  const [lastUsed, setLastUsed] = useState<{ itemId: number; lineId: number }[]>([])
  const [error, setError] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [lineId, setLineId] = useState<string>("")
  const [suggested, setSuggested] = useState(false)
  const [busy, setBusy] = useState(false)

  const seqRef = useRef(0)
  const load = useCallback(async (ch: Channel) => {
    const live = seq(seqRef)
    setError(false); setNotes(null); setLines(null)
    setPicked(new Set()); setLineId(""); setSuggested(false)
    try {
      const [n, l, lu] = await Promise.all([readyNotes(ch), poLineOptions(ch), lastUsedLines()])
      if (!live()) return
      setNotes(n); setLines(l); setLastUsed(lu)
    } catch { if (live()) setError(true) }
  }, [])
  useEffect(() => { void load(channel) }, [channel, load])

  const totalQty = useMemo(
    () => (notes ?? []).filter((n) => picked.has(n.ref)).reduce((s, n) => s + n.qty, 0),
    [notes, picked],
  )

  // Selection changes re-evaluate the last-used-line suggestion. A line
  // the accountant chose by hand is never touched; a SUGGESTED line is
  // re-derived (or cleared) so it always matches the picked item.
  function applySelection(next: Set<number>) {
    setPicked(next)
    if (!lines || !notes) return
    const sel = notes.filter((n) => next.has(n.ref))
    const items = [...new Set(sel.map((n) => n.itemId).filter((x): x is number => x != null))]
    const hit = sel.length && items.length === 1
      ? lastUsed.find((u) => u.itemId === items[0] && lines.some((l) => l.lineId === u.lineId))
      : undefined
    if (suggested || !lineId) {
      if (hit) { setLineId(String(hit.lineId)); setSuggested(true) }
      else if (suggested) { setLineId(""); setSuggested(false) }
    }
  }
  function toggle(ref: number, on: boolean) {
    const next = new Set(picked)
    if (on) next.add(ref); else next.delete(ref)
    applySelection(next)
  }

  async function create() {
    if (!picked.size) { toast.error(L.bundling.needSelection); return }
    if (!lineId) { toast.error(L.bundling.needLine); return }
    setBusy(true)
    try {
      const r = await createBundle(user.pin ?? "", Number(lineId), channel, [...picked].map((ref) => ({ ref })))
      toast.success(L.bundling.created(r.bundleNo))
      nav("/accounting/bundles")
    } catch (e: any) {
      toast.error(`${L.bundling.createFailed}${e?.message ? ` — ${e.message}` : ""}`)
      setBusy(false)
    }
  }

  const allPicked = !!notes?.length && picked.size === notes.length

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{L.bundling.heading}</h2>
      <ChannelTabs channel={channel} onChange={setChannel} />
      <p className="text-xs text-muted-foreground">{L.bundling.hint}</p>

      {error && <LoadError onRetry={() => void load(channel)} />}
      {!error && (notes === null || lines === null) && <Loading />}

      {!error && notes !== null && lines !== null && (notes.length === 0 ? (
        <EmptyCard title={L.bundling.empty} hint={L.bundling.emptyHint} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allPicked}
                    onCheckedChange={(v) => applySelection(v ? new Set(notes.map((n) => n.ref)) : new Set())} />
                </TableHead>
                <TableHead>{L.bundling.colNote}</TableHead>
                <TableHead>{L.bundling.colDate}</TableHead>
                <TableHead>{L.bundling.colSite}</TableHead>
                <TableHead>{L.bundling.colItem}</TableHead>
                <TableHead className="text-end">{L.bundling.colQty}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((n) => (
                <TableRow key={n.ref} className="cursor-pointer"
                  onClick={() => toggle(n.ref, !picked.has(n.ref))}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={picked.has(n.ref)}
                      onCheckedChange={(v) => toggle(n.ref, !!v)} />
                  </TableCell>
                  <TableCell className="ref-code font-semibold">{n.noteNo}</TableCell>
                  <TableCell className="tabular-nums">{n.date ?? "—"}</TableCell>
                  <TableCell>{n.site || "—"}</TableCell>
                  <TableCell>{n.item}</TableCell>
                  <TableCell className="text-end tabular-nums">{fmtQty(n.qty)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="sticky bottom-0 flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-sm font-medium tabular-nums">
              {L.bundling.selected(picked.size, fmtQty(totalQty))}
            </div>
            {lines.length === 0 ? (
              <p className="text-xs text-warning">{L.bundling.noLines}</p>
            ) : (
              <>
                <Select value={lineId}
                  onValueChange={(v) => { setLineId(v); setSuggested(false) }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={L.bundling.linePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {lines.map((l) => (
                      <SelectItem key={l.lineId} value={String(l.lineId)}>
                        {L.bundling.lineOption(l.po, l.lineNo, l.item,
                          l.remaining != null ? fmtQty(l.remaining) : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suggested && <p className="text-xs text-muted-foreground">{L.bundling.suggested}</p>}
              </>
            )}
            <Button onClick={() => void create()} disabled={busy || !picked.size || !lineId}>
              {busy ? L.bundling.creating : L.bundling.create}
            </Button>
          </div>
        </>
      ))}
    </div>
  )
}
