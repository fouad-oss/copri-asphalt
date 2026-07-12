import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import { STAGES, STAGE_INDEX, COMPLETE_INDEX, stageColor } from '../config/stages'
import { currentStage, stageDates, daysBetween } from '../lib/derive'
import { STALL_DAYS } from '../lib/insights'
import ProgressRail from './ProgressRail'
import type { SegmentFeature } from '../types'

// Right-hand detail panel; slides in when a segment is selected. All
// facts are derived from the worklog at the store's asOfDate.
export default function DetailPanel() {
  const selectedId = useApp((s) => s.selectedId)
  const setSelected = useApp((s) => s.setSelected)
  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
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
    const cur = currentStage(worklog, p.id, asOfDate)
    const dates = stageDates(worklog, p.id, asOfDate)
    const rows = worklog
      .filter((r) => r.segment_id === p.id && r.date <= asOfDate)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))
    const since = dates[cur]
    const daysIn = since ? daysBetween(since, asOfDate) : null
    const stalled = cur > 0 && cur < COMPLETE_INDEX && daysIn !== null && daysIn > STALL_DAYS
    return { cur, dates, rows, daysIn, stalled }
  }, [p, worklog, asOfDate])

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
            <h2 className="text-base font-bold tracking-wide text-slate-100">{p.street}</h2>
            <div className="mt-0.5 text-[11px] uppercase tracking-widest text-slate-400">
              block {p.block} · ch {String(p.from_ch).padStart(4, '0')}–{String(p.to_ch).padStart(4, '0')}
            </div>
            <div className="mt-1 text-[10px] text-slate-600">{p.id}</div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
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
            <ProgressRail dates={derived.dates} current={derived.cur} />

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

            {/* worklog, newest first */}
            <div className="mt-4 text-[10px] uppercase tracking-[.25em] text-slate-500">
              worklog ({derived.rows.length})
            </div>
            {derived.rows.length === 0 && (
              <div className="mt-2 text-[11px] text-slate-600">no entries as of {asOfDate}</div>
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
                  <span className="ml-auto text-slate-400">{r.date}</span>
                </div>
                <div className="mt-0.5 pl-4 text-slate-500">
                  {r.report_id}
                  {r.crew ? ` · ${r.crew}` : ''}
                  {r.reported_qty != null ? ` · qty ${r.reported_qty} m` : ''}
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
