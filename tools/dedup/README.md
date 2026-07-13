# Master-data dedup tool (`tools/dedup/`)

Merge-and-map, never delete — **the tool proposes, a human disposes; zero
auto-merges** (spec: `CLAUDE_CODE_BRIEF_commitment_pipeline-v2.md`, appendix).

Stdlib + openpyxl only. Config-driven per master via `masters.json`
(`vendors` today, `items` ready for when Fouad's item export lands).

## The three stages

```
python tools/dedup/dedup.py propose --master vendors
# → Accounting raw data/output/dedup-review-vendors.xlsx  (human review)
# → Accounting raw data/output/dedup-propose-vendors-report.md

(stage 2 is the human: fill DECISION columns in Excel)

python tools/dedup/dedup.py apply --master vendors
# → Accounting raw data/output/dedup-apply-vendors.sql    (paste in Supabase SQL editor)
# → Accounting raw data/output/retirement-checklist.xlsx  (for finance)
# → Accounting raw data/output/dedup-apply-vendors-report.md
```

Optional flags: `--export FILE` (default: newest `Vendors*.xlsx` in
`Accounting raw data/spectronova/`), `--review FILE` (default: repo-root
`COPRI_dedup_review.xlsx` if present — the workbook the accountant is
already filling — else `output/dedup-review-vendors.xlsx`), `--run-ts ISO`
(provenance timestamp override; fixing it makes re-runs byte-identical).

## What propose does

1. **Classify** every record — `test` / `non-vendor` (internal org units,
   cost-center rows, GL concepts, COPRI itself) / `foreign-demo` / `vendor`.
   A *suggestion*, confirmable on the EXCLUSIONS sheet, never auto-applied.
2. **Normalize** names into a match key: casefold, strip tatweel/tashkeel,
   unify Arabic variants (ة→ه, ى→ي, أ/إ/آ→ا), drop legal-suffix tokens
   (Co, W.L.L., ذ.م.م, Est., شركة …) but **keep business words** (Trading,
   Contracting, Transport) — they distinguish real entities.
3. **Cluster**: exact key, then fuzzy token-set similarity (difflib) in two
   bands — ≥ 92 clusters as a suggested merge, 80–92 goes to POSSIBLE
   MATCHES for careful review. Hard evidence (same phone / CR / email /
   AR account, where the export has such columns) promotes a pair to high
   confidence and can bridge English↔Arabic spellings.
4. **Suggest a survivor** per cluster: most invoice history (joined by
   vendor name against the `Supplier Invoice (AP)*.xlsx` exports), then
   field completeness, then lowest contact ID.

Cluster IDs are a hash of the member IDs — **deterministic across re-runs**,
so a partially-filled review survives a re-propose.

## The review workbook format

Propose emits the **same layout as `COPRI_dedup_review.xlsx`** (the de-facto
format): sheets READ ME / CLUSTERS / POSSIBLE MATCHES / EXCLUSIONS / ITEMS,
with dropdowns on the DECISION columns. Apply consumes either file.

- CLUSTERS DECISION: `MERGE` / `SURVIVOR` / `KEEP SEPARATE` / `EXCLUDE`
- POSSIBLE MATCHES DECISION: `MERGE` / `KEEP SEPARATE`
- EXCLUSIONS DECISION: `CONFIRM EXCLUDE` / `KEEP`
- **Blank = undecided** → the record passes through as a standalone
  canonical vendor and is listed on the UNDECIDED sheet of the checklist.
  Finish the review later and re-run apply — the guards make the second
  run additive-only.

## What apply emits

Targets the 0013 schema (`vendors` with its unique index on
`vendor_norm(name)`, plus `vendor_spectronova_ids`) — no parallel schema.

- One canonical vendor per decided group (survivor's name, kind
  `supplier`, provenance in `notes`), guarded `where not exists` on
  `vendor_norm(name)` — **idempotent, safe to run twice**.
- One mapping row per old contact ID → its canonical vendor; the
  survivor's own ID is unflagged, merged duplicates are `flagged = true`.
  Guarded on `contact_id` so an ID can never be double-mapped.
- Exclusions map to a single quarantine vendor
  (`ZZ — QUARANTINE — excluded ERP contacts`, kind `other`, inactive,
  created by the SQL if missing) so historical imports referencing a
  retired ERP contact resolve instead of crashing — reported, not posted.
- `retirement-checklist.xlsx` for finance: MERGED losers (mark inactive in
  SpectroNova or rename `ZZ — DO NOT USE — see <survivor>`), EXCLUDED,
  UNDECIDED.

**Round-trip acceptance is asserted in code**: every input contact ID
(union of the review workbook and the vendor export — the workbook covers
an older, larger contact universe than the current 625-row export) lands in
exactly one of {canonical primary, mapped duplicate, excluded→quarantine,
undecided}; any residual or overlap aborts the run.

## Items master

`apply --master items` is LIVE against the 0020 schema (`items` with its
unique index on `vendor_norm(name)` + `item_spectronova_ids`). It reads the
ITEMS sheet of the review workbook (a class/UOM review, not a duplicate
review — no merges): DECISION exclude-words → quarantine item
(`ZZ — QUARANTINE — excluded ERP items`); confirm-words → canonical with
the suggested UOM; any other text is the **corrected UOM**; blank =
undecided → canonical with the suggested UOM, listed on
`retirement-checklist-items.xlsx`. Both `ItemCode` and the distinct
`ItemID` are mapped into `item_spectronova_ids` (guarded on `item_code`).
Outputs: `dedup-apply-items.sql` (run AFTER migration 0020),
`retirement-checklist-items.xlsx`, `dedup-apply-items-report.md`.

`propose --master items` still needs the SpectroNova item export (UOM
equivalence and dimension patterns like `5/10` / `5-10` / `5 to 10 mm` are
already configured) — it says so and exits; item merge clusters arrive
then. Do not block on it (per the brief).

## Rules honored

- Raw inputs are read-only company books — all outputs go to
  `Accounting raw data/output/`.
- Console output is cp1252-safe ASCII (Arabic lives in the xlsx/md files).
- Nothing is ever deleted or updated by the SQL — inserts only, all guarded.
