// Fake-data generator for Blueprint.
// Writes src/data/segments.geojson and src/data/worklog.json, then prints
// a validation summary (stage spread, stalled, violations, reconciliation)
// so a reviewer can see the planted anomalies without opening the app.
//
//   npm run gen
//
// Seeded PRNG → identical output for a given run date. Dates are placed
// relative to "today" so stalled/active distinctions stay meaningful
// whenever the data is regenerated.

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ── Stage order: keep in sync with src/config/stages.ts (the app's
// single source of truth; duplicated here only because this script runs
// outside the TS build). ──
const STAGES = [
  'not_started', 'excavation', 'pipelaying', 'backfill',
  'temporary_asphalt', 'milling', 'type_i', 'type_ii', 'type_iii',
]
const COMPLETE = STAGES.length - 1

// ── Seeded PRNG (mulberry32) ──
let seed = 0xc0ffee
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

// ── Time helpers (whole days, ISO dates) ──
const DAY = 86400000
const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => iso(new Date(today.getTime() - n * DAY))
const TODAY = iso(today)

// ── Geometry: plausible grid near 29.30 N, 48.05 E (Kuwait) ──
const M_PER_DEG_LAT = 111320
const M_PER_DEG_LNG = 111320 * Math.cos((29.3 * Math.PI) / 180)

// One street = a centreline cut into 100 m segments; the tail keeps its
// true remainder length (never merged, never padded).
// dir: "ew" (grows east) | "ns" (grows north). bend only on the arterial.
function streetPoint(street, ch) {
  const dLng = street.dir === 'ew' ? ch / M_PER_DEG_LNG : 0
  const dLat = street.dir === 'ns' ? ch / M_PER_DEG_LAT : 0
  const bend = street.bend
    ? Math.sin((ch / street.length) * Math.PI) * street.bend
    : 0
  return [
    +(street.lng + dLng).toFixed(6),
    +(street.lat + dLat + bend).toFixed(6),
  ]
}
function segmentLine(street, from, to) {
  const pts = [streetPoint(street, from)]
  for (let ch = from + 50; ch < to; ch += 50) pts.push(streetPoint(street, ch))
  pts.push(streetPoint(street, to))
  return pts
}

// ── Street plan ──
// schedule: "complete"  → all 9 stages done, finished a while back
//           "active"    → mid-works, last pass 2..10 days ago
//           "stalled"   → mid-works, last pass 20..45 days ago (planted)
//           "untouched" → no worklog rows at all
//           "wave"      → arterial: chainage-staggered depth per run
const STREETS = [
  // Block 3 — E-W internal streets
  { slug: 'bayan-3-st11', name: 'Street 11', block: '3', lat: 29.3058, lng: 48.042, dir: 'ew', length: 420, width: 8, target: 8, schedule: 'complete' },
  { slug: 'bayan-3-st12', name: 'Street 12', block: '3', lat: 29.30665, lng: 48.042, dir: 'ew', length: 380, width: 8, target: 5, schedule: 'active' },
  { slug: 'bayan-3-st13', name: 'Street 13', block: '3', lat: 29.3075, lng: 48.042, dir: 'ew', length: 350, width: 7, target: 3, schedule: 'stalled' },
  { slug: 'bayan-3-st14', name: 'Street 14', block: '3', lat: 29.30835, lng: 48.042, dir: 'ew', length: 310, width: 7, target: 2, schedule: 'active' },
  // Block 5 — N-S internal streets
  { slug: 'bayan-5-st21', name: 'Street 21', block: '5', lat: 29.3016, lng: 48.056, dir: 'ns', length: 520, width: 9, target: 5, schedule: 'active' },
  { slug: 'bayan-5-st22', name: 'Street 22', block: '5', lat: 29.3016, lng: 48.05695, dir: 'ns', length: 450, width: 8, target: 4, schedule: 'active' },
  { slug: 'bayan-5-st23', name: 'Street 23', block: '5', lat: 29.3016, lng: 48.0579, dir: 'ns', length: 400, width: 8, target: 3, schedule: 'active' },
  { slug: 'bayan-5-st24', name: 'Street 24', block: '5', lat: 29.3016, lng: 48.05885, dir: 'ns', length: 330, width: 7, target: 0, schedule: 'untouched' },
  // Block 9 — E-W internal streets
  { slug: 'bayan-9-st31', name: 'Street 31', block: '9', lat: 29.2946, lng: 48.0468, dir: 'ew', length: 430, width: 8, target: 6, schedule: 'active' },
  { slug: 'bayan-9-st32', name: 'Street 32', block: '9', lat: 29.29375, lng: 48.0468, dir: 'ew', length: 300, width: 7, target: 1, schedule: 'active' },
  { slug: 'bayan-9-st33', name: 'Street 33', block: '9', lat: 29.2929, lng: 48.0468, dir: 'ew', length: 260, width: 7, target: 5, schedule: 'stalled' },
  // Arterial — long, gently curved, staggered progression (the money shot)
  { slug: 'arterial-r40', name: 'Route 40', block: 'Arterial', lat: 29.2988, lng: 48.0398, dir: 'ew', length: 1650, width: 14, target: 8, schedule: 'wave', bend: 0.0006 },
]

// ── 1. Segments ──
const features = []
const segmentsByStreet = new Map()
for (const street of STREETS) {
  const segs = []
  for (let from = 0; from < street.length; from += 100) {
    const to = Math.min(from + 100, street.length)
    const id = `${street.slug}-${String(from).padStart(4, '0')}`
    segs.push(id)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: segmentLine(street, from, to) },
      properties: {
        id,
        street: street.name,
        block: street.block,
        governorate: 'Hawalli',
        from_ch: from,
        to_ch: to,
        length_m: to - from,
        width_m: street.width,
        notes: '',
      },
    })
  }
  segmentsByStreet.set(street.slug, segs)
}
const segLength = new Map(features.map((f) => [f.properties.id, f.properties.length_m]))

