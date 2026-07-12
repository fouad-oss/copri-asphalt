import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import { STAGES, STAGE_INDEX, COMPLETE_INDEX, stageColor } from '../config/stages'
import { currentStage, stageDates, daysBetween } from '../lib/derive'
import { STALL_DAYS } from '../lib/insights'
import { PAVING, tonsToM2 } from '../config/paving'
import ProgressRail from './ProgressRail'
import type { SegmentFeature } from '../types'

// Right-hand detail panel; slides in when a segment is selected. All
// facts are derived from the worklog at the store's asOfDate.
export default function DetailPanel() {
  const selectedId = useApp((s) => s.selectedId)
  const setSelected = useApp((s) => s.setSelected)
  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
  const segLog = useApp((s) => s.segLog)
  const asOfDate = useApp((s) => s.asOfDate)

  // Keep the last shown feature so content stays put during slide-out.
  const [shown, setShown] = useState<SegmentFeature | null>(null)
  useEffect(() => {
    if (!selectedId || !segments) return
    const f = segments.features.find((x) => x.properties.id === selectedId)
    if (f) setShown(f)
  }, [selectedId, segments])

  const open = !!selectedId && !!shown
  const p = shown?.properties

  const derived = useMemo(() => {
    if (!p) return null
    // Everything is derived at the UNIT level (the whole street) — the
    // dispatch data doesn't know which 100 m piece a load landed on.
    const unit = p.unit ?? '∅'
    const cur = currentStage(worklog, unit, asOfDate)
    const dates = stageDates(worklog, unit, asOfDate)
    const rows = worklog
      .filter((r) => r.segment_id === unit && r.date <= asOfDate)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))
    // Rows logged out of stage order (same walk as the insight strip).
    const outOfSeq = new Set<string>()
    let maxSeen = 0
    for (const r of [...rows].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : STAGE_INDEX[a.stage] - STAGE_INDEX[b.stage],
    )) {
      const i = STAGE_INDEX[r.stage]
      if (i < maxSeen) outOfSeq.add(r.id)
      if (i > maxSeen) maxSeen = i
    }
    const since = dates[cur]
    const daysIn = since ? daysBetween(since, asOfDate) : null
    const stalled = cur > 0 && cur < COMPLETE_INDEX && daysIn !== null && daysIn > STALL_DAYS
    // Laid quantities per layer: tons → m² (config factors) vs the whole
    // street's area (Σ segment lengths × laying width).
    const unitLen = p.unit
      ? (segments?.features ?? [])
          .filter((f) => f.properties.unit === p.unit)
          .reduce((a, f) => a + f.properties.length_m, 0)
      : 0
    const streetArea = unitLen * PAVING.layingWidth_m
    const layers = STAGES.map((s, i) => {
      if (i === 0 || !PAVING.thickness_cm[s.key]) return null
      const tons = rows.filter((r) => STAGE_INDEX[r.stage] === i).reduce((a, r) => a + (r.reported_qty || 0), 0)
      if (!tons) return null
      const m2 = tonsToM2(s.key, tons) || 0
      return { i, label: s.label, tons, m2, pct: streetArea ? m2 / streetArea : 0 }
    }).filter(Boolean) as { i: number; label: string; tons: number; m2: number; pct: number }[]
    return { cur, dates, rows, daysIn, stalled, outOfSeq, unitLen, streetArea, layers }
  }, [p, worklog, asOfDate, segments])

  return (
    <aside
      className={`absolute right-0 top-0 z-20 flex h-full w-[360px] max-w-[92vw] flex-col border-l border-slate-700/70 bg-[#0d1420]/97 transition-transform duration-300 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {p && derived && (
        <>
          <div className="border-b border-slate-700/70 px-5 pb-4 pt-4">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="float-left -mt-1 px-2 py-1 text-slate-500 hover:text-slate-200"
              aria-label="close"
            >
              ✕
            </button>
            <h2 className="text-base font-bold tracking-wide text-slate-100">
              {p.street || 'شارع بدون اسم'}
            </h2>
            <div className="mt-0.5 text-[11px] tracking-widest text-slate-400">
              {p.site}
              {p.block ? ` · ق${p.block}` : ''} · ch {String(p.from_ch).padStart(4, '0')}–
              {String(p.to_ch).padStart(4, '0')}
            </div>
            <div className="mt-1 text-[10px] text-slate-600">{p.id}</div>
          </div>

          <div className="panel-scroll flex-1 overflow-y-auto px-5 py-4">
            {/* progress rail */}
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[.25em] text-slate-500">progress</span>
              {derived.daysIn !== null && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
                    derived.stalled ? 'bg-red-500/15 text-red-400' : 'text-slate-400'
                  }`}
                >
                  {derived.daysIn}d in stage{derived.stalled ? ' — stalled' : ''}
                </span>
              )}
            </div>
            <div className="mb-1 text-sm font-bold" style={{ color: stageColor(derived.cur) }}>
              {derived.cur}/{COMPLETE_INDEX} · {STAGES[derived.cur].label}
            </div>
            <div key={p.id} className="rail-in">
              <ProgressRail dates={derived.dates} current={derived.cur} />
            </div>

            {/* dimensions */}
            <div className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
              {[
                ['length', `${p.length_m} m`],
                ['width', `${p.width_m} m`],
                ['area', `${(p.length_m * p.width_m).toLocaleString()} m²`],
              ].map(([label, v]) => (
                <div key={label}>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
                  <div className="mt-0.5 text-sm text-slate-200">{v}</div>
                </div>
              ))}
            </div>

            {p.notes && (
              <div className="mt-3 border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300">
                {p.notes}
              </div>
            )}

            {/* laid quantities: tons → m² vs street area */}
            {derived.layers.length > 0 && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-[.25em] text-slate-500">
                    الكميات المفروشة
                  </span>
                  <span className="text-[10px] text-slate-500">
                    مساحة الشارع ≈ {Math.round(derived.streetArea).toLocaleString('en')} م²
                    <span className="text-slate-600"> ({derived.unitLen} م × {PAVING.layingWidth_m} م)</span>
                  </span>
                </div>
                {derived.layers.map((l) => (
                  <div key={l.i} className="mt-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-bold" style={{ color: stageColor(l.i) }}>{l.label}</span>
                      <span className="text-slate-400">
                        {Math.round(l.tons)} طن ≈ {Math.round(l.m2).toLocaleString('en')} م² ·{' '}
                        <span className={l.pct > 1.15 ? 'text-amber-400' : ''}>{Math.round(l.pct * 100)}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-slate-800">
                      <div
                        className="h-full"
                        style={{ width: `${Math.min(l.pct, 1) * 100}%`, background: stageColor(l.i) }}
                      />
                    </div>
                  </div>
                ))}
                <div className="mt-1.5 text-[9px] text-slate-600">
                  سماكات: I={PAVING.thickness_cm.type_i} · II={PAVING.thickness_cm.type_ii} · III=
                  {PAVING.thickness_cm.type_iii} سم · كثافة {PAVING.density_t_m3} — قابلة للتعديل لاحقاً
                </div>
              </div>
            )}

            {/* segment-level work reports for THIS 100 m piece */}
            {(() => {
              const reps = segLog
                .filter((r) => r.segment_id === p.id && r.date <= asOfDate)
                .sort((a, b) => (a.date < b.date ? 1 : -1))
              if (!reps.length) return null
              return (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-[.25em] text-slate-500">
                    تقارير هذا الفاصل ({reps.length})
                  </div>
                  {reps.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 border-b border-slate-800/70 py-1.5 text-[11px]">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: stageColor(STAGE_INDEX[r.stage]) }} />
                      <span className="font-bold text-slate-200">{STAGES[STAGE_INDEX[r.stage]].label}</span>
                      <span className="text-slate-500">{r.crew}</span>
                      <span className="ml-auto text-slate-400">{r.date}</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* dispatch history for the whole street, newest first */}
            <div className="mt-4 text-[10px] uppercase tracking-[.25em] text-slate-500">
              deliveries — كامل الشارع ({derived.rows.length})
            </div>
            {derived.rows.length === 0 && (
              <div className="mt-2 text-[11px] text-slate-600">
                {p.unit ? `لا توريدات حتى ${asOfDate}` : 'شارع غير مسمى — لا يمكن ربطه بالإرساليات'}
              </div>
            )}
            {derived.rows.map((r) => (
              <div key={r.id} className="border-b border-slate-800/70 py-2 text-[11px] leading-5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: stageColor(STAGE_INDEX[r.stage]) }}
                  />
                  <span className="font-bold text-slate-200">
                    {STAGES[STAGE_INDEX[r.stage]].label}
                  </span>
                  {derived.outOfSeq.has(r.id) && (
                    <span className="bg-amber-500/15 px-1 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                      out of seq
                    </span>
                  )}
                  <span className="ml-auto text-slate-400">{r.date}</span>
                </div>
                <div className="mt-0.5 pl-4 text-slate-500">
                  سند {r.report_id}
                  {r.crew ? ` · ${r.crew}` : ''}
                  {r.reported_qty != null ? ` · ${r.reported_qty} طن` : ''}
                </div>
                {r.note && <div className="pl-4 text-slate-400">“{r.note}”</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
