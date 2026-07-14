import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qty as fmtQty } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/session"
import { L } from "./labels"
import {
  createBundle, lastUsedLines, poLineOptions, readyNotes,
  type Channel, type PoLineOption, type ReadyNote,
} from "./data"

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

  const load = useCallback(async (ch: Channel) => {
    setError(false); setNotes(null); setLines(null)
    setPicked(new Set()); setLineId(""); setSuggested(false)
    try {
      const [n, l, lu] = await Promise.all([readyNotes(ch), poLineOptions(ch), lastUsedLines()])
      setNotes(n); setLines(l); setLastUsed(lu)
    } catch { setError(true) }
  }, [])
  useEffect(() => { void load(channel) }, [channel, load])

  const totalQty = useMemo(
    () => (notes ?? []).filter((n) => picked.has(n.ref)).reduce((s, n) => s + n.qty, 0),
    [notes, picked],
  )

  function toggle(ref: number, on: boolean) {
    setPicked((p) => {
      const next = new Set(p)
      if (on) next.add(ref); else next.delete(ref)
      // suggestion: every picked note shares one item → pre-set the most
      // recently used line for that item that this channel offers
      if (!lineId && lines && notes) {
        const sel = (notes ?? []).filter((n) => next.has(n.ref))
        const items = [...new Set(sel.map((n) => n.itemId).filter((x): x is number => x != null))]
        if (sel.length && items.length === 1) {
          const hit = lastUsed.find((u) => u.itemId === items[0] && lines.some((l) => l.lineId === u.lineId))
          if (hit) { setLineId(String(hit.lineId)); setSuggested(true) }
        }
      }
      return next
    })
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
      <p className="text-xs text-muted-foreground">{L.bundling.hint}</p>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
          {L.app.loadError}
          <Button variant="outline" size="sm" className="ms-3" onClick={() => void load(channel)}>
            {L.app.retry}
          </Button>
        </div>
      )}
      {!error && (notes === null || lines === null) && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
        </div>
      )}

      {!error && notes !== null && lines !== null && (notes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{L.bundling.empty}</div>
          <div className="mt-1">{L.bundling.emptyHint}</div>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allPicked}
                    onCheckedChange={(v) => setPicked(v ? new Set(notes.map((n) => n.ref)) : new Set())} />
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
