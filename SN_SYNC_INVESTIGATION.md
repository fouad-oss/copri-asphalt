# SpectroNova → Supabase Sync — Investigation Report (§0 of the v2 brief)

*2026-08-18. Read-only. Sources: vendor guide v1.0 (2026-07-15) and v2.0 (2026-08-17) PDFs + the two Postman collections (Downloads — **not** in the repo), `SN_API_FINDINGS.md`, fresh probes today (~1,000 sequential calls incl. a full PO ID walk). Raw material in gitignored `sn-api-dumps/` (`po-walk/` = every PO by ID, `full-lists/` = complete Path 3 pulls of all nine types).*

**Missing source:** the correspondence Word document (COPRI's original request + vendor delivery email) is **not** in the repo or Downloads. Brief §1 fact 1 (PO access was never requested) therefore stays **unverified from primary source**; it is consistent with the guides (v1 mentions only "vendors, quotations … Vendors, Quotation, Vehicle"; v2 lists the nine families, no PO), but I could not read what COPRI actually asked for. Please drop the .docx into the repo if you want that confirmed.

---

## 1. Headline findings (what changes the design)

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| **1** | **PO list viewer = the Fixed-Asset PO screen filtered by the API user's *current department* in SN.** Not a static filter. | Today's 6 = *exactly* the 6 FA POs whose department is "364 - Hawally" (of 24 FA POs total). The 08-12 probe's 2 = *exactly* the 2 FA POs of "5205 - Asphalt Plant" (`PO/FA/0005`, `PO/FA/0018`). Somebody switched api@copri.com's active department between the runs. `Clause` ignored on this viewer. | Never use Path 3 for POs. Path 5 by ID (walk) is the ingestion path — confirmed on all 550 POs. Ask the vendor for the *material* PO list viewer ("Purchase Order (PO)" screen) exposed as a DocumentType, unscoped. |
| **2** | **PO population = 550 (24 FA + 526 material), IDs 13733–14301, one integer sequence.** Material = 472 new-series `PO/0006…PO/0480` (from 2026-01-31) + 54 old-series `PO/0560…PO/0617` (2026-01-06…01-29, IDs 13733–13789). Matches SN UI counts (24 FA / ~475 material). New-series numbers never issued or deleted: 0001–0005, 0210, 0334, 0396. | `po-walk/index-13650-14360.json` | **Backfill floor must be 13733, not 13790** (13790 misses the 54 old-series POs). Below 13733: 83 consecutive misses down to 13650 and every ladder probe to id 1 missed — nothing older exists. |
| **3** | **ID density:** 550 hits / 161 misses in 13650–14360; *interior* miss runs: 11, longest **6** (14138–14143); above the top (14301) 59+ straight misses. | walk | "Stop after 15 consecutive misses" is safe today (2.5× the longest gap) — I propose **25** for margin, plus the weekly gap re-probe. |
| **4** | **`inventorySR` list is context-pinned to Hawally (364):** 920/921 rows contract 2017. Path 5 on IDs *missing* from the list returned real receipts for Asphalt Plant, Garage, Expressway (`Stock_Receipt/02906` @4638 … `/07233` @8999). 3,445 gap IDs inside the visible range ⇒ thousands of hidden receipts. First SR ID ≈ 4300–4600 (Jan 2026). | `full-lists/inventorySR.json` + gap probes | **Receipts must also be walked by ID via Path 5** (`inventorySR`, `StockItemTransferID`), same engine as POs. The Path 3 list is useless for completeness. |
| **5** | **`AP_SupplierInvoice` list is *type*-filtered, not department-filtered:** all 1,482 rows are `SupInv/*` across 8 departments (78 Expressway) — but the **PO-linked `INVSI/*` inventory supplier invoices are absent** (61532 sits inside the list's ID range 49115–61552 and is not listed). Path 5 `AP_SupplierInvoice` is a **generic TradingInvoice viewer**: by ID it returns INVSI, `PARTSTOCK/*` parts receipts, `ManualINV/*` internal invoices, and even HR `Leave/*` applications. | `full-lists/AP_SupplierInvoice.json` + gap probes | Invoice mirror: keep the SupInv list pull, but discover PO-linked INVSI via **SR header `LinkSourceDocID`** → Path 5 by ID (no 12k-ID walk needed). Security note for the vendor (HR docs readable through the AP viewer). |
| **6** | **`WorkflowStatusCode='C'` (Closed, "Closed by …") on 119/550 POs; `ActionCode='C'` mirrors it. `DocumentStatus` null everywhere; `PostedStatus='Posted'` on all 550; `RevisionNumber=0` on all.** | walk | Brief §1.5 "no status" is incomplete: there **is** a closed flag. Mirror it (`is_closed`); bundling picker should hide closed POs by default. |
| **7** | **`QuantityReceived` = 0 on all 1,171 PO lines** (incl. lines with posted receipts). | walk | Confirmed: received qty comes from `sn_sr_lines`. |
| **8** | **`LastModifiedOn` is unusable:** date-only, and *earlier than* `CreatedOn` on 277/527 POs. | walk | Hash-based change detection stands. Only trustworthy watermark is the monotonic ID; there is no change feed. |
| **9** | **`ItemCode` null on 1,170/1,171 PO lines; `ItemID` always set.** Line amount = `QuantityOrdered × OrderUnitPrice` on all 1,171 lines (`OrderLineDiscount` present on 87 lines but *not* applied). Header `NetAmount` = Σ lines on 547/550 (exceptions: rounding on `PO/0346`, `PO/0347` 261 vs 257, `PO/0376` header 0 vs lines 3,900 — mirror both, flag mismatch). | walk | Join items on `ItemID`. Store the raw discount; compute nothing from it. |
| **10** | **`tenantid` query param is ignored** (bogus value works); the `x-tenant` header (tenantInfo with connection strings) is what selects the DB. Guide's `LVT4osJpYsVeNsJkNGAL` and the JWT's `InwjcjIBnEQGvrUOaZmL` behave identically. **No Authorization header exists anywhere in the vendor's own Postman collection** — token is "reserved for future endpoints" by design. | probes; Postman | Sync sends the token anyway (brief); expect it to be ignored. |
| **11** | Every list row is strings; HTML wrappers on link/emphasis columns; money with thousands separators only on `inventorySR.NetAmount`; dates in ≥5 formats; two id conventions (`tableid` on Vendors/item/GLCOA/GLCostCenter/AP/PurchaseOrder; `StockItemTransferID` on SR; `ContactDirectoryTrxID` on JV; `TradingInvoiceID` on PaymentSp). Path 5 headers return real numbers for some fields. | findings §2 | Normalizer must be deterministic (see §4). |

---

## 2. Verification of the brief's "working facts"

| Brief §1 | Verdict |
|---|---|
| 1. PO access not in original request | **Unverifiable** — correspondence doc missing (see top). Consistent with guides. |
| 2. List returns 6 / don't use it | **Confirmed, and explained** (finding 1). No parameter/header makes it complete: `tenantid` ignored, `x-tenant` must be the exact full object (prod-only/staging-only halves → NullReference), `Clause` ignored. No other DocumentType lists material POs (`LPO` empty; `PO`, `AP_PurchaseOrder`, `POrder`, `PurchaseVoucher`, `AP_PurchaseVoucher`, `PurchaseOrders`, `PurchaseOrderList/Register/Header/Master` etc. do not exist). |
| 3. Path 5 returns any PO in full | **Confirmed on all 550** — every department (Main Office, Asphalt Plant, Garage, Milling, Steel, Hawally 364, Expressway 363). |
| 4. Dense sequence ~13801–14245 | **Corrected**: 13733–14301 today; density as in finding 3. |
| 5. Existing PO = approved | Consistent (all Posted, `RevisionNumber` 0, no draft/pending states) — **but 119 are Closed** (finding 6). |
| 6. `QuantityReceived` unmaintained | **Confirmed** (finding 7). |
| 7. Other lists may be scoped | **Yes for SR (department), yes-but-differently for AP (type-filtered), Vendors/item/GLCOA/GLCostCenter complete** (636/247/300/18, multi-department). JV: first 1,000 of 7,349 all `ContractID 99` with mixed OBS codes — undetermined, out of scope. |
| 8. Ingest hygiene | Confirmed + finding 11. |

## 3. Context-scope audit (§5) — answer

- **`AP_SupplierInvoice` (SupInv list): NOT department-scoped** — 8 departments incl. 78 × "363 - 30 & 40 Expressway". But it excludes the PO-linked INVSI documents entirely (finding 5).
- **`inventorySR`: DEPARTMENT-SCOPED (Hawally only)** — 1 stray Expressway row; hidden receipts for every other department reachable by ID (finding 4). This is the same mechanism as the PO viewer.
- **`PurchaseOrder`: department- AND type-scoped** (finding 1).
- **Masters (Vendors, item, GLCOA, GLCostCenter): complete.**
- Implication for the vendor ask: request that the API user be given an *all-departments* context (or that the viewers be un-pinned), and that a material-PO list viewer and the INVSI viewer be exposed. Until then, POs, receipts, and PO-linked invoices are all fetched by ID.

## 4. Design changes vs the brief (recommend; awaiting your call only where marked ⚠)

1. **PO walk floor 13733; forward-stop 25 misses; weekly gap re-probe** (brief: 13790 / 15).
2. **Stock receipts: ID walk via Path 5** from 4300 (floor found by probe: 4300 miss, 4600 hit — first run will pin it), stop-after-25, same gap table. The Path 3 SR list is *not* used for headers (it is 1/4 of the population); Path 3 stays only as a cheap "new max id" hint. Cost: first backfill ≈ 4,700 calls (~1.5 h at the polite rate) — one-off; nightly = forward walk + refresh.
3. **Invoices: SupInv from Path 3 (complete) + INVSI discovered from SR `LinkSourceDocID` (Path 5). No TradingInvoice ID walk** (12k-ID span, mostly non-AP documents). ⚠ If you want *all* INVSI regardless of receipts, say so — that becomes a walk of 49115→61600.
4. **Nightly refresh of every known PO by hash** stands (finding 8) — ~550 calls/night today, growing ~2–3/day. Receipts: refresh only receipts younger than 60 days + those linked to open POs (receipts don't get edited later in practice; ⚠ tell me if they do). Invoices: same rule.
5. **New columns:** `sn_purchase_orders.is_closed` (`WorkflowStatusCode='C'`), `workflow_status_remarks`, `department` (= `FromCompany`), `contract_id/contract_name`, `order_type/order_type_id`, `payment_terms`, `link_source_doc_type/id` (the originating purchase request), `posted_on`. `sn_po_lines.discount` stored raw, never applied.
6. **Register/bundling:** hide `is_closed` POs by default (toggle), badge FA (`OrderTypeID 5` / `PO/FA/`). Bundle granularity in the current code is the **PO line** (`bundles.commitment_line_id → commitment_lines.id`, FK; `bundle_create(p_pin, p_commitment_line_id, …)`; amount = qty × line rate) — SN mirror will be attached at the same granularity via a nullable `bundles.sn_po_line_id` (exactly-one-of check), a `sn_po_line_balance` view, and a `bundle_create_sn` RPC. UI seam = `app/src/screens/accounting/data.ts` (`poList`, `poLines`, `poLineOptions`, `lastUsedLines`, `bundlesList`, `bundle_transcription`).
7. **Legacy reconciliation key:** `commitments.sn_po` (text) ↔ `sn_purchase_orders.po_number`, normalized (`PO/0423` vs `PO-0423`/`0423` variants). Report only.
8. **Determinism rules for hashing:** strip tags → collapse whitespace → trim; numbers parsed from strings (`,` removed) and re-serialized with fixed precision; hash computed over a canonical JSON of *typed columns + sorted line tuples*, **not** the raw payload (raw contains volatile fields such as `Filter`, `infobuttonsource`, `FromPhoto`).

## 5. Message to SpectroNova (ready to send, replaces findings §5 items 1/4/5)

1. **Purchase orders — list access (new requirement).** We found the `PurchaseOrder` DocumentType works with `spectro-documentdata` by ID and returns full priced lines — thank you. The `spectro-tabledata` list, however, is the *Fixed-Asset PO* screen filtered by our API user's currently selected department (6 rows today, 2 rows last week, depending on the department the user was left in). Could you (a) expose the material "Purchase Order (PO)" screen as a DocumentType and (b) give api@copri.com an all-departments context (or make the list viewers ignore the department pin)? Same request for `inventorySR`, whose list currently returns only Hawally receipts (~920 of ~4,000+).
2. **INVSI:** the `AP_SupplierInvoice` list returns only `SupInv/*`; the PO-linked `INVSI/*` inventory supplier invoices are reachable by ID but not listable. Please expose an INVSI list viewer.
3. **PO status:** `WorkflowStatusCode='C'` marks closed POs; `DocumentStatus` is always null. Confirm 'C' is the only non-open state and that a PO cannot exist unapproved.
4. **`QuantityReceived` on PO lines is 0 everywhere; `LastModifiedOn` predates `CreatedOn` on half the POs** — confirm neither is maintained.
5. **Security:** the `AP_SupplierInvoice` document viewer returns any TradingInvoice-family document by ID (including HR leave applications); the `tenantid` query parameter is ignored; the token is not required. Please confirm the intended posture.
6. `PaymentSp` returns 1 record and `GRN` 0 — which viewers hold payment vouchers and goods receipts?

## 6. What I need from you (Fouad) before Phase A goes live

- Nothing blocking for the schema/engine build (proceeding now, deliverables as files).
- To run the **first full sync** I need the migration pasted and a **service-role key** in the gitignored `.env.sn` (`SUPABASE_SERVICE_ROLE_KEY=`) — or you deploy the edge function with the secrets and press "Sync now".
- The correspondence .docx, if you want brief §1.1 verified.
- Decisions on the two ⚠ items above (defaults chosen if silent: SR-linked INVSI only; receipts/invoices refresh 60-day window).

---

## 7. Build status (2026-08-18, end of day) and acceptance checklist

Delivered files (uncommitted, ready to review):

| Piece | Path |
|---|---|
| Mirror schema + RLS + views + alert dismiss RPC | `supabase/migrations/0064_sn_mirror.sql` |
| SN-backed bundling (bundles.sn_po_line_id, `bundle_create_sn`, `sn_po_line_balance`, `sn_bundle_last_line`, `bundle_transcription` union, `sn_legacy_po_recon`, `po_source` switch) | `supabase/migrations/0065_sn_po_bundling.sql` — paste **after** the first sync |
| Sync engine (Deno + Node) | `supabase/functions/sn-sync/core.js`, `index.ts`, `README.md` |
| Nightly schedule template | `supabase/SN_SYNC_SCHEDULE.sql` |
| Local runner / offline tests | `scripts/sn-sync-local.mjs`, `scripts/sn-sync-selftest.mjs` (mappers, hash determinism over 550 POs), `scripts/sn-sync-drytest.mjs` (end-to-end with in-memory DB + mock SN: backfill in resumable slices, idempotent refresh, revision detection, discovery) |
| Accounting UI | `app/src/screens/accounting/data.ts` (source seam), `PoRegister.tsx` (SN badges/closed toggle/received bar), `Bundling`/`BundleDetail`/`BundlesList` (SN lines + links), new `SnSync.tsx` panel at `/accounting/sn-sync` (status, Sync now, stages, alerts, runs, reconciliation) — `tsc` + `vite build` clean |
| Notion | Modules row "SpectroNova sync"; Open Items: first-sync (blocked on you), go-live steps, vendor ask, forward-walk verification |

Two deviations from the brief, deliberately:
- **Miss handling:** a Path 5 reply saying *"The document X/id does not exists"* is treated as a definitive miss without retries (the message is unambiguous; retrying every interior gap ×3 would triple walk cost). Transient/other errors are retried twice with backoff and never recorded as gaps. Same guarantee the brief asked for, cheaper.
- **Received quantities in the register** come from `sn_sr_lines`; INVSI invoice line `AmountFC` echoes the PO line amount (78 m × 20 shows 4,800, not 1,560) while the invoice header is right — the views use `quantity`, never invoice line `amount`.

| Acceptance item | State |
|---|---|
| Investigation report, PO-list behaviour diagnosed with evidence | ✅ §1 finding 1 (department-context theory confirmed and sharpened) |
| First full sync populates ~24 FA + ~475 material, both projects visible | ⏳ blocked on 0064 paste + service key; dry run over the real dumps: 550 POs (24 FA / 526 material), 8 departments |
| PO/0423 in mirror = 3 HDPE lines, qty × price | ✅ in dry run (`scripts/sn-sync-selftest.mjs`), pending live |
| Received qty from `sn_sr_lines`, not `QuantityReceived` | ✅ by construction (`sn_po_line_received`) |
| Re-run with no upstream change → 0 spurious `po_revised` | ✅ dry run (run 2: 550 unchanged, 0 alerts); verify live after first sync |
| Forward walk finds a PO created after backfill | ⏳ needs a real new PO (Notion item) |
| Legacy reconciliation report | ✅ view `sn_legacy_po_recon` + panel section; live numbers after first sync |
| Context-scope audit answer | ✅ §3 |

## 8. First sync — live results (2026-08-18 21:30 → 2026-08-19 16:30 Kuwait)

| Run | Scope | Outcome |
|---|---|---|
| 1 | full | masters 883 · **550 POs** (1,177 lines) · 1,482 SupInv invoices · 0 errors · 2,079 requests · 91 min. SR stage returned 0 (bug: bare-floor walk stopped after 25 misses before the first receipt id — fixed). |
| 2 | sr+invoices | 3,198 receipts, then the process **hung** at 22:49Z when SpectroNova's webhook layer (n8n) went down; SR walk had also stopped early at id 7997 (interior gap > 25 — fixed with a list-derived ceiling). Marked partial. |
| — | — | **SpectroNova outage 22:49Z → ~08:00Z (≈9 h)**: every webhook returned HTTP 500 "There was a problem executing the workflow" (even bogus credentials). A watcher relaunched automatically on recovery. |
| 3–4 | quick sr+invoices | run 4 died on a transient network loss (retry window too short — fixed: 45 s fetch timeouts, DB retries up to ~30 s backoff, walk pauses 60 s after 5 consecutive errors). |
| 5 | quick sr+invoices | SR walk complete: **4,170 stock receipts** (4,561 lines, all PO-linked) — vs 921 visible in the Path 3 list. Invoice discovery reached 3,800/4,017 then failed on a duplicate line id (a retried `INSERT` after a lost response — fixed: line writes are now idempotent upserts; interrupted first writes are finished silently). |
| 6 | quick invoices | remaining 170 INVSI → **5,646 supplier invoices** (1,482 SupInv + 4,164 INVSI, 8,636 lines). 0 errors. |
| 7 | full po | **Idempotence: 552 unchanged, 0 updated, 0 `po_revised`** — plus 4 brand-new POs raised in SN today (PO/0481…; max id 14307), i.e. the forward walk catches new POs. |

Acceptance checklist (live): first full sync ✅ (24 FA + 526→532 material, 8 departments incl. 363 + 364) · PO/0423 = 3 HDPE lines, qty × price, received 162/120/144 from receipts ✅ · received qty from `sn_sr_lines` ✅ · 0 spurious `po_revised` on re-run ✅ · forward walk finds post-backfill POs ✅ (PO/0481, PO/0482 on 2026-08-19) · legacy reconciliation ✅ (`SN_LEGACY_PO_RECONCILIATION.md`: 424/424 matched, 0 legacy-only, 126→128 SN-only) · context-scope audit ✅.

Migration 0065 pasted and **`po_source` flipped to `sn` at 10:29Z 2026-08-19**. Remaining for go-live: push/deploy the app (the seam is in the working tree), deploy the edge function + secrets, paste `SN_SYNC_SCHEDULE.sql`. Note for the vendor ask: our backfill generated ~9,000 webhook executions in ~12 h; if their n8n instance persists execution logs this may have contributed to the outage — ask them, and keep the nightly at its steady ~800 requests.
