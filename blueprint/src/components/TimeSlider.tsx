import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { addDays, daysBetween } from '../lib/derive'

const PLAY_MS_PER_DAY = 80

// Bottom time slider: one tick per day across the worklog's range.
// Dragging just changes asOfDate — every view derives from it, so the
// map recolors live. Play animates a day at a time and stops at the end.
export default function TimeSlider() {
  const asOfDate = useApp((s) => s.asOfDate)
  const setAsOfDate = useApp((s) => s.setAsOfDate)
  const minDate = useApp((s) => s.minDate)
  const maxDate = useApp((s) => s.maxDate)
  const [playing, setPlaying] = useState(false)

  const total = daysBetween(minDate, maxDate)
  const value = Math.min(Math.max(daysBetween(minDate, asOfDate), 0), total)

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      const v = daysBetween(minDate, useApp.getState().asOfDate)
      if (v >= total) {
        setPlaying(false)
        return
      }
      setAsOfDate(addDays(minDate, v + 1))
    }, PLAY_MS_PER_DAY)
    return () => clearInterval(t)
  }, [playing, minDate, total, setAsOfDate])

  const togglePlay = () => {
    if (!playing && value >= total) setAsOfDate(minDate) // replay from start
    setPlaying((p) => !p)
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-10 w-[min(620px,72vw)] -translate-x-1/2 border border-slate-700/70 bg-[#0d1420]/92 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="w-7 shrink-0 text-lg leading-none text-cyan-300 hover:text-cyan-100"
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={value}
          onChange={(e) => {
            setPlaying(false)
            setAsOfDate(addDays(minDate, Number(e.target.value)))
          }}
          className="h-1 flex-1 cursor-pointer accent-cyan-400"
          aria-label="as-of date"
        />
        <span className="w-[86px] shrink-0 text-right text-xs font-bold tracking-wider text-cyan-300">
          {asOfDate}
        </span>
      </div>
      <div className="mt-1 flex justify-between pl-10 pr-[98px] text-[9px] tracking-wider text-slate-600">
        <span>{minDate}</span>
        <span>{maxDate}</span>
      </div>
    </div>
  )
}