// ── 2. Worklog ──
// Works are scheduled backwards from each street's last pass: stage T on
// lastPass day, stage T-1 one gap earlier, and so on. Each stage pass is
// split into reports of 2-5 adjacent segments (same stage, same date).
const worklog = []
const CREWS = ['Crew A', 'Crew B', 'Crew C', 'Crew D']
const NOTES = ['night shift', 'partial lane closure', 'MEW clearance received', 'weather delay recovered']
let reportSeq = 0
let rowSeq = 0

function chunkRuns(segIds) {
  const runs = []
  let i = 0
  while (i < segIds.length) {
    const n = Math.min(randInt(2, 5), segIds.length - i)
    runs.push(segIds.slice(i, i + n))
    i += n
  }
  return runs
}

function logPass(segIds, stageIdx, date) {
  for (const run of chunkRuns(segIds)) {
    reportSeq++
    const reportId = `RPT-${String(reportSeq).padStart(4, '0')}`
    const qty = Math.round(run.reduce((a, id) => a + segLength.get(id), 0) / 10) * 10
    const crew = pick(CREWS)
    for (const segId of run) {
      rowSeq++
      worklog.push({
        id: `wl-${String(rowSeq).padStart(4, '0')}`,
        report_id: reportId,
        segment_id: segId,
        stage: STAGES[stageIdx],
        date,
        reported_qty: qty,
        crew,
        ...(rand() < 0.08 ? { note: pick(NOTES) } : {}),
      })
    }
  }
}

// Stage T lands on `lastDaysAgo`; earlier stages step back 4-16 days each.
function scheduleStreet(segIds, target, lastDaysAgo) {
  let day = lastDaysAgo
  const passDays = []
  for (let s = target; s >= 1; s--) {
    passDays[s] = day
    day += randInt(4, 16)
  }
  for (let s = 1; s <= target; s++) logPass(segIds, s, daysAgo(passDays[s]))
}

for (const street of STREETS) {
  const segs = segmentsByStreet.get(street.slug)
  if (street.schedule === 'untouched') continue
  if (street.schedule === 'complete') scheduleStreet(segs, COMPLETE, randInt(15, 55))
  if (street.schedule === 'active') scheduleStreet(segs, street.target, randInt(2, 10))
  if (street.schedule === 'stalled') scheduleStreet(segs, street.target, randInt(20, 45))
  if (street.schedule === 'wave') {
    // East-to-west wave: leading runs are complete, trailing runs early.
    const runTargets = [8, 7, 5, 3, 2]
    const runSize = Math.ceil(segs.length / runTargets.length)
    runTargets.forEach((t, i) => {
      const run = segs.slice(i * runSize, (i + 1) * runSize)
      if (!run.length) return
      const last = t === COMPLETE ? randInt(12, 40) : randInt(2, 9)
      scheduleStreet(run, t, last)
    })
  }
}

