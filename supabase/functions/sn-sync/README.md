# sn-sync — SpectroNova → Supabase mirror

Read-only mirror of SpectroNova purchase orders, vendors, items, stock receipts and
supplier invoices into the `sn_*` tables (migration `0064_sn_mirror.sql`).
Design + evidence: `SN_SYNC_INVESTIGATION.md`, `SN_API_FINDINGS.md` (repo root).

## Pieces

| File | Role |
|---|---|
| `core.js` | The engine — dependency-free ESM (fetch + WebCrypto). Runs under Deno *and* Node. |
| `index.ts` | Edge Function entry: auth (admin JWT or `x-sn-sync-secret`), time-boxed run, self-continuation. |
| `../../SN_SYNC_SCHEDULE.sql` | pg_cron + pg_net nightly trigger (paste after deploy). |
| `../../../scripts/sn-sync-local.mjs` | Same engine from a laptop (first backfill, ad-hoc runs). |
| `../../../scripts/sn-sync-selftest.mjs` | Offline mapper/hash tests against `sn-api-dumps/`. |

## Stages (in order)

1. **masters** — `Vendors` + `item` via Path 3 (size 200), upsert, hash compare. *(skipped in `quick` scope)*
2. **po** — ID walk of `PurchaseOrder` via Path 5: `[po_walk_floor .. max known]` (full scope: every known PO re-fetched and re-hashed = revision detection; unknown ids fetched; confirmed gaps skipped unless the weekly re-probe is due), then forward from `max+1` until `walk_stop_after_misses` (25) consecutive definitive misses. Interior misses become `sn_id_gaps`; trailing misses do not.
3. **sr** — same walk for `inventorySR` (list is department-pinned). Known receipts older than `doc_refresh_days` (60) are not re-fetched. Any line `PurchaseOrderID` unknown to the mirror → fetched at once + alert `po_discovered_via_receipt`.
4. **invoices** — `AP_SupplierInvoice` list (SupInv, complete across departments) → Path 5 for new/recent ones; then INVSI ids taken from `sn_stock_receipts.link_source_doc_id` (not listable) → Path 5. Unknown PO ids → discovery + alert.

Miss vs error: a Path 5 reply whose message says *"The document X/id does not exists"* is a
definitive miss (no retry). Anything else is retried twice with backoff and, if it still fails,
counted as an error (never a gap); 5 consecutive errors abort the stage with a `stage_error` alert.

Change detection: SHA-256 over the canonical projection of typed columns + sorted lines
(`hashDoc`). The raw payload is stored but not hashed (it carries volatile fields).
`sn-sync-selftest.mjs` proves hash determinism over all 550 walked POs.

## Deploy (Fouad)

```bash
supabase functions deploy sn-sync --no-verify-jwt
supabase secrets set SN_API_EMAIL=api@copri.com SN_API_PASSWORD=… SN_TENANT_ID=… SN_SYNC_SECRET=<random-32-chars>
```
Then paste `supabase/SN_SYNC_SCHEDULE.sql` (with the secret + anon key filled in).

## Run locally (first backfill)

Add to `.env.sn` (gitignored): `SUPABASE_SERVICE_ROLE_KEY=…` then

```bash
node scripts/sn-sync-local.mjs
```
Measured first backfill (2026-08-18/19): 550 POs, 4,170 receipts, 5,646 invoices, ~9,000 requests,
≈ 2.7 s per document end-to-end (SN ≈ 0.8 s + 3–4 PostgREST round-trips) → ~7 h of wall time
spread over several runs. Interrupt any time; `--resume <runId>` continues from the cursor.
Nightly steady state ≈ 550 PO re-hash + recent SRs/invoices + forward probes ≈ 800–1,200 requests.

## Cursors / knobs (`sn_sync_state`)

`po_walk_floor` 13733 · `sr_walk_floor` 4300 (tightened automatically to the first hit) ·
`walk_stop_after_misses` 25 · `gap_reprobe_days` 7 · `doc_refresh_days` 60 ·
`po_max_id` / `sr_max_id` (informational) · `po_gaps_last_reprobe_at` / `sr_gaps_last_reprobe_at`.

## Known SN data quirks (kept raw, surfaced as alerts where relevant)

- PO line `OrderLineDiscount` present on some lines but never applied to `OrderLineAmount`.
- 3 POs where a line amount ≠ qty × price at source (`PO/0346`, `PO/0347`, `PO/0376`); 3 POs where header `NetAmount` ≠ Σ lines → `header_line_mismatch` alert.
- INVSI invoice line `AmountFC` echoes the PO line amount, not qty × price (header `NetAmount` is right) — use `quantity` from invoice lines, not `amount`.
- `QuantityReceived` on PO lines is never maintained; `LastModifiedOn` predates `CreatedOn` on half the POs.
