import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { PAVING, PAVING_DEFAULTS } from '../config/paving'
import { sbGet, sbRpc } from '../config/backend'
import type { StageKey } from '../config/stages'

const SESSION_KEY = 'bp_reporter'

// Office-adjustable paving factors (⚙). Same PIN gate as work reports;
// values persist in blueprint_settings ('paving') and every open client
// picks them up on next load. The map's coverage math re-derives live.
export default function SettingsPanel() {
  const applyPaving = useApp((s) => s.applyPaving)
  const pavingRev = useApp((s) => s.pavingRev)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY))
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')
  const [meta, setMeta] = useState<{ by: string; at: string } | null>(null)

  // Form state mirrors the live singleton whenever it changes elsewhere.
  const [form, setForm] = useState(() => snapshot())
  useEffect(() => {
    if (!saving) setForm(snapshot())
  }, [pavingRev]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    sbGet<{ updated_by: string; updated_at: string }[]>(
      'blueprint_settings?select=updated_by,updated_at&key=eq.paving',
    )
      .then((rows) =>
        setMeta(rows[0] ? { by: rows[0].updated_by, at: rows[0].updated_at.slice(0, 10) } : null),
      )
      .catch(() => setMeta(null))
  }, [open, pavingRev])

  const login = async () => {
    setErr('')
    try {
      const r = await sbRpc<{ success: boolean; name?: string }>('blueprint_reporter_check', { p_pin: pin })
      if (!r.success || !r.name) { setErr('رمز غير صحيح'); return }
      sessionStorage.setItem(SESSION_KEY, r.name)
      sessionStorage.setItem('bp_pin', pin)
      setName(r.name)
    } catch {
      setErr('تعذّر التحقق — هل طُبّق ترحيل 0009؟')
    }
  }

  const save = async () => {
    const value = parse(form)
    if (!value) { setErr('قيم غير صالحة'); return }
    setSaving(true)
    setErr('')
    setDone('')
    try {
      const r = await sbRpc<{ success: boolean; error?: string }>('blueprint_settings_set', {
        p_pin: sessionStorage.getItem('bp_pin') || pin,
        p_key: 'paving',
        p_value: value,
      })
      if (!r.success) { setErr('تعذّر الحفظ: ' + (r.error || '')); return }
      applyPaving(value)
      setDone('تم الحفظ — المعاملات سارية الآن')
    } catch {
      setErr('تعذّر الحفظ — هل طُبّق ترحيل 0011؟')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, hint: string) => (
    <label className="block">
      <span className="flex justify-between text-[10px] text-slate-500">
        <span>{label}</span>
        <span className="text-slate-600">{hint}</span>
      </span>
      <input
        inputMode="decimal"
        value={form[key]}
        onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setDone('') }}
        className="mt-0.5 w-full border border-slate-700 bg-transparent px-2 py-1 text-sm outline-none focus:border-cyan-400"
      />
    </label>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`absolute bottom-[7.25rem] right-4 z-10 border px-3 py-1.5 text-[11px] tracking-wider ${
          open
            ? 'border-cyan-400/70 bg-[#0d1420]/92 text-cyan-300'
            : 'border-slate-700/70 bg-[#0d1420]/92 text-slate-400 hover:border-slate-500'
        }`}
      >
        ⚙ معاملات الفرش
      </button>
      {open && (
        <div className="absolute bottom-[9.5rem] right-4 z-20 w-[260px] border border-slate-700/70 bg-[#0d1420]/97 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[12px] font-bold tracking-wide text-slate-100">معاملات الفرش</h2>
            <button type="button" onClick={() => setOpen(false)} className="px-1 text-slate-500 hover:text-slate-200">✕</button>
          </div>
          <div className="mt-0.5 text-[9px] text-slate-600">
            تدخل في تحويل الأطنان إلى مساحة وطول — لكل المستخدمين
            {meta && ` · آخر تعديل ${meta.by} (${meta.at})`}
          </div>

          {!name ? (
            <div className="mt-3">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                placeholder="••••"
                className="w-full border border-slate-700 bg-transparent px-3 py-1.5 text-center tracking-[.4em] outline-none focus:border-cyan-400"
              />
              <button type="button" onClick={login} className="mt-2 w-full border border-cyan-400/60 py-1.5 text-[12px] text-cyan-300 hover:bg-cyan-400/10">دخول</button>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {field('سماكة Type I — سم', 't1', `افتراضي ${PAVING_DEFAULTS.thickness_cm.type_i}`)}
              {field('سماكة Type II — سم', 't2', `افتراضي ${PAVING_DEFAULTS.thickness_cm.type_ii}`)}
              {field('سماكة Type III — سم', 't3', `افتراضي ${PAVING_DEFAULTS.thickness_cm.type_iii}`)}
              {field('الكثافة — طن/م³', 'density', `افتراضي ${PAVING_DEFAULTS.density_t_m3}`)}
              {field('عرض الفرش — م', 'width', `افتراضي ${PAVING_DEFAULTS.layingWidth_m}`)}
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="w-full border border-cyan-400/60 py-1.5 text-[12px] text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40"
              >
                {saving ? 'جارٍ الحفظ…' : 'حفظ للجميع'}
              </button>
            </div>
          )}
          {err && <div className="mt-2 text-[11px] text-red-400">{err}</div>}
          {done && <div className="mt-2 text-[11px] text-emerald-400">{done}</div>}
        </div>
      )}
    </>
  )
}

function snapshot() {
  return {
    t1: String(PAVING.thickness_cm.type_i ?? ''),
    t2: String(PAVING.thickness_cm.type_ii ?? ''),
    t3: String(PAVING.thickness_cm.type_iii ?? ''),
    density: String(PAVING.density_t_m3),
    width: String(PAVING.layingWidth_m),
  }
}

// Form strings → settings jsonb; null when anything is out of range.
function parse(f: ReturnType<typeof snapshot>) {
  const n = (s: string, lo: number, hi: number) => {
    const v = parseFloat(s)
    return isFinite(v) && v > lo && v <= hi ? v : null
  }
  const t1 = n(f.t1, 0.5, 30)
  const t2 = n(f.t2, 0.5, 30)
  const t3 = n(f.t3, 0.5, 30)
  const density = n(f.density, 0.5, 5)
  const width = n(f.width, 1, 40)
  if (!t1 || !t2 || !t3 || !density || !width) return null
  return {
    density_t_m3: density,
    layingWidth_m: width,
    thickness_cm: { type_i: t1, type_ii: t2, type_iii: t3 } as Partial<Record<StageKey, number>>,
  }
}
