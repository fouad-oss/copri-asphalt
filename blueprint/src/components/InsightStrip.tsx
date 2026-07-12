import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { STAGES, COMPLETE_INDEX, stageColor } from '../config/stages'
import { segmentInsights, matchesFilters, totalTons, NO_WORK } from '../lib/insights'

// Live derived numbers for the current filters + time position.
// Counts are per street UNIT (a stalled street is one stalled street, not
// eleven stalled segments); % complete stays LENGTH-weighted.
export default function InsightStrip() {
  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
  const asOfDate = useApp((s) => s.asOfDate)
  const filters = useApp((s) => s.filters)
  const offMap = useApp((s) => s.offMap)
  const live = useApp((s) => s.live)
  const setFilters = useApp((s) => s.setFilters)
  const setSelected = useApp((s) => s.setSelected)
  const [openList, setOpenList] = useState<'violations' | 'offmap' | null>(null)

  const data = useMemo(() => {
    if (!segments) return null
    const ins = segmentInsights(worklog, asOfDate)
    const counts = STAGES.map(() => 0)
    let lenTotal = 0
    let lenDone = 0
    const units = new Set<string>()
    const stalledUnits = new Set<string>()
    const violationUnits = new Map<string, string>() // unit → first segment id
    for (const f of segments.features) {
      const i = (f.properties.unit && ins.get(f.properties.unit)) || NO_WORK
      if (!matchesFilters(f, i, filters)) continue
      counts[i.stageIdx]++
      const u = f.properties.unit
      // untouched geometry only counts toward the stage mix when a unit
      // exists — pure background streets would drown the bar otherwise
      if (u) {
        units.add(u)
        if (i.stageIdx > 0) {
          lenTotal += f.properties.length_m
          if (i.stageIdx === COMPLETE_INDEX) lenDone += f.properties.length_m
        }
        if (i.stalled) stalledUnits.add(u)
        if (i.violation && !violationUnits.has(u)) violationUnits.set(u, f.properties.id)
      }
    }
    const tons = totalTons(worklog, asOfDate, units)
    return {
      counts,
      pctComplete: lenTotal ? Math.round((lenDone / lenTotal) * 100) : 0,
      activeCount: counts.slice(1).reduce((a, b) => a + b, 0),
      stalled: stalledUnits.size,
      violations: [...violationUnits.entries()],
      tons,
    }
  }, [segments, worklog, asOfDate, filters])

  if (!data) return null

  const tile = 'border border-slate-700/70 bg-[#0d1420]/92 px-3 py-1.5 text-center'
  const label = 'text-[8.5px] uppercase tracking-[.18em] text-slate-500'
  const offMapRows = offMap.reduce((a, [, n]) => a + n, 0)

  return (
    <div className="relative">
      <div className="flex flex-wrap items-stretch justify-end gap-1.5">
        {/* stage mix of worked segments — stacked bar */}
        <div className={tile}>
          <svg width="120" height="10" className="mt-1 block">
            {(() => {
              const total = data.counts.slice(1).reduce((a, b) => a + b, 0)
              let cx = 0
              return data.counts.map((n, i) => {
                if (i === 0 || !n || !total) return null
                const w = (n / total) * 120
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
          <div className={`mt-1 ${label}`}>{data.activeCount} × 100م قيد العمل</div>
        </div>

        {/* tons delivered */}
        <div className={tile}>
          <div className="text-lg font-bold leading-6 text-slate-200">
            {Math.round(data.tons).toLocaleString('en')}
          </div>
          <div className={label}>طن مورد</div>
        </div>

        {/* % surfaced, length-weighted */}
        <div className={tile}>
          <div className="text-lg font-bold leading-6 text-cyan-300">{data.pctComplete}%</div>
          <div className={label}>type III · by length</div>
        </div>

        {/* stalled — click filters the map */}
        <button
          type="button"
          onClick={() => setFilters({ stalledOnly: !filters.stalledOnly })}
          className={`${tile} ${filters.stalledOnly ? 'border-red-400/70 bg-red-500/10' : 'hover:border-slate-500'}`}
        >
          <div className={`text-lg font-bold leading-6 ${data.stalled ? 'text-red-400' : 'text-slate-400'}`}>
            {data.stalled}
          </div>
          <div className={label}>متوقف &gt;14يوم</div>
        </button>

        {/* sequence violations (e.g. Type I after Type III) */}
        <button
          type="button"
          onClick={() => setOpenList(openList === 'violations' ? null : 'violations')}
          className={`${tile} ${openList === 'violations' ? 'border-amber-400/70' : 'hover:border-slate-500'}`}
        >
          <div className={`text-lg font-bold leading-6 ${data.violations.length ? 'text-amber-400' : 'text-slate-400'}`}>
            {data.violations.length}
          </div>
          <div className={label}>خارج التسلسل</div>
        </button>

        {/* coverage: dispatches with no geometry match */}
        {offMapRows > 0 && (
          <button
            type="button"
            onClick={() => setOpenList(openList === 'offmap' ? null : 'offmap')}
            className={`${tile} ${openList === 'offmap' ? 'border-amber-400/70' : 'hover:border-slate-500'}`}
          >
            <div className="text-lg font-bold leading-6 text-slate-400">{offMapRows}</div>
            <div className={label}>خارج الخريطة{live ? '' : ' · snapshot'}</div>
          </button>
        )}
      </div>

      {/* dropdown lists — absolute so they never reflow the top row */}
      {openList === 'violations' && (
        <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[300px] border border-slate-700/70 bg-[#0d1420]/95 px-3 py-2 text-[11px]">
          {data.violations.length === 0 && <div className="text-slate-500">none in view</div>}
          {data.violations.map(([unit, segId]) => (
            <button
              key={unit}
              type="button"
              onClick={() => setSelected(segId)}
              className="block w-full py-0.5 text-left text-amber-300 hover:text-amber-100"
            >
              {unit.replace(/\|/g, ' · ')} — تسلسل خلطات غير منتظم
            </button>
          ))}
        </div>
      )}
      {openList === 'offmap' && (
        <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[340px] border border-slate-700/70 bg-[#0d1420]/95 px-3 py-2 text-[11px]">
          <div className="mb-1 text-slate-500">مواقع إرساليات بدون هندسة مطابقة على الخريطة:</div>
          {offMap.slice(0, 14).map(([k, n]) => (
            <div key={k} className="flex justify-between gap-4 py-0.5 text-slate-300">
              <span>{k}</span>
              <span className="text-slate-500">{n}</span>
            </div>
          ))}
          {offMap.length > 14 && <div className="text-slate-600">… +{offMap.length - 14}</div>}
        </div>
      )}
    </div>
  )
}
