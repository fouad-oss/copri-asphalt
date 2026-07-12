import { useMemo } from 'react'
import { useApp } from '../store'
import { STAGES } from '../config/stages'
import { NO_FILTERS } from '../lib/insights'

const selectCls =
  'border border-slate-700/70 bg-[#0d1420]/92 px-2 py-1 text-[11px] text-slate-300 outline-none hover:border-slate-500'

// Block / stage / stalled-only. Same filter state drives the map and the
// insight strip (stalled-only is also toggled by the strip's tile).
export default function FilterBar() {
  const segments = useApp((s) => s.segments)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const clearFilters = useApp((s) => s.clearFilters)

  const blocks = useMemo(() => {
    if (!segments) return []
    return [...new Set(segments.features.map((f) => f.properties.block))]
  }, [segments])

  const active =
    filters.block !== NO_FILTERS.block ||
    filters.stageIdx !== NO_FILTERS.stageIdx ||
    filters.stalledOnly !== NO_FILTERS.stalledOnly

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className={selectCls}
        value={filters.block ?? ''}
        onChange={(e) => setFilters({ block: e.target.value || null })}
        aria-label="filter by block"
      >
        <option value="">all blocks</option>
        {blocks.map((b) => (
          <option key={b} value={b}>
            block {b}
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={filters.stageIdx ?? ''}
        onChange={(e) => setFilters({ stageIdx: e.target.value === '' ? null : Number(e.target.value) })}
        aria-label="filter by stage"
      >
        <option value="">all stages</option>
        {STAGES.map((s, i) => (
          <option key={s.key} value={i}>
            {i} {s.label}
          </option>
        ))}
      </select>
      <label className={`${selectCls} flex cursor-pointer items-center gap-1.5`}>
        <input
          type="checkbox"
          className="accent-red-400"
          checked={filters.stalledOnly}
          onChange={(e) => setFilters({ stalledOnly: e.target.checked })}
        />
        stalled only
      </label>
      {active && (
        <button
          type="button"
          onClick={clearFilters}
          className="px-2 py-1 text-[11px] text-cyan-300 hover:text-cyan-100"
        >
          clear ✕
        </button>
      )}
    </div>
  )
}
