import { useEffect } from 'react'
import MapView from './components/MapView'
import DetailPanel from './components/DetailPanel'
import TimeSlider from './components/TimeSlider'
import InsightStrip from './components/InsightStrip'
import FilterBar from './components/FilterBar'
import { STAGES, COMPLETE_INDEX, stageColor } from './config/stages'
import { useApp } from './store'

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 border border-slate-700/70 bg-[#0d1420]/90 px-3 py-2.5">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
          <svg width="26" height="4">
            <line
              x1="0" y1="2" x2="26" y2="2"
              stroke={stageColor(i)}
              strokeWidth="3"
              strokeDasharray={i > 0 && i < COMPLETE_INDEX ? '5 3' : undefined}
            />
          </svg>
          <span className={i === 0 ? 'text-slate-500' : ''}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function App() {
  const loadData = useApp((s) => s.loadData)
  const asOfDate = useApp((s) => s.asOfDate)
  const live = useApp((s) => s.live)
  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView />
      {/* drafting-sheet frame */}
      <div className="pointer-events-none absolute inset-2 z-[5] border border-slate-800/70" />
      {/* one wrapping top row — header, filters, insights can never overlap */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start gap-x-6 gap-y-2">
        <header>
          <h1 className="text-base font-bold tracking-[.35em] text-cyan-300">BLUEPRINT</h1>
          <p className="mt-0.5 text-[11px] tracking-wider text-slate-400">
            أعمال الأسفلت — حتى {asOfDate} ·{' '}
            {live ? <span className="text-emerald-400">بيانات حية</span> : 'نسخة محفوظة'}
          </p>
        </header>
        <div className="pointer-events-auto mt-0.5">
          <FilterBar />
        </div>
        <div className="pointer-events-auto ml-auto">
          <InsightStrip />
        </div>
      </div>
      <Legend />
      <TimeSlider />
      <DetailPanel />
    </div>
  )
}

export default App
