// Real-geometry extraction for Blueprint (asphalt pilot).
// Pulls Kuwait block (قطعة) boundaries + street centerlines from OSM for
// every area the live dispatch data touches, chains split ways, cuts true
// 100 m segments, and writes:
//   src/data/real/segments.geojson   street segments (unit = matchable key)
//   src/data/real/blocks.geojson     block boundary polygons
//   src/data/real/dispatch-snapshot.json   offline fallback of dispatch_loads
//
//   node scripts/extract-osm.mjs
//
// Overpass is queried once per area with retries + spacing (be polite).

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SUPABASE_URL = 'https://abwsxqnppihrmkhydkai.supabase.co'
const SUPABASE_KEY = 'sb_publishable_4k0seyEmCwB-9oI1krpvKQ_VBDwuNgE'

// Dispatch-site vocabulary → OSM area. bbox = [s, w, n, e].
// COPRI-only pilot (user decision): the contract-9 areas — Copri's own
// dispatches go exclusively to بيان/مشرف/سلوى. External-client areas
// (Green Line etc.) are out of scope.
const AREAS = [
  { site: 'بيان', code: 'bayan', match: /بيان/, bbox: [29.29, 48.025, 29.318, 48.062] },
  { site: 'مشرف', code: 'mishref', match: /مشرف/, bbox: [29.266, 48.048, 29.3, 48.095] },
  { site: 'سلوى', code: 'salwa', match: /سلوى/, bbox: [29.266, 48.055, 29.313, 48.108] },
]

// Number aliases for streets that were renamed after people in OSM while
// clerks still dispatch by the old numbers. Identified via Google Maps
// anchors 2026-07-12: "57 Rd" lands 23 m from شارع خالد يوسف أبو مطاوع,
// "Road 59" lands 7 m from شارع سليمان ناصر المرشود. `match` runs against
// the NORMALISED street name.
const NUM_ALIASES = [
  { site: 'مشرف', num: '57', match: /ابومطاوع/ },
  { site: 'مشرف', num: '59', match: /المرشود/ },
]

// Motorways clerks dispatch to with كيلومتر ranges. Extracted Kuwait-wide
// by ref and cut into 100 m segments whose chainage approximates the road
// km posts (origin = the route's northern end, the Kuwait City side).
// Each segment is its own unit (`site|km|<from_m>`) so a km range colors
// exactly the pieces it covers. NOTE: like ش57/59, OSM renamed route 30
// after a person (طريق الملك عبد العزيز…) — clerks still say الفحيحيل.
const HIGHWAY_ROUTES = [
  { site: 'طريق الفحيحيل', code: 'rt30', ref: '30', bbox: [28.6, 47.8, 29.45, 48.35] },
  { site: 'طريق الملك فهد', code: 'rt40', ref: '40', bbox: [28.5, 47.5, 29.45, 48.35] },
]

const HIGHWAYS = 'residential|tertiary|secondary|primary|unclassified|living_street'
const WIDTHS = { motorway: 22, trunk: 18, primary: 18, secondary: 15, tertiary: 12, residential: 8, unclassified: 8, living_street: 6 }
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overpass(query, label) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // overpass-api.de returns 406 without a proper UA + Accept
          'User-Agent': 'copri-blueprint/1.0 (contact: fszoghby@gmail.com)',
          Accept: 'application/json',
        },
      })
      const text = await res.text()
      if (text.trimStart().startsWith('{')) return JSON.parse(text)
      console.log(`  ${label}: non-JSON from ${new URL(url).host} (attempt ${attempt + 1}) — backing off`)
    } catch (e) {
      console.log(`  ${label}: ${e.message} (attempt ${attempt + 1})`)
    }
    await sleep(20000 + attempt * 15000)
  }
  throw new Error(`overpass failed: ${label}`)
}

