# Blueprint — interactive road works map

Single-page app showing COPRI road works as an interactive "blueprint"
map: every street is cut into 100 m segments, each colored by its current
work stage, with a time slider that scrubs the whole network through
history.

## Asphalt pilot (current mode)

Real everything: geometry is OSM street centerlines + قطعة boundaries for
every area the dispatch data touches (`npm run extract` →
`src/data/real/`), and the "worklog" is projected live from the main
app's `dispatch_loads` table (stage = highest mix type delivered:
Type I → II → III = surfaced). Dispatch locations resolve to street
units (site|block|street, comma lists split, named streets normalized);
a location with no street match colors its block boundary instead, and
anything unmatchable is listed in the "خارج الخريطة" tile. A bundled
snapshot keeps the app working offline. The 9-stage civil-works profile
returns when worklog entry (multi-select tool) exists — only
`src/config/stages.ts` and the adapter change.

## Stack

Vite + React + TypeScript · MapLibre GL JS · Tailwind (layout only) ·
Zustand (single store). All data from local files in `src/data/`.

## Run

```
npm install
npm run gen    # regenerate fake data (seeded; summary printed)
npm run dev
```

## Data model

Three things. **Segment** is geometry, **WorkLog** is events, **stage is
always derived — never stored.**

- `src/config/stages.ts` — THE ordered stage list (`not_started` …
  `type_iii`). Colors, progress rail, filters, and violation detection all
  derive from it. Do not hardcode a stage name anywhere else.
- `src/data/segments.geojson` — fixed 100 m segments (the last segment of
  a street keeps its true remainder length; never merged, never padded).
  No stage field, by design.
- `src/data/worklog.json` — flat append-only rows
  `{ id, report_id, segment_id, stage, date, reported_qty?, crew?, note? }`.
  `reported_qty` is the whole report's stated quantity, repeated verbatim
  per row — never apportioned.
- `src/lib/derive.ts` — `currentStage(worklog, segmentId, asOfDate)`: the
  highest-index stage logged on or before the date. The time slider is
  nothing more than changing `asOfDate`.

The generator (`scripts/generate-data.mjs`) plants deliberate anomalies —
stalled segments, sequence violations, reports whose quantity diverges
from the summed segment length — and prints them on every run.

## Build order (stop for review after each step)

1. ✅ Repo scaffold + stage config + fake data generator
2. ✅ Map view with static coloring at a fixed date
3. ✅ Detail panel + progress rail
4. ✅ Time slider
5. ✅ Insight strip + filters
6. ✅ Visual polish pass

## Explicitly NOT in scope (do not build yet)

- **Multi-select input** — box-select N adjacent segments on the map,
  apply one stage + one date, write N worklog rows. This is the
  field-entry ergonomics that makes 100 m segments viable, and it is the
  next thing to build after this brief is done — but not now.
- Real geometry (traced from satellite / OSM). Fake data only.
- Backend, auth, persistence (no localStorage / sessionStorage either).