// Mark planted stalled segments' latest row so the anomaly is explainable.
for (const street of STREETS.filter((s) => s.schedule === 'stalled')) {
  const segs = segmentsByStreet.get(street.slug)
  const latest = worklog
    .filter((r) => segs.includes(r.segment_id) && STAGES.indexOf(r.stage) === street.target)
  latest.forEach((r) => { r.note = 'on hold — service clash' })
}

// ── 3. Planted anomalies ──
// Sequence violations: for two mid-progress segments, swap the dates of
// two of their rows so a later stage is logged before an earlier one.
const violationTargets = ['bayan-3-st11-0100', 'arterial-r40-0400']
for (const segId of violationTargets) {
  const rows = worklog
    .filter((r) => r.segment_id === segId)
    .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage))
  const a = rows.find((r) => STAGES.indexOf(r.stage) === 5) // milling
  const b = rows.find((r) => STAGES.indexOf(r.stage) === 7) // type_ii
  if (a && b) { const d = a.date; a.date = b.date; b.date = d }
}

// Reconciliation divergence: three reports whose reported_qty strays from
// the summed segment length by well over 10%.
const divergentReports = []
const reportIds = [...new Set(worklog.map((r) => r.report_id))]
const chosen = [reportIds[3], reportIds[Math.floor(reportIds.length / 2)], reportIds[reportIds.length - 4]]
const factors = [1.35, 0.55, 1.2]
chosen.forEach((rid, i) => {
  divergentReports.push(rid)
  worklog.filter((r) => r.report_id === rid).forEach((r) => {
    r.reported_qty = Math.round(r.reported_qty * factors[i])
  })
})

// Chronological order (append-only log would arrive roughly date-ordered).
worklog.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))

// ── 4. Write files ──
const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'src', 'data')
mkdirSync(dataDir, { recursive: true })
writeFileSync(join(dataDir, 'segments.geojson'), JSON.stringify({ type: 'FeatureCollection', features }, null, 1))
writeFileSync(join(dataDir, 'worklog.json'), JSON.stringify(worklog, null, 1))

// ── 5. Validation summary ──
const stageOf = (segId, asOf) => {
  let hi = 0
  for (const r of worklog) {
    if (r.segment_id !== segId || r.date > asOf) continue
    const i = STAGES.indexOf(r.stage)
    if (i > hi) hi = i
  }
  return hi
}
const counts = Array(STAGES.length).fill(0)
const stalled = []
for (const f of features) {
  const id = f.properties.id
  const s = stageOf(id, TODAY)
  counts[s]++
  if (s > 0 && s < COMPLETE) {
    const last = worklog.filter((r) => r.segment_id === id).map((r) => r.date).sort().pop()
    const age = Math.round((today.getTime() - new Date(last).getTime()) / DAY)
    if (age > 14) stalled.push(`${id} (stage ${STAGES[s]}, ${age}d)`)
  }
}
const violations = []
for (const f of features) {
  const rows = worklog.filter((r) => r.segment_id === f.properties.id).sort((a, b) => (a.date < b.date ? -1 : 1))
  let hi = 0
  for (const r of rows) {
    const i = STAGES.indexOf(r.stage)
    if (i < hi) { violations.push(f.properties.id); break }
    hi = i
  }
}
console.log(`segments : ${features.length} across ${STREETS.length} streets`)
console.log(`worklog  : ${worklog.length} rows in ${reportIds.length} reports`)
console.log(`stage spread (today): ${counts.map((n, i) => `${STAGES[i]}=${n}`).join('  ')}`)
console.log(`stalled  : ${stalled.length}\n  ${stalled.join('\n  ')}`)
console.log(`sequence violations: ${violations.join(', ') || 'none'}`)
console.log(`divergent reports  : ${divergentReports.join(', ')}`)
