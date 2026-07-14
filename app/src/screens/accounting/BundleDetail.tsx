import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefCode } from "@/components/patterns"
import { qty as fmtQty } from "@/lib/format"
import type { Profile } from "@/lib/session"
import { kwd, L } from "./labels"
import { LifecycleBadge } from "./BundlesList"
import {
  bundleDetail, bundleNoteRefs, createBundle, importConfirm, poLineOptions,
  snCells, SN_COLUMNS, type BundleDetailData, type PoLineOption,
} from "./data"

/* ── Screen 5: Bundle detail — the transcription layout ───────────────
   SN's names, SN's order: built for side-by-side manual entry into
   SpectroNova with zero mental translation. Import confirmation in the
   footer; adjusting bundles start here (published bundles only). ── */

function downloadExcel(b: BundleDetailData) {
  const q = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const csv = "﻿" + [SN_COLUMNS.map(q).join(",")]
    .concat(b.rows.map((r) => snCells(r).map(q).join(",")))
    .join("\r\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  a.download = `${b.bundleNo}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ImportFooter({ user, b, onSaved }: { user: Profile; b: BundleDetailData; onSaved: () => void }) {
  const [checked, setChecked] = useState(b.imported)
  const [ref, setRef] = useState(b.snReference)
  const [busy, setBusy] = useState(false)
  if (b.status !== "published") {
    return <p className="text-xs text-muted-foreground">{L.detail.previewNote}</p>
  }
  async function save() {
    if (!ref.trim()) { toast.error(L.detail.importNeedRef); return }
    setBusy(true)
    try { await importConfirm(user.pin ?? "", b.id, ref.trim()); onSaved() }
    catch (e: any) {
      toast.error(`${L.detail.importFailed}${e?.message ? ` — ${e.message}` : ""}`)
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={checked} disabled={b.imported}
          onCheckedChange={(v) => setChecked(!!v)} />
        {L.detail.importedTitle}
      </label>
      <div className="flex flex-1 items-center gap-2">
        <span className="text-xs text-muted-foreground">{L.detail.importedRef}</span>
        {b.imported ? (
          <RefCode>{b.snReference}</RefCode>
        ) : (
          <>
            <Input className="max-w-xs" placeholder={L.detail.importPlaceholder}
              value={ref} disabled={!checked} onChange={(e) => setRef(e.target.value)} />
            <Button size="sm" disabled={!checked || busy} onClick={() => void save()}>
              {busy ? L.detail.importSaving : L.detail.importSave}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function AdjustEditor({ user, b, onDone }: { user: Profile; b: BundleDetailData; onDone: () => void }) {
  const [notes, setNotes] = useState<{ ref: number; noteNo: string; qty: number; diff: string }[] | null>(null)
  const [lines, setLines] = useState<PoLineOption[] | null>(null)
  const [lineId, setLineId] = useState(String(b.commitmentLineId))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [refs, opts] = await Promise.all([bundleNoteRefs(b.id), poLineOptions(b.source)])
        setNotes(refs.map((r) => ({ ...r, diff: "" })))
        setLines(opts)
      } catch { toast.error(L.app.loadError) }
    })()
  }, [b.id, b.source])

  async function create() {
    const diffs = (notes ?? [])
      .filter((n) => n.diff && Number(n.diff) !== 0)
      .map((n) => ({ ref: n.ref, qty: Number(n.diff) }))
    if (!diffs.length) { toast.error(L.detail.adjustNeedDiff); return }
    if (!lineId) { toast.error(L.detail.adjustNeedLine); return }
    setBusy(true)
    try {
      const r = await createBundle(user.pin ?? "", Number(lineId), b.source, diffs, b.id)
      toast.success(L.bundling.created(r.bundleNo))
      onDone()
    } catch (e: any) {
      toast.error(`${L.detail.adjustFailed}${e?.message ? ` — ${e.message}` : ""}`)
      setBusy(false)
    }
  }

  if (notes === null || lines === null) return <Skeleton className="h-24 w-full rounded-lg" />
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-card p-3">
      <p className="text-xs text-muted-foreground">{L.detail.adjustHint}</p>
      {notes.map((n, i) => (
        <div key={n.ref} className="flex items-center gap-3">
          <RefCode className="flex-1">{n.noteNo}</RefCode>
          <span className="text-xs text-muted-foreground tabular-nums">({fmtQty(n.qty)})</span>
          <Input className="max-w-28" type="number" step="0.01" placeholder="0"
            value={n.diff}
            onChange={(e) => setNotes((ns) => ns!.map((x, j) => (j === i ? { ...x, diff: e.target.value } : x)))} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{L.detail.adjustLine}</span>
        <Select value={lineId} onValueChange={setLineId}>
          <SelectTrigger className="flex-1"><SelectValue placeholder={L.bundling.linePlaceholder} /></SelectTrigger>
          <SelectContent>
            {lines.map((l) => (
              <SelectItem key={l.lineId} value={String(l.lineId)}>
                {L.bundling.lineOption(l.po, l.lineNo, l.item,
                  l.remaining != null ? fmtQty(l.remaining) : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" disabled={busy} onClick={() => void create()}>
        {busy ? L.detail.adjustCreating : L.detail.adjustCreate}
      </Button>
    </div>
  )
}

export default function BundleDetail() {
  const user = useOutletContext<Profile>()
  const nav = useNavigate()
  const { id } = useParams()
  const [b, setB] = useState<BundleDetailData | null | undefined>(undefined)
  const [error, setError] = useState(false)
  const [adjusting, setAdjusting] = useState(false)

  const load = useCallback(async () => {
    setError(false); setB(undefined)
    try { setB(await bundleDetail(Number(id))) } catch { setError(true) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => {
    const rows = b?.rows ?? []
    return {
      notes: rows.length,
      qty: rows.reduce((s, r) => s + Number(r.qty || 0), 0),
      amount: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
    }
  }, [b])

  if (error) return (
    <div className="rounded-lg border border-danger/40 bg-danger-surface p-4 text-sm">
      {L.app.loadError}
      <Button variant="outline" size="sm" className="ms-3" onClick={() => void load()}>{L.app.retry}</Button>
    </div>
  )
  if (b === undefined) return <Skeleton className="h-64 w-full rounded-lg" />
  if (b === null) return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {L.detail.notFound}
      <div className="mt-2"><Link className="underline" to="/accounting/bundles">{L.detail.back}</Link></div>
    </div>
  )

  const f = b.rows[0]
  const dates = b.rows.map((r) => r.delivery_date).filter(Boolean).sort()
  const dateSpan = dates.length === 0 ? "—"
    : dates[0] === dates[dates.length - 1] ? dates[0]!
    : `${dates[0]} → ${dates[dates.length - 1]}`

  const fields: [string, React.ReactNode][] = [
    [L.detail.fieldSupplier, f?.supplier ?? "—"],
    [L.detail.fieldPo, <RefCode key="po">{f?.po_number ?? "—"}</RefCode>],
    [L.detail.fieldPoLine, f ? `${f.po_line} — ${f.description}` : "—"],
    [L.detail.fieldDate, <span key="d" className="tabular-nums">{dateSpan}</span>],
  ]

  return (
    <div className="flex flex-col gap-3" dir="ltr">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold"><RefCode>{b.bundleNo}</RefCode></h2>
        <LifecycleBadge status={b.status} />
        {b.adjusts != null && (
          <Link to={`/accounting/bundles/${b.adjusts}`} className="text-xs text-muted-foreground underline">
            {L.detail.adjustsRef(`#${b.adjusts}`)}
          </Link>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled title={L.detail.grnSoon}>{L.detail.grn}</Button>
        <Button variant="outline" size="sm" onClick={() => downloadExcel(b)}>{L.detail.excel}</Button>
      </div>

      {/* field grid — SN's names, SN's order */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{L.detail.colDn}</TableHead>
            <TableHead>{L.detail.colItemCode}</TableHead>
            <TableHead className="text-end">{L.detail.colQty}</TableHead>
            <TableHead>{L.detail.colUom}</TableHead>
            <TableHead className="text-end">{L.detail.colUnitPrice}</TableHead>
            <TableHead className="text-end">{L.detail.colAmount}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {b.rows.map((r) => (
            <TableRow key={r.line_id}>
              <TableCell className="ref-code font-semibold">{r.supplier_dn}</TableCell>
              <TableCell className="ref-code">{r.item_code || "—"}</TableCell>
              <TableCell className="text-end tabular-nums">{fmtQty(r.qty)}</TableCell>
              <TableCell>{r.uom}</TableCell>
              <TableCell className="text-end tabular-nums">{r.unit_price == null ? "—" : Number(r.unit_price).toFixed(3)}</TableCell>
              <TableCell className="text-end tabular-nums">{Number(r.amount).toFixed(3)}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={4} className="font-semibold">
              {L.detail.totals(totals.notes, fmtQty(totals.qty))}
            </TableCell>
            <TableCell />
            <TableCell className="text-end font-semibold tabular-nums">{kwd(totals.amount)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <ImportFooter user={user} b={b} onSaved={() => void load()} />

      {b.status === "published" && (
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" className="self-start"
            onClick={() => setAdjusting((a) => !a)}>
            {L.detail.adjustOpen}
          </Button>
          {adjusting && <AdjustEditor user={user} b={b} onDone={() => nav("/accounting/bundles")} />}
        </div>
      )}
    </div>
  )
}
