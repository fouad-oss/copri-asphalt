import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { STAGES, STAGE_INDEX, stageColor, type StageKey } from '../config/stages'
import { PAVING, tonsToM2 } from '../config/paving'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/backend'
import { currentStage } from '../lib/derive'
import type { SegmentFeature } from '../types'

const SESSION_KEY = 'bp_reporter'

async function sbRpc<T>(name: string, args: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}`)
  return res.json()
}

// Segment work reports — admin-only for now (blueprint_reporters holds
// one row). The report: pick a street that received asphalt, tap the
// first and last worked segment on the strip, pick the layer, save.
// Delivered tonnage converts to meters live so the range self-checks.
export default function ReportPanel() {
  const segments = useApp((s) => s.segments)
  const worklog = useApp((s) => s.worklog)
  const segLog = useApp((s) => s.segLog)
  const loadSegLog = useApp((s) => s.loadSegLog)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY))
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [unit, setUnit] = useState<string | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null) // indices into the unit's sorted segments
  const [anchor, setAnchor] = useState<number | null>(null)
  const [stage, setStage] = useState<StageKey>('type_ii')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')

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
  // the picked layer, converted to meters of street.
  const hint = useMemo(() => {
    if (!unit) return null
    const tons = worklog
      .filter((r) => r.segment_id === unit && r.date === date && STAGE_INDEX[r.stage] === STAGE_INDEX[stage])
      .reduce((a, r) => a + (r.reported_qty || 0), 0)
    if (!tons) return null
    const m2 = tonsToM2(stage, tons) || 0
    return { tons, meters: Math.round(m2 / PAVING.layingWidth_m) }
  }, [unit, worklog, date, stage])

  const selectedLen = useMemo(() => {
    if (!range) return 0
    return unitSegs.slice(range[0], range[1] + 1).reduce((a, f) => a + f.properties.length_m, 0)
  }, [range, unitSegs])

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

  const tapSegment = (i: number) => {
    setDone('')
    if (anchor === null || range) {
      setAnchor(i)
      setRange(null)
    } else {
      setRange([Math.min(anchor, i), Math.max(anchor, i)])
    }
  }

  const save = async () => {
    if (!unit || !range) return
    setSaving(true)
    setErr('')
    try {
      const ids = unitSegs.slice(range[0], range[1] + 1).map((f) => f.properties.id)
      const r = await sbRpc<{ success: boolean; report_id?: string; rows?: number; error?: string }>(
        'blueprint_report_submit',
        {
          p_pin: sessionStorage.getItem('bp_pin') || pin,
          p_stage: stage,
          p_date: date,
          p_unit: unit,
          p_segment_ids: ids,
          p_note: note.trim(),
        },
      )
      if (!r.success) { setErr('تعذّر الحفظ: ' + (r.error || '')); return }
      setDone(`تم الحفظ — ${r.rows} قطعة (${r.report_id})`)
      setRange(null)
      setAnchor(null)
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
              onChange={(e) => { setDate(e.target.value); setRange(null); setAnchor(null) }}
              className="mt-1 w-full border border-slate-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-cyan-400"
            />

            <div className="mt-4 text-[10px] uppercase tracking-[.25em] text-slate-500">الشارع</div>
            <div className="mt-1 max-h-44 overflow-y-auto border border-slate-800">
              {streets.map((s) => (
                <button
                  key={s.unit}
                  type="button"
                  onClick={() => { setUnit(s.unit); setRange(null); setAnchor(null); setDone('') }}
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
                  <span className="text-[10px] text-slate-500">اضغط أول قطعة ثم آخر قطعة</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-[3px]">
                  {unitSegs.map((f, i) => {
                    const inRange = range ? i >= range[0] && i <= range[1] : anchor === i
                    const st = stripStage(f.properties.id)
                    return (
                      <button
                        key={f.properties.id}
                        type="button"
                        title={`ch ${f.properties.from_ch}–${f.properties.to_ch}`}
                        onClick={() => tapSegment(i)}
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
                  {range
                    ? `المحدد: ${selectedLen} م (${range[1] - range[0] + 1} قطعة)`
                    : anchor !== null
                      ? 'حدد آخر قطعة…'
                      : `${unitSegs.length} قطعة — ${unitSegs.reduce((a, f) => a + f.properties.length_m, 0)} م`}
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

                {hint && (
                  <div className={`mt-2 border px-2.5 py-1.5 text-[11px] ${
                    range && Math.abs(selectedLen - hint.meters) / hint.meters > 0.25
                      ? 'border-amber-500/50 text-amber-300'
                      : 'border-slate-800 text-slate-400'
                  }`}>
                    وصل هذا اليوم {Math.round(hint.tons)} طن {STAGES[STAGE_INDEX[stage]].label.split(' — ')[0]} ≈{' '}
                    {hint.meters} م بعرض {PAVING.layingWidth_m} م
                    {range ? ` — حددت ${selectedLen} م` : ''}
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
                  disabled={!range || saving}
                  onClick={save}
                  className="mt-3 w-full border border-cyan-400/60 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40"
                >
                  {saving ? 'جارٍ الحفظ…' : 'حفظ التقرير'}
                </button>
                {err && <div className="mt-2 text-[11px] text-red-400">{err}</div>}
                {done && <div className="mt-2 text-[11px] text-emerald-400">{done}</div>}
              </>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
