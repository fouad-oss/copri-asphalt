import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { STAGES, COMPLETE_INDEX, stageColor } from '../config/stages'
import {
  segmentInsights,
  matchesFilters,
  reconciliation,
  NO_WORK,
} from '../lib/insights'

// Live derived numbers for the current filters + time position.
export default function InsightStrip() {
  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
  const asOfDate = useApp((s) => s.asOfDate)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const setSelected = useApp((s) => s.setSelected)
  const [openList, setOpenList] = useState<'violations' | 'recon' | null>(null)

  const data = useMemo(() => {
    if (!segments) return null
    const ins = segmentInsights(worklog, asOfDate)
    const get = (id: string) => ins.get(id) ?? NO_WORK
    const feats = segments.features.filter((f) => matchesFilters(f, get(f.properties.id), filters))
    const counts = STAGES.map(() => 0)
    let lenTotal = 0
    let lenDone = 0
    const stalledIds: string[] = []
    const violationIds: string[] = []
    for (const f of feats) {
      const i = get(f.properties.id)
      counts[i.stageIdx]++
      lenTotal += f.properties.length_m
      if (i.stageIdx === COMPLETE_INDEX) lenDone += f.properties.length_m
      if (i.stalled) stalledIds.push(f.properties.id)
      if (i.violation) violationIds.push(f.properties.id)
    }
    const lengthById = new Map(segments.features.map((f) => [f.properties.id, f.properties.length_m]))
    const recon = reconciliation(
      worklog,
      asOfDate,
      lengthById,
      new Set(feats.map((f) => f.properties.id)),
    )
    return {
      counts,
      total: feats.length,
      pctComplete: lenTotal ? Math.round((lenDone / lenTotal) * 100) : 0,
      stalledIds,
      violationIds,
      recon,
    }
  }, [segments, worklog, asOfDate, filters])

  if (!data) return null

  const tile = 'border border-slate-700/70 bg-[#0d1420]/92 px-3 py-1.5 text-center'
  const label = 'text-[8.5px] uppercase tracking-[.18em] text-slate-500'

  return (
    <div className="relative">
      <div className="flex flex-wrap items-stretch justify-end gap-1.5">
        {/* stage mix — stacked bar */}
        <div className={tile}>
          <svg width="120" height="10" className="mt-1 block">
            {(() => {
              let cx = 0
              return data.counts.map((n, i) => {
                if (!n || !data.total) return null
                const w = (n / data.total) * 120
                const rect = (
                  <rect key={STAGES[i].key} x={cx} y="0" width={w} height="10" fill={stageColor(i)}>
                    <title>{`${STAGES[i].label}: ${n}`}</title>
                  </rect>
                )
                cx += w
                return rect
              })
            })()}
          </svg>
          <div className={`mt-1 ${label}`}>{data.total} segments</div>
        </div>

        {/* % complete, length-weighted */}
        <div className={tile}>
          <div className="text-lg font-bold leading-6 text-cyan-300">{data.pctComplete}%</div>
          <div className={label}>complete · by length</div>
        </div>

        {/* stalled — click filters the map */}
        <button
          type="button"
          onClick={() => setFilters({ stalledOnly: !filters.stalledOnly })}
          className={`${tile} ${filters.stalledOnly ? 'border-red-400/70 bg-red-500/10' : 'hover:border-slate-500'}`}
        >
          <div className={`text-lg font-bold leading-6 ${data.stalledIds.length ? 'text-red-400' : 'text-slate-400'}`}>
            {data.stalledIds.length}
          </div>
          <div className={label}>stalled &gt;14d</div>
        </button>

        {/* sequence violations */}
        <button
          type="button"
          onClick={() => setOpenList(openList === 'violations' ? null : 'violations')}
          className={`${tile} ${openList === 'violations' ? 'border-amber-400/70' : 'hover:border-slate-500'}`}
        >
          <div className={`text-lg font-bold leading-6 ${data.violationIds.length ? 'text-amber-400' : 'text-slate-400'}`}>
            {data.violationIds.length}
          </div>
          <div className={label}>seq violations</div>
        </button>

        {/* reconciliation */}
        <button
          type="button"
          onClick={() => setOpenList(openList === 'recon' ? null : 'recon')}
          className={`${tile} ${openList === 'recon' ? 'border-amber-400/70' : 'hover:border-slate-500'}`}
        >
          <div className={`text-lg font-bold leading-6 ${data.recon.length ? 'text-amber-400' : 'text-slate-400'}`}>
            {data.recon.length}
          </div>
          <div className={label}>qty mismatch</div>
        </button>
      </div>

      {/* dropdown lists — absolute so they never reflow the top row */}
      {openList === 'violations' && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[300px] border border-slate-700/70 bg-[#0d1420]/95 px-3 py-2 text-[11px]">
          {data.violationIds.length === 0 && <div className="text-slate-500">none in view</div>}
          {data.violationIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className="block w-full py-0.5 text-left text-amber-300 hover:text-amber-100"
            >
              {id} — stage logged out of order
            </button>
          ))}
        </div>
      )}
      {openList === 'recon' && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[380px] border border-slate-700/70 bg-[#0d1420]/95 px-3 py-2 text-[11px]">
          {data.recon.length === 0 && <div className="text-slate-500">none in view</div>}
          {data.recon.map((r) => (
            <div key={r.reportId} className="flex gap-3 py-0.5 text-slate-300">
              <span className="font-bold text-amber-300">{r.reportId}</span>
              <span>reported {r.qty} m</span>
              <span>segments Σ {r.sumLen} m</span>
              <span className={r.pct > 0 ? 'text-amber-400' : 'text-red-400'}>
                {r.pct > 0 ? '+' : ''}
                {Math.round(r.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
