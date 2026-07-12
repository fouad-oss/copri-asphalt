import { STAGES, stageColor } from '../config/stages'

// The hero component: one node per stage, filled to the current stage in
// the ramp's own colors, date under each completed node. Pure SVG.
export default function ProgressRail({
  dates,
  current,
}: {
  dates: (string | null)[]
  current: number
}) {
  const n = STAGES.length
  const W = 328
  const PAD = 16
  const Y = 18
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (n - 1)

  return (
    <svg viewBox={`0 0 ${W} 52`} className="w-full select-none">
      {/* base track */}
      <line x1={x(0)} x2={x(n - 1)} y1={Y} y2={Y} stroke="#232d3a" strokeWidth="2" />
      {/* filled connectors, each colored by the stage it leads into */}
      {STAGES.map((s, i) =>
        i > 0 && i <= current ? (
          <line
            key={`c-${s.key}`}
            x1={x(i - 1)}
            x2={x(i)}
            y1={Y}
            y2={Y}
            stroke={stageColor(i)}
            strokeWidth="2.5"
          />
        ) : null,
      )}
      {STAGES.map((s, i) => {
        const done = i <= current
        const isCur = i === current
        return (
          <g key={s.key}>
            <title>{`${i} ${s.label}${dates[i] ? ` — ${dates[i]}` : ''}`}</title>
            {isCur && (
              <circle cx={x(i)} cy={Y} r={9.5} fill="none" stroke={stageColor(i)} strokeOpacity=".4" strokeWidth="1.5" />
            )}
            <circle
              cx={x(i)}
              cy={Y}
              r={isCur ? 6 : 4.2}
              fill={done ? stageColor(i) : '#0a0e14'}
              stroke={done ? stageColor(i) : '#3a4652'}
              strokeWidth="1.4"
            />
            {done && i > 0 && dates[i] && (
              <text
                x={x(i)}
                y={Y + 20}
                textAnchor="middle"
                fontSize="7.5"
                fill={isCur ? stageColor(i) : '#64748b'}
                fontFamily="inherit"
              >
                {dates[i]!.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
