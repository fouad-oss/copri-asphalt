import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useOutletContext, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bar, RefCode } from "@/components/patterns"
import { qty } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Profile } from "@/lib/session"
import { kwd, L } from "./labels"
import { addPoLines, poLines, poList, type Po, type PoLine } from "./data"
import { EmptyCard, LoadError, Loading, seq } from "./ui"

/* ── Screen 2: PO register / line balances ────────────────────────────
   PO selector → per-LINE cards (line no. + description + laying method
   from remarks, item code + unit price mono, received/ordered progress
   bar, remaining qty, warning when nearing limit). NEVER aggregate
   lines of the same item code — the PO LINE is the matching unit. ── */

function LineCard({ l }: { l: PoLine }) {
  const bundled = l.published_qty + l.pending_qty
  const ordered = l.order_qty
  const p = ordered ? (bundled / ordered) * 100 : 0
  const over = l.remaining_qty != null && Number(l.remaining_qty) < 0
  const near = !over && p >= 70
  return (
    <div className={cn(
      "rounded-lg border bg-card p-3",
      over && "border-danger/40",
      near && "border-warning/40",
    )}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-xs text-muted-foreground">{L.register.line(l.line_no)}</span>{" "}
          <span className="text-sm font-semibold">{l.item}</span>
          {l.remarks && <span className="ms-2 text-xs text-muted-foreground">{l.remarks}</span>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {l.item_code && <RefCode>{l.item_code}</RefCode>}
          {l.rate != null && <RefCode>{kwd(l.rate)}{l.unit ? ` / ${l.unit}` : ""}</RefCode>}
        </div>
      </div>
      {ordered == null ? (
        <div className="mt-2 text-xs text-muted-foreground">{L.register.lumpSum}</div>
      ) : (
        <>
          <div className="mt-2"><Bar value={bundled} max={ordered} danger={over} /></div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
            <span>{L.register.ordered} <b>{qty(ordered)} {l.unit}</b></span>
            <span>
              {L.register.bundled} <b>{qty(bundled)}</b>
              {l.pending_qty > 0 && (
                <span className="text-muted-foreground"> ({L.register.pendingShort(qty(l.pending_qty))})</span>
              )}
            </span>
            {over ? (
              <span className="font-semibold text-danger">{L.register.over} {qty(Math.abs(Number(l.remaining_qty)))}</span>
            ) : Number(l.remaining_qty) === 0 ? (
              <span className="font-semibold text-success">{L.register.complete}</span>
            ) : (
              <span className={cn(near && "font-semibold text-warning")}>
                {L.register.remaining} <b>{qty(l.remaining_qty)}</b>{near && ` — ${L.register.nearLimit}`}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function LinesEditor({ user, poId, onSaved }: { user: Profile; poId: number; onSaved: () => void }) {
  type Row = { item: string; qty: string; unit: string; rate: string; remarks: string }
  const blank: Row = { item: "", qty: "", unit: "", rate: "", remarks: "" }
  const [rows, setRows] = useState<Row[]>([{ ...blank }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  function set(i: number, k: keyof Row, v: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  }

  async function save() {
    setErr("")
    const filled = rows.filter((r) => r.item.trim() || r.qty || r.rate || r.remarks.trim())
    if (!filled.length || filled.some((r) => !r.item.trim())) { setErr(L.register.itemRequired); return }
    setBusy(true)
    try {
      // trim-based emptiness checks: an entered "0" is a real value
      // (zero-rate free-issue lines), never a null/lump-sum
      await addPoLines(user.pin ?? "", poId, filled.map((r) => ({
        item: r.item.trim(),
        qty: r.qty.trim() !== "" ? Number(r.qty) : null,
        unit: r.unit.trim(),
        rate: r.rate.trim() !== "" ? Number(r.rate) : null,
        remarks: r.remarks.trim(),
      })))
      onSaved()
    } catch { setErr(L.register.saveFailed); setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-dashed bg-card p-3">
      <div className="mb-2 text-xs text-muted-foreground">{L.register.addLinesHint}</div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-2 text-xs text-muted-foreground">
          <span>{L.register.colItem}</span><span>{L.register.colQty}</span>
          <span>{L.register.colUnit}</span><span>{L.register.colRate}</span>
          <span>{L.register.colRemarks}</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-2">
            <Input value={r.item} onChange={(e) => set(i, "item", e.target.value)} />
            <Input type="number" step="0.01" value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} />
            <Input value={r.unit} onChange={(e) => set(i, "unit", e.target.value)} />
            <Input type="number" step="0.001" value={r.rate} onChange={(e) => set(i, "rate", e.target.value)} />
            <Input value={r.remarks} onChange={(e) => set(i, "remarks", e.target.value)} />
          </div>
        ))}
      </div>
      {err && <div className="mt-2 text-xs text-danger">{err}</div>}
      <div className="mt-2 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { ...blank }])}>
          {L.register.addRow}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? L.register.saving : L.register.save}
        </Button>
      </div>
    </div>
  )
}

export default function PoRegister() {
  const user = useOutletContext<Profile>()
  const [params] = useSearchParams()
  const [pos, setPos] = useState<Po[] | null>(null)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Po | null>(null)
  const [lines, setLines] = useState<PoLine[] | null>(null)
  const [linesError, setLinesError] = useState(false)
  const [editing, setEditing] = useState(false)

  const loadPos = useCallback(async () => {
    setError(false); setPos(null)
    try { setPos(await poList()) } catch { setError(true) }
  }, [])
  useEffect(() => { void loadPos() }, [loadPos])

  const lSeq = useRef(0)
  const loadLines = useCallback(async (po: Po) => {
    const live = seq(lSeq)
    setLinesError(false); setLines(null); setEditing(false)
    try {
      const l = await poLines(po.id)
      if (live()) setLines(l)
    } catch { if (live()) setLinesError(true) }
  }, [])

  // deep link: /accounting/po-register?po=<commitment id> (reference
  // codes elsewhere link here — skill: every code links to its detail)
  useEffect(() => {
    const id = Number(params.get("po"))
    if (pos && id && selected?.id !== id) {
      const hit = pos.find((p) => p.id === id)
      if (hit) { setSelected(hit); void loadLines(hit) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, params])

  const shown = useMemo(() => {
    if (!pos) return []
    const q = search.trim().toLowerCase()
    if (!q) return pos
    return pos.filter((p) =>
      p.number.toLowerCase().includes(q) || p.sn_po.toLowerCase().includes(q) ||
      p.vendor.toLowerCase().includes(q))
  }, [pos, search])
  const CAP = 30

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{L.register.heading}</h2>

      {error && <LoadError onRetry={() => void loadPos()} />}
      {!error && pos === null && <Loading />}

      {!error && pos !== null && (
        <>
          <Input placeholder={L.register.search} value={search}
            onChange={(e) => { setSearch(e.target.value) }} />
          {pos.length === 0 ? (
            <EmptyCard title={L.register.noPos} hint={L.register.noPosHint} />
          ) : (
            <div className="flex flex-col gap-1">
              {shown.slice(0, CAP).map((p) => (
                <button key={p.id} type="button"
                  onClick={() => { setSelected(p); void loadLines(p) }}
                  className={cn(
                    "flex items-baseline justify-between gap-2 rounded-md border bg-card px-3 py-2 text-start text-sm",
                    selected?.id === p.id ? "ring-2 ring-primary" : "hover:bg-secondary/40",
                  )}>
                  <span><RefCode>{p.sn_po || p.number}</RefCode>
                    {p.sn_po && p.sn_po !== p.number && (
                      <span className="ms-2 text-xs text-muted-foreground">{p.number}</span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{p.vendor}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {p.po_date ?? L.register.noDate}
                  </span>
                </button>
              ))}
              {shown.length > CAP && (
                <p className="text-xs text-muted-foreground">{L.register.showingPos(CAP, shown.length)}</p>
              )}
            </div>
          )}

          {!selected && pos.length > 0 && (
            <p className="text-xs text-muted-foreground">{L.register.pickPo}</p>
          )}

          {selected && (
            <div className="mt-2 flex flex-col gap-2 border-t pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  <RefCode>{selected.sn_po || selected.number}</RefCode>
                  <span className="ms-2 text-xs font-normal text-muted-foreground">{selected.vendor}</span>
                </h3>
                <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>
                  {L.register.addLines}
                </Button>
              </div>
              {linesError && <LoadError onRetry={() => void loadLines(selected)} />}
              {!linesError && lines === null && <Loading rows={2} className="h-16" />}
              {!linesError && lines !== null && lines.length === 0 && !editing && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {L.register.noLines}
                </div>
              )}
              {!linesError && lines !== null && lines.map((l) => <LineCard key={l.line_id} l={l} />)}
              {editing && (
                <LinesEditor user={user} poId={selected.id}
                  onSaved={() => void loadLines(selected)} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