// ── geometry helpers ──
const R = 6371000
const rad = (d) => (d * Math.PI) / 180
function dist(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function pointInRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const round6 = (c) => [+c[0].toFixed(6), +c[1].toFixed(6)]

// ── name normalisation — MUST mirror src/lib/asphalt.ts ──
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' }
function normName(s) {
  return String(s || '')
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d])
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/شارع|طريق|street|road/gi, '')
    .replace(/\bال/g, '')
    .replace(/[\s\-_.']/g, '')
    .toLowerCase()
}
function streetNum(s) {
  const m = String(s || '').replace(/[٠-٩]/g, (d) => AR_DIGITS[d]).match(/\d+/)
  return m ? String(parseInt(m[0], 10)) : null
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', 'src', 'data', 'real')
  mkdirSync(outDir, { recursive: true })

  const blockFeatures = []
  const segFeatures = []
  const seenBlockOsm = new Set()
  const areaRecs = [] // {area, suburbRings, blocks} — streets assigned globally after all fetches
  const wayPool = new Map() // way id → way, deduped across overlapping area bboxes
  let streetsTotal = 0

  for (const area of AREAS) {
    const [s, w, n, e] = area.bbox
    const bbox = `${s},${w},${n},${e}`
    const q = `[out:json][timeout:120];(
      relation["boundary"="administrative"]["admin_level"="6"](${bbox});
      relation["boundary"="administrative"]["admin_level"="7"](${bbox});
      way["highway"~"^(${HIGHWAYS})$"](${bbox});
    );out geom;`
    console.log(`fetching ${area.site} …`)
    const data = await overpass(q, area.site)
    await sleep(8000)

    // suburb boundary (admin_level 6) — ownership test for blocks and
    // streets, so overlapping query bboxes can't steal the neighbour's.
    const suburbRings = []
    for (const el of data.elements) {
      if (el.type !== 'relation' || el.tags?.admin_level !== '6') continue
      const name = el.tags['name:ar'] || el.tags.name || ''
      if (!area.match.test(name)) continue
      const rings = (el.members || [])
        .filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry)
        .map((m) => m.geometry.map((g) => round6([g.lon, g.lat])))
      if (rings.length) suburbRings.push(chainRings(rings))
    }
    // Blocks lie fully INSIDE their suburb, so no edge tolerance — a single
    // midpoint with the 150 m fallback let border blocks (سلوى ق7 sits on
    // the مشرف line) be stolen or dropped. Majority vote over sampled ring
    // points is robust to boundary imprecision both ways.
    const ownsBlock = (ring) => {
      if (!suburbRings.length) return true
      const step = Math.max(1, Math.floor(ring.length / 9))
      let inside = 0
      let total = 0
      for (let i = 0; i < ring.length; i += step) {
        total++
        if (suburbRings.some((r) => pointInRing(ring[i], r))) inside++
      }
      return inside > total / 2
    }

    // blocks: relation outer rings, named "… قطعة N"
    const blocks = []
    for (const el of data.elements) {
      if (el.type !== 'relation' || seenBlockOsm.has(el.id)) continue
      if (el.tags?.admin_level === '6') continue
      const name = (el.tags && (el.tags['name:ar'] || el.tags.name)) || ''
      const numM = name.match(/قطعة\s*([0-9٠-٩]+)/)
      if (!numM) continue
      // explicit other-suburb prefix → not ours; else the boundary decides
      const named = AREAS.find((a) => a.match.test(name))
      if (named && named.site !== area.site) continue
      // a prefix naming ANY other suburb (e.g. "الرميثية - قطعة 3") → skip
      const prefix = name.split('قطعة')[0].replace(/[-–—]/g, '').trim()
      if (prefix && !area.match.test(prefix)) continue
      const num = String(parseInt(numM[1].replace(/[٠-٩]/g, (d) => AR_DIGITS[d]), 10))
      const rings = (el.members || [])
        .filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry)
        .map((m) => m.geometry.map((g) => round6([g.lon, g.lat])))
      if (!rings.length) continue
      // join member ways into one outer ring (greedy endpoint chaining)
      const ring = chainRings(rings)
      if (ring.length < 4) continue
      if (!named && !ownsBlock(ring)) continue // neighbour's — their query claims it
      seenBlockOsm.add(el.id)
      blocks.push({ num, ring })
      blockFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: ring },
        properties: { site: area.site, block: num, unit: `${area.site}|${num}|*`, name },
      })
    }

    // streets — pool ALL candidate ways; ownership is decided globally
    // after every area is fetched. Per-area claiming (first-fetch-wins +
    // 150 m edge tolerance) let مشرف claim streets sitting INSIDE سلوى
    // ق12, and bbox clipping let سلوى claim بيان's eastern جادات.
    for (const el of data.elements) {
      if (el.type !== 'way' || !el.tags?.highway || !el.geometry || wayPool.has(el.id)) continue
      const coords = el.geometry.map((g) => round6([g.lon, g.lat]))
      if (coords.length < 2) continue
      wayPool.set(el.id, {
        id: el.id,
        coords,
        mid: coords[Math.floor(coords.length / 2)],
        highway: el.tags.highway,
        rawName: (el.tags['name:ar'] || el.tags.name || '').trim(),
      })
    }
    areaRecs.push({ area, suburbRings, blocks })
    console.log(`  ${area.site}: blocks ${blocks.length} · pooled ways ${wayPool.size}`)
  }

  // ── global street ownership ──
  // The suburb polygon that CONTAINS a way's midpoint wins. Only ways
  // contained by no polygon (true boundary roads on the line, like
  // خالد بن عبدالعزيز) fall back to the nearest boundary within 150 m.
  const assignedWays = new Map(areaRecs.map((r) => [r.area.site, []]))
  for (const w of wayPool.values()) {
    let owner = areaRecs.find((r) => r.suburbRings.some((ring) => pointInRing(w.mid, ring)))
    if (!owner) {
      let bestD = 150
      for (const r of areaRecs) {
        for (const ring of r.suburbRings) {
          for (const rp of ring) {
            const d = dist(w.mid, rp)
            if (d < bestD) { bestD = d; owner = r }
          }
        }
      }
    }
    if (!owner) {
      // area with no OSM boundary at all — its bbox is the best we have
      owner = areaRecs.find((r) => {
        const [s, wst, n, e] = r.area.bbox
        return !r.suburbRings.length && w.mid[1] >= s && w.mid[1] <= n && w.mid[0] >= wst && w.mid[0] <= e
      })
    }
    if (owner) assignedWays.get(owner.area.site).push(w)
  }

  for (const rec of areaRecs) {
    const { area, blocks } = rec
    const wayList = assignedWays.get(area.site)
    // Grouping rules (each group = one street unit):
    //  - numbered streets (شارع N) are BLOCK-scoped — ش1 in ق1 ≠ ش1 in ق2
    //  - جادات are their own units ("شارع 3 جادة 2" is a lane of ش3, NOT
    //    ش3 itself — streetNum would grab the 3 and swallow the lane);
    //    they carry no street_num so "ق5 ش3" can never match them
    //  - proper-named streets merge SITE-wide — main roads cross blocks
    //    (ش57 previously fragmented into ق3/ق4/بلا with restarting chainage)
    const groups = new Map()
    for (const w of wayList) {
      const { coords, mid, rawName } = w
      const blk = blocks.find((b) => pointInRing(mid, b.ring))
      const blkNum = blk ? blk.num : ''
      const isJada = /جاد[ةه]/.test(rawName)
      const nn = rawName ? normName(rawName) : ''
      let num = null
      let key
      let jtok = null
      if (isJada) {
        const digits = String(rawName).replace(/[٠-٩]/g, (d) => AR_DIGITS[d]).match(/\d+/g)
        jtok = `j${digits ? digits.join('-') : nn}`
        key = `${blkNum}|${jtok}`
      } else {
        num = streetNum(rawName)
        key = num ? `${blkNum}|${num}` : nn ? `~|${nn}` : `${blkNum}|w${w.id}`
      }
      const g = groups.get(key) || {
        blocks: new Set(),
        name: rawName,
        num,
        norm: nn,
        jtok,
        width: WIDTHS[w.highway] || 8,
        ways: [],
      }
      g.blocks.add(blkNum)
      g.width = Math.max(g.width, WIDTHS[w.highway] || 8)
      if (!g.name && rawName) g.name = rawName
      g.ways.push(coords)
      groups.set(key, g)
    }
    // a group's block: the single block it lives in, or '' when it spans
    for (const g of groups.values()) {
      const set = [...g.blocks].filter(Boolean)
      g.block = set.length === 1 && g.blocks.size === 1 ? set[0] : ''
    }

    // apply number aliases (renamed streets clerks know by number)
    for (const ov of NUM_ALIASES.filter((o) => o.site === area.site)) {
      let hits = 0
      for (const g of groups.values()) {
        if (g.name && ov.match.test(normName(g.name))) {
          g.num = ov.num
          g.name = `${g.name} (${ov.num})`
          hits++
        }
      }
      console.log(`  alias شارع ${ov.num} → ${hits} street group(s)`)
    }

    let areaSegs = 0
    let gIdx = 0
    for (const g of groups.values()) {
      // Order disjoint chains by proximity and CONTINUE the chainage across
      // them — one street = one monotonic chainage. Ids are unique by
      // construction (they used to collide: every chain of a numbered
      // street restarted at ch 0 under the same st-token).
      const chains = orderChains(chainWays(g.ways))
      streetsTotal++
      gIdx++
      const stok = g.jtok ? g.jtok : g.num ? `st${g.num}` : g.norm ? `n${gIdx}` : `u${gIdx}`
      const unit = g.name ? `${area.site}|${g.block}|${g.num || g.norm}` : null
      let ch = 0
      for (const chain of chains) {
        areaSegs += cutSegments(chain, {
          site: area.site,
          code: area.code,
          block: g.block,
          street: g.name || '',
          street_num: g.num || '',
          unit,
          width: g.width,
          stok,
          startCh: ch,
        }, segFeatures)
        // next chain starts on the next clean 100 m boundary
        ch = Math.max(Math.ceil((ch + Math.round(chainLen(chain))) / 100) * 100, ch + 100)
      }
    }
    console.log(`  ${area.site}: streets ${wayList.length} ways → ${groups.size} groups · segments +${areaSegs}`)
  }

  // ── motorways dispatched by km range ──
  for (const route of HIGHWAY_ROUTES) {
    const [s, w, n, e] = route.bbox
    const q = `[out:json][timeout:180];(
      way["highway"~"^(motorway|trunk)$"]["ref"="${route.ref}"](${s},${w},${n},${e});
    );out geom;`
    console.log(`fetching ${route.site} (ref ${route.ref}) …`)
    const data = await overpass(q, route.site)
    await sleep(8000)
    const ways = []
    let name = ''
    for (const el of data.elements) {
      if (el.type !== 'way' || !el.geometry) continue
      ways.push(el.geometry.map((g) => round6([g.lon, g.lat])))
      if (!name) name = (el.tags['name:ar'] || el.tags.name || '').trim()
    }
    if (!ways.length) { console.log(`  ${route.site}: NO ways found — skipped`); continue }
    // Chain each carriageway separately (motorway way geometry follows the
    // travel direction, so net-southbound vs net-northbound splits them) —
    // a generous tolerance must never glue the two directions into a
    // U-shaped chain at the terminus, or chainage doubles back.
    const south = ways.filter((w) => w[w.length - 1][1] <= w[0][1])
    const north = ways.filter((w) => w[w.length - 1][1] > w[0][1])
    // 300 m tolerance: interchanges break the carriageway ways apart
    const chains = [...chainWays(south, 300), ...chainWays(north, 300)].filter((c) => chainLen(c) > 500)
    // km 0 = the route's northern end (Kuwait City side)
    let origin = chains[0][0]
    for (const c of chains) for (const p of [c[0], c[c.length - 1]]) if (p[1] > origin[1]) origin = p
    let routeSegs = 0
    chains.forEach((chain, ci) => {
      if (chain[0][1] < chain[chain.length - 1][1]) chain.reverse() // north → south
      const startCh = Math.round(dist(origin, chain[0]) / 100) * 100 // straight-line offset for disjoint pieces
      routeSegs += cutSegments(chain, {
        site: route.site,
        code: route.code,
        block: '',
        street: `${route.site} (${name})`,
        street_num: '',
        unit: null, // per-segment km units — set in cutSegments via kmUnits
        kmUnits: true,
        width: 22,
        stok: `c${ci}`,
        startCh,
      }, segFeatures)
    })
    console.log(`  ${route.site}: ${chains.length} chains ("${name}") · segments +${routeSegs} · chainage تقريبي`)
  }

  // dispatch snapshot (offline fallback for the app)
  console.log('fetching dispatch snapshot …')
  const disp = await fetch(
    `${SUPABASE_URL}/rest/v1/dispatch_loads?select=note,ts,site,block,street,loc_type,mix,weight,status,plant,project,company&company=eq.${encodeURIComponent('كوبري')}&order=ts.asc&limit=10000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  ).then((r) => r.json())

  writeFileSync(join(outDir, 'segments.geojson'), JSON.stringify({ type: 'FeatureCollection', features: segFeatures }))
  writeFileSync(join(outDir, 'blocks.geojson'), JSON.stringify({ type: 'FeatureCollection', features: blockFeatures }))
  writeFileSync(join(outDir, 'dispatch-snapshot.json'), JSON.stringify(disp))
  console.log(`\nwrote ${segFeatures.length} segments · ${blockFeatures.length} blocks · ${disp.length} dispatch rows`)
  console.log(`street groups total: ${streetsTotal}`)
}

// join closed-boundary member ways into one ring
function chainRings(parts) {
  const pool = parts.map((p) => [...p])
  const ring = pool.shift()
  let guard = 0
  while (pool.length && guard++ < 500) {
    const end = ring[ring.length - 1]
    let found = -1
    let rev = false
    for (let i = 0; i < pool.length; i++) {
      if (dist(end, pool[i][0]) < 25) { found = i; rev = false; break }
      if (dist(end, pool[i][pool[i].length - 1]) < 25) { found = i; rev = true; break }
    }
    if (found < 0) break
    const part = pool.splice(found, 1)[0]
    if (rev) part.reverse()
    ring.push(...part.slice(1))
  }
  return ring
}

// join same-street ways into continuous chains (may yield several)
function chainWays(ways, tol = 20) {
  const pool = ways.map((w) => [...w])
  const chains = []
  while (pool.length) {
    const chain = pool.shift()
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]
        const head = chain[0]
        const tail = chain[chain.length - 1]
        if (dist(tail, p[0]) < tol) { chain.push(...p.slice(1)); pool.splice(i, 1); grew = true; break }
        if (dist(tail, p[p.length - 1]) < tol) { chain.push(...[...p].reverse().slice(1)); pool.splice(i, 1); grew = true; break }
        if (dist(head, p[p.length - 1]) < tol) { chain.unshift(...p.slice(0, -1)); pool.splice(i, 1); grew = true; break }
        if (dist(head, p[0]) < tol) { chain.unshift(...[...p].reverse().slice(0, -1)); pool.splice(i, 1); grew = true; break }
      }
    }
    chains.push(chain)
  }
  return chains
}

function chainLen(chain) {
  let len = 0
  for (let i = 1; i < chain.length; i++) len += dist(chain[i - 1], chain[i])
  return len
}

// Longest chain first, then greedily append whichever remaining chain
// starts (or, reversed, ends) nearest the running tail — so a street's
// disjoint pieces read in spatial order and chainage stays meaningful.
function orderChains(chains) {
  if (chains.length < 2) return chains
  const pool = [...chains].sort((a, b) => chainLen(b) - chainLen(a))
  const ordered = [pool.shift()]
  while (pool.length) {
    const tail = ordered[ordered.length - 1]
    const end = tail[tail.length - 1]
    let best = 0
    let bestD = Infinity
    let rev = false
    pool.forEach((c, i) => {
      const d0 = dist(end, c[0])
      const d1 = dist(end, c[c.length - 1])
      if (d0 < bestD) { bestD = d0; best = i; rev = false }
      if (d1 < bestD) { bestD = d1; best = i; rev = true }
    })
    const c = pool.splice(best, 1)[0]
    if (rev) c.reverse()
    ordered.push(c)
  }
  return ordered
}

// cut a chain into 100 m segments; the tail keeps its true length.
// meta.startCh offsets the chainage (disjoint motorway pieces);
// meta.kmUnits gives each segment its own unit keyed by chainage, so a
// كيلومتر dispatch range colors exactly the pieces it covers (both
// carriageways at one chainage share the unit).
function cutSegments(chain, meta, out) {
  const segLen = 100
  let segPts = [chain[0]]
  let acc = 0
  let fromCh = meta.startCh || 0
  let made = 0
  const emit = (to) => {
    const len = to - fromCh
    if (len < 1) return
    out.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: segPts },
      properties: {
        id: `${meta.code}-${meta.block || 'x'}-${meta.stok}-${String(fromCh).padStart(4, '0')}`,
        site: meta.site,
        block: meta.block,
        governorate: '',
        street: meta.street,
        street_num: meta.street_num,
        unit: meta.kmUnits ? `${meta.site}|km|${fromCh}` : meta.unit,
        from_ch: fromCh,
        to_ch: to,
        length_m: len,
        width_m: meta.width,
        notes: meta.kmUnits ? 'كيلومتراج تقريبي من بداية الطريق' : '',
      },
    })
    made++
  }
  for (let i = 1; i < chain.length; i++) {
    let a = chain[i - 1]
    const b = chain[i]
    let d = dist(a, b)
    while (acc + d >= segLen) {
      const need = segLen - acc
      const t = need / d
      const cut = round6([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      segPts.push(cut)
      emit(fromCh + segLen)
      fromCh += segLen
      segPts = [cut]
      a = cut
      d = dist(a, b)
      acc = 0
    }
    acc += d
    segPts.push(b)
  }
  emit(fromCh + Math.round(acc))
  return made
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
