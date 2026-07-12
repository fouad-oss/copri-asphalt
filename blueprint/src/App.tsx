import { useEffect, useState } from 'react'
import { STAGES, stageColor } from './config/stages'
import type { SegmentCollection, WorkLogEntry } from './types'
import worklogJson from './data/worklog.json'
import segmentsUrl from './data/segments.geojson?url'

// Step-1 placeholder: proves the stage config and generated data wire up.
// The map view replaces this in step 2.
function App() {
  const worklog = worklogJson as WorkLogEntry[]
  const [segments, setSegments] = useState<SegmentCollection | null>(null)
  useEffect(() => {
    fetch(segmentsUrl)
      .then((r) => r.json())
      .then(setSegments)
  }, [])

  const reports = new Set(worklog.map((r) => r.report_id)).size

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-xl font-bold tracking-widest text-cyan-300">
        BLUEPRINT
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        COPRI road works — step 1 of 6: scaffold, stage config, fake data
      </p>

      <div className="mt-8 text-sm leading-7">
        <div>segments : {segments ? segments.features.length : '…'}</div>
        <div>
          worklog : {worklog.length} rows / {reports} reports
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">
          stage ramp (warm → cold)
        </div>
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center gap-3 py-1 text-sm">
            <span className="w-4 text-right text-slate-500">{i}</span>
            <span
              className="h-1 w-16"
              style={{ background: stageColor(i) }}
            />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
