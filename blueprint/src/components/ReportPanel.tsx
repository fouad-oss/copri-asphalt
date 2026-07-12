import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import { STAGES, STAGE_INDEX, stageColor, type StageKey } from '../config/stages'
import { PAVING, tonsToM2, fracLabel } from '../config/paving'
import { sbRpc } from '../config/backend'
import { currentStage } from '../lib/derive'
import type { SegmentFeature } from '../types'

const SESSION_KEY = 'bp_reporter'

// Width-fraction choices for streets worked one lane at a time.
const WIDTH_FRACS = [1, 0.5, 1 / 3, 2 / 3]

// Segment work reports — admin-only for now (blueprint_reporters holds
// one row). The report: pick a street that received asphalt, tap the
// first and last worked segment on the strip, pick the layer, save.
// Delivered tonnage converts to meters live so the range self-checks.
export default function ReportPanel() {
  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
  const segLog = useApp((s) => s.segLog)
  const loadSegLog = useApp((s) => s.loadSegLog)
  const unit = useApp((s) => s.reportUnit)
  const anchor = useApp((s) => s.reportAnchor)
  const selection = useApp((s) => s.reportSelection)
  const setReporting = useApp((s) => s.setReporting)
  const setReportUnit = useApp((s) => s.setReportUnit)
  const tapReportSegment = useApp((s) => s.tapReportSegment)
  const selectAllReportSegments = useApp((s) => s.selectAllReportSegments)
  const clearReportSelection = useApp((s) => s.clearReportSelection)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY))
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [stage, setStage] = useState<StageKey>('type_ii')
  const [frac, setFrac] = useState(1)
  const [note, setNote] = useState('')
  const pavingRev = useApp((s) => s.pavingRev)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')
  const [showMine, setShowMine] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Report mode is live while the panel is open and authenticated —
  // the MAP itself becomes the segment selector (taps route here).
  useEffect(() => {
    setReporting(open && !!name)
  }, [open, name, setReporting])

  // Streets with dispatch activity, most recent first.
  const streets = useMemo(() => {
    if (!segments) return []
    const lastByUnit = new Map<string, string>()
    for (const r of worklog) {
      if (r.date > date) continue
      const prev = lastByUnit.get(r.segment_id)
      if (!prev || r.date > prev) lastByUnit.set(r.segment_id, r.date)
    }
    const labelByUnit = new Map<string, string>()
    for (const f of segments.features) {
      const u = f.properties.unit
      if (u && lastByUnit.has(u) && !labelByUnit.has(u)) {
        labelByUnit.set(
          u,
          `${f.properties.street || u} — ${f.properties.site}${f.properties.block ? ' ق' + f.properties.block : ''}`,
        )
      }
    }
    return [...labelByUnit.entries()]
      .map(([u, label]) => ({ unit: u, label, last: lastByUnit.get(u)! }))
      .sort((a, b) => (a.last < b.last ? 1 : -1))
  }, [segments, worklog, date])

  // The picked street's segments, strip-ordered (chain, then chainage).
  const unitSegs = useMemo(() => {
    if (!segments || !unit) return []
    return segments.features
      .filter((f) => f.properties.unit === unit)
      .sort((a, b) => (a.properties.id < b.properties.id ? -1 : 1)) as SegmentFeature[]
  }, [segments, unit])

  // Physics hint: tons delivered to this street on the picked date, for
  // the picked layer, converted to meters of street at the worked width.
  const hint = useMemo(() => {
    if (!unit) return null
    const tons = worklog
      .filter((r) => r.segment_id === unit && r.date === date && STAGE_INDEX[r.stage] === STAGE_INDEX[stage])
      .reduce((a, r) => a + (r.reported_qty || 0), 0)
    if (!tons) return null
    const m2 = tonsToM2(stage, tons) || 0
    return { tons, meters: Math.round(m2 / (PAVING.layingWidth_m * frac)) }
    // pavingRev: PAVING is a mutable singleton — re-derive on settings change
  }, [unit, worklog, date, stage, frac, pavingRev]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLen = useMemo(() => {
    if (!selection.length) return 0
    const byId = new Map(unitSegs.map((f) => [f.properties.id, f.properties.length_m]))
    return selection.reduce((a, id) => a + (byId.get(id) || 0), 0)
  }, [selection, unitSegs])

  // Saved reports grouped by report_id, newest first — the edit surface:
  // corrections are delete + re-enter, the log itself stays append-only.
  const myReports = useMemo(() => {
    const groups = new Map<
      string,
      { report_id: string; unit: string; stage: StageKey; date: string; n: number; frac: number; by: string }
    >()
    for (const r of segLog) {
      const g = groups.get(r.report_id)
      if (g) g.n++
      else
        groups.set(r.report_id, {
          report_id: r.report_id,
          unit: r.unit || r.segment_id,
          stage: r.stage,
          date: r.date,
          n: 1,
          frac: r.width_frac ?? 1,
          by: r.crew || '',
        })
    }
    const label = (u: string) => {
      const f = segments?.features.find((x) => x.properties.unit === u)
      return f ? `${f.properties.street || u} — ${f.properties.site}${f.properties.block ? ' ق' + f.properties.block : ''}` : u
    }
    return [...groups.values()]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.report_id < b.report_id ? 1 : -1))
      .map((g) => ({ ...g, label: label(g.unit) }))
  }, [segLog, segments])

  const deleteReport = async (reportId: string) => {
    setDeleting(true)
    setErr('')
    try {
      const r = await sbRpc<{ success: boolean; rows?: number; error?: string }>('blueprint_report_delete', {
        p_pin: sessionStorage.getItem('bp_pin') || pin,
        p_report_id: reportId,
      })
      if (!r.success) { setErr('تعذّر الحذف: ' + (r.error || '')); return }
      setDone(`حُذف التقرير ${reportId} (${r.rows} فاصل)`)
      await loadSegLog()
    } catch {
      setErr('تعذّر الحذف — هل طُبّق ترحيل 0012؟')
    } finally {
      setDeleting(false)
      setConfirmDel(null)
    }
  }

  const login = async () => {
    setErr('')
    try {
      const r = await sbRpc<{ success: boolean; name?: string }>('blueprint_reporter_check', { p_pin: pin })
      if (!r.success || !r.name) { setErr('رمز غير صحيح'); return }
      sessionStorage.setItem(SESSION_KEY, r.name)
      setName(r.name)
    } catch {
      setErr('تعذّر التحقق — هل طُبّق ترحيل 0009؟')
    }
  }

  const save = async () => {
    if (!unit || !selection.length) return
    setSaving(true)
    setErr('')
    try {
      const ids = selection
      const r = await sbRpc<{ success: boolean; report_id?: string; rows?: number; error?: string }>(
        'blueprint_report_submit',
        {
          p_pin: sessionStorage.getItem('bp_pin') || pin,
          p_stage: stage,
          p_date: date,
          p_unit: unit,
          p_segment_ids: ids,
          p_note: note.trim(),
          // PostgREST matches named args exactly — omitting the fraction at
          // full width keeps saves working until migration 0011 is applied
          ...(frac !== 1 ? { p_width_frac: frac } : {}),
        },
      )
      if (!r.success) { setErr('تعذّر الحفظ: ' + (r.error || '')); return }
      setDone(`تم الحفظ — ${r.rows} فاصل (${r.report_id})`)
      clearReportSelection()
      setNote('')
      await loadSegLog()
    } catch {
      setErr('تعذّر الحفظ — تحقق من الاتصال (ترحيل 0009؟)')
    } finally {
      setSaving(false)
    }
  }

  // strip rendering constants
  const stripStage = (segId: string) => currentStage(segLog, segId, date)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`absolute bottom-16 right-4 z-10 border px-3 py-1.5 text-[11px] tracking-wider ${
          open
            ? 'border-cyan-400/70 bg-[#0d1420]/92 text-cyan-300'
            : 'border-slate-700/70 bg-[#0d1420]/92 text-slate-400 hover:border-slate-500'
        }`}
      >
        ✏️ تقرير أعمال
      </button>
      <aside
        className={`absolute left-0 top-0 z-20 flex h-full w-[340px] max-w-[92vw] flex-col border-r border-slate-700/70 bg-[#0d1420]/97 transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-slate-700/70 px-5 py-4">
          <button type="button" onClick={() => setOpen(false)} className="float-right px-2 py-1 text-slate-500 hover:text-slate-200">✕</button>
          <h2 className="text-sm font-bold tracking-wide text-slate-100">تقرير أعمال الأسفلت</h2>
          <div className="mt-0.5 text-[10px] text-slate-500">{name ? name : 'أدخل الرمز السري'}</div>
        </div>

        {!name ? (
          <div className="px-5 py-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); sessionStorage.setItem('bp_pin', e.target.value) }}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder="••••"
              className="w-full border border-slate-700 bg-transparent px-3 py-2 text-center tracking-[.4em] outline-none focus:border-cyan-400"
            />
            <button type="button" onClick={login} className="mt-3 w-full border border-cyan-400/60 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10">دخول</button>
            {err && <div className="mt-2 text-[11px] text-red-400">{err}</div>}
          </div>
        ) : (
          <div className="panel-scroll flex-1 overflow-y-auto px-5 py-4">
            <label className="text-[10px] uppercase tracking-[.25em] text-slate-500">تاريخ العمل</label>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setDate(e.target.value); clearReportSelection() }}
              className="mt-1 w-full border border-slate-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-cyan-400"
            />

            <div className="mt-4 text-[10px] uppercase tracking-[.25em] text-slate-500">الشارع</div>
            <div className="mt-1 max-h-44 overflow-y-auto border border-slate-800">
              {streets.map((s) => (
                <button
                  key={s.unit}
                  type="button"
                  onClick={() => { setReportUnit(s.unit); setDone('') }}
                  className={`block w-full px-2.5 py-1.5 text-right text-[11px] leading-4 ${
                    unit === s.unit ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  {s.label}
                  <span className="float-left text-slate-600">{s.last}</span>
                </button>
              ))}
              {!streets.length && <div className="px-2.5 py-2 text-[11px] text-slate-600">لا توريدات حتى هذا التاريخ</div>}
            </div>

            {unit && (
              <>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-[.25em] text-slate-500">القطاع المنجز</span>
                  <button
                    type="button"
                    onClick={() => { setDone(''); selectAllReportSegments() }}
                    className="border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
                  >
                    كامل الشارع
                  </button>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">اضغط أول وآخر فاصل — هنا أو على الخريطة</div>
                <div className="mt-2 flex flex-wrap gap-[3px]">
                  {unitSegs.map((f) => {
                    const id = f.properties.id
                    const inRange = selection.length ? selection.includes(id) : anchor === id
                    const st = stripStage(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        title={`ch ${f.properties.from_ch}–${f.properties.to_ch}`}
                        onClick={() => { setDone(''); tapReportSegment(id) }}
                        className="h-5"
                        style={{
                          width: `${Math.max(f.properties.length_m / 12, 4)}px`,
                          background: inRange ? '#22d3ee' : stageColor(st),
                          opacity: inRange ? 1 : st === 0 ? 0.35 : 0.85,
                          outline: inRange ? '1px solid #67e8f9' : 'none',
                        }}
                      />
                    )
                  })}
                </div>
                <div className="mt-1.5 text-[10px] text-slate-500">
                  {selection.length
                    ? `المحدد: ${selectedLen} م (${selection.length} فاصل)`
                    : anchor !== null
                      ? 'حدد آخر فاصل…'
                      : `${unitSegs.length} فاصل — ${unitSegs.reduce((a, f) => a + f.properties.length_m, 0)} م`}
                </div>

                <div className="mt-3 text-[10px] uppercase tracking-[.25em] text-slate-500">الطبقة</div>
                <div className="mt-1 flex gap-1.5">
                  {STAGES.slice(1).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStage(s.key)}
                      className={`flex-1 border px-1 py-1.5 text-[11px] ${
                        stage === s.key ? 'border-cyan-400/70 text-cyan-200' : 'border-slate-700 text-slate-400'
                      }`}
                      style={stage === s.key ? { background: 'rgba(34,211,238,.08)' } : undefined}
                    >
                      {s.label.split(' — ')[0]}
                    </button>
                  ))}
                </div>

                {/* lane split: fraction of the street width this pass covered */}
                <div className="mt-3 text-[10px] uppercase tracking-[.25em] text-slate-500">
                  العرض المنجز <span className="normal-case tracking-normal text-slate-600">(مسار واحد = جزء من العرض)</span>
                </div>
                <div className="mt-1 flex gap-1.5">
                  {WIDTH_FRACS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrac(f)}
                      className={`flex-1 border px-1 py-1.5 text-[11px] ${
                        frac === f ? 'border-cyan-400/70 text-cyan-200' : 'border-slate-700 text-slate-400'
                      }`}
                      style={frac === f ? { background: 'rgba(34,211,238,.08)' } : undefined}
                    >
                      {f === 1 ? 'كامل' : fracLabel(f)}
                    </button>
                  ))}
                </div>

                {hint && (
                  <div className={`mt-2 border px-2.5 py-1.5 text-[11px] ${
                    selection.length && Math.abs(selectedLen - hint.meters) / hint.meters > 0.25
                      ? 'border-amber-500/50 text-amber-300'
                      : 'border-slate-800 text-slate-400'
                  }`}>
                    وصل هذا اليوم {Math.round(hint.tons)} طن {STAGES[STAGE_INDEX[stage]].label.split(' — ')[0]} ≈{' '}
                    {hint.meters} م بعرض {frac < 1 ? `${fracLabel(frac)} × ` : ''}{PAVING.layingWidth_m} م
                    {selection.length ? ` — حددت ${selectedLen} م` : ''}
                  </div>
                )}

                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة (اختياري)"
                  className="mt-3 w-full border border-slate-700 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  disabled={!selection.length || saving}
                  onClick={save}
                  className="mt-3 w-full border border-cyan-400/60 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40"
                >
                  {saving ? 'جارٍ الحفظ…' : 'حفظ التقرير'}
                </button>
                {err && <div className="mt-2 text-[11px] text-red-400">{err}</div>}
                {done && <div className="mt-2 text-[11px] text-emerald-400">{done}</div>}
              </>
            )}

            {/* delete feedback must show even with no street picked */}
            {!unit && err && <div className="mt-2 text-[11px] text-red-400">{err}</div>}
            {!unit && done && <div className="mt-2 text-[11px] text-emerald-400">{done}</div>}

            {/* saved reports — corrections are delete + re-enter */}
            <div className="mt-5 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowMine((v) => !v)}
                className="flex w-full items-baseline justify-between text-right"
              >
                <span className="text-[10px] uppercase tracking-[.25em] text-slate-500">
                  التقارير المحفوظة ({myReports.length})
                </span>
                <span className="text-[10px] text-slate-600">{showMine ? '▲' : '▼'}</span>
              </button>
              {showMine && (
                <div className="mt-2 max-h-56 overflow-y-auto">
                  {!myReports.length && (
                    <div className="py-1 text-[11px] text-slate-600">لا تقارير محفوظة بعد</div>
                  )}
                  {myReports.map((g) => (
                    <div key={g.report_id} className="flex items-center gap-2 border-b border-slate-800/70 py-1.5 text-[11px]">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: stageColor(STAGE_INDEX[g.stage]) }} />
                      <span className="min-w-0 flex-1 truncate text-slate-300" title={`${g.label} · ${g.report_id}`}>
                        {g.label}
                        <span className="text-slate-600"> · {g.n} فاصل{g.frac < 1 ? ` · ${fracLabel(g.frac)} العرض` : ''}</span>
                      </span>
                      <span className="shrink-0 text-slate-500">{g.date}</span>
                      {g.by === name && (
                        confirmDel === g.report_id ? (
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => deleteReport(g.report_id)}
                            className="shrink-0 border border-red-500/60 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-300 disabled:opacity-40"
                          >
                            {deleting ? '…' : 'تأكيد الحذف'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDel(g.report_id)}
                            className="shrink-0 px-1 text-slate-600 hover:text-red-400"
                            title="حذف التقرير"
                          >
                            🗑
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
