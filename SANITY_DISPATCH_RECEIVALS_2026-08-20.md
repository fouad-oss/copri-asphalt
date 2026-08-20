# Dispatch & receival sanity check — 2026-08-20

Read-only sweep of `dispatch_loads` (1,375), `receipts` (1,011), `material_receipts` (177)
via the anon REST API (Open Items: "Sanity-check dispatches & receivals"). No writes.

## Verdict

The core machinery is **clean**: zero orphan receipts, zero double receipts,
zero null/zero dispatch weights, zero arrival-vs-dispatched weight gaps > 1 t,
zero receipts timestamped before their dispatch, zero future timestamps,
every dispatch status agrees with its latest receipt decision, and every
material capture has qty + photo + project/site. The findings below are
process backlogs and historical data quirks, not pipeline defects.

## Findings

### 1. Copri receipt-confirmation backlog: 101 loads (action: site engineers)
1,011 of 1,375 dispatches are receipt-confirmed. Of the 364 `dispatched_not_received`,
**263 are المد الأخضر (Green Line)** — an external plant customer whose loads never get
QR confirmations; that is their normal terminal state. The real backlog is **101 Copri
loads**: 99 on كوبري — صيانة حولي (oldest from 2026-06-18, سلوى) and just 2 on the
Expressway. Expressway discipline is excellent; Hawally needs a nudge — unconfirmed
notes can never bundle.

### 2. Materials daily batch has never run: 177 captures pending (action: accounting)
All 177 material receipts sit at `not_received` (= captured, pending the daily batch),
158 of them older than 7 days, all on كوبري — صيانة حولي. The accountant daily-batch
screen (map-to-PO-line + approve) is waiting on the accounting go-live
(Jimmy's login → bundle trial). Until then no material can bundle.

### 3. Historical note-number quirks (informational, June–July era)
- `12518` (2026-06-23) and `12613700` (2026-07-07) — two notes that don't fit the
  125xxx–127xxx serial band; look like a dropped/extra digit on manually entered rows.
- Nine `-2`-suffixed notes (`126193-2` … `126201-2`, all 2026-07-11, round 30-min
  timestamps) — a hand-entered recovery batch; distinct keys, harmless.
- Serial gaps exist (e.g. 493 between 125066→125560) — consistent with the serial
  continuing the old carbon-book numbering across unrecorded paper books; no gaps at
  all since the React cutover era.

### 4. Minor, plausible
- 5 loads under 5 t (1–4 t) — small patch loads, all named mixes.
- 4 same-truck dispatch pairs under 10 min apart — consistent with clerk batch entry.

## Suggested actions
1. Ask the Hawally site engineers to work through the 99 unconfirmed notes
   (engineer home at app.copri.com/app/dispatch/engineer lists their pending loads).
2. Land the accounting go-live so the daily batch drains the 177 material captures.
3. Optionally correct the two off-band note numbers in the Table Editor if the paper
   books identify them (12518 → ?, 12613700 → likely 126137 — verify first).
