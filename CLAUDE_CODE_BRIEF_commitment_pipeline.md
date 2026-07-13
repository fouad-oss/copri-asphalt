# Build Brief — COPRI Commitment-Control Pipeline

> **For Claude Code.** Before writing any code: read the repo memory files —
> `CLAUDE.md` at the root, anything under `.claude/` (rules, memory, agents),
> and any module-level `CLAUDE.md` files. They hold the stack, conventions,
> auth model, and the existing **asphalt dispatch** module, which this build
> must extend, not duplicate. If the memory files conflict with this brief on
> conventions (naming, folder layout, DB style), the memory files win; if they
> conflict on scope or data rules, this brief wins — flag the conflict either way.

## Why this exists (context)

COPRI runs several cost/profit centers — asphalt plant (AP01, AP02), milling,
garage, main office, and one entity per project (e.g. 363 "30 & 40 Expressway",
364 "Hawalli Governorate"). Today each entity commits spend directly (work
orders, LPOs, contracts) with no shared pipeline. The ERP (SpectroNova) is the
system of record — general ledger only. Its data audit (July 2026) found: no
project cost centers, two incompatible department coding schemes, test data
mixed with production, duplicate supplier invoices accepted silently, and an
unused approval workflow. This app becomes the **system of engagement**: every
commitment is born, approved, and tracked here, then exported to SpectroNova
as clean coded batches.

**Design principle: the pipeline must be faster than the workaround.** If
raising a request takes longer than a phone call, the system loses.

## Scope — four modules

### 1. Request portal
- Three request types: `RF-WO` (work order — subcontractors, incl. internal
  ones: plant and milling selling to projects), `RF-LPO` (purchase order —
  suppliers), `RF-Contract`.
- Every request requires at creation: requesting cost center (from the
  canonical list, no free text), vendor (from the canonical vendor table),
  description, estimated value, and for call-offs a reference to a blanket LPO.
- Requests are numbered `RF-{TYPE}-{YYYY}-{seq}`.

### 2. Approval queue (head office)
- Routing rules, configurable, seeded as: new vendor → head office; new
  subcontract → head office; value above threshold → head office (thresholds
  TBD from the 14 July finance meeting — build as config, not constants);
  call-off within an active blanket's ceiling and validity → auto-approved.
- Blanket LPO entity: vendor, category (diesel / bitumen / aggregate / …),
  rate reference, ceiling amount, validity window, cumulative drawdown.
  Call-offs decrement the ceiling; block or warn at breach (behavior
  configurable).
- Approval produces the numbered commitment: `WO-`, `LPO-`, or `CON-` series.
  An approved request is immutable except through a revision flow.

### 3. Execution capture
- Link the **existing asphalt dispatch module** so each dispatch ticket
  references a WO. Do not rebuild dispatch — integrate with it.
- Goods receipt (GRN) against LPO lines; milling work logs against WOs;
  monthly internal-recharge run (garage/plant/milling → consuming cost
  centers) generating internal invoices at policy rates (rates TBD Phase 0 —
  config table).
- Every capture references its commitment. Orphan captures are not allowed.

### 4. Export / integration layer (to SpectroNova)
- SpectroNova **has an API** (confirmed July 2026; capabilities not yet
  documented — see Open inputs). Build the layer behind an interface with two
  adapters: an **API adapter** (primary) and a **file-export adapter**
  (Excel/CSV batches, fallback and audit copy). Until API docs and credentials
  arrive, implement the file adapter first and stub the API adapter against
  the same interface.
- Whatever the transport, each transaction row carries: date, vendor
  (SpectroNova contact ID via mapping table), cost center code, GL account,
  amount, commitment reference, source-record ID.
- If the API supports **reading master data** (vendors, cost centers, chart
  of accounts), sync masters FROM SpectroNova on a schedule instead of manual
  export imports — but only after finance's master-data rebuild; syncing the
  current polluted masters is worse than not syncing.
- A reconciliation view: exported/posted vs. acknowledged. If the API returns
  posting confirmations or ledger reads, automate the match; otherwise
  finance ticks manually.

## Data rules (from the audit — enforce in schema, not just UI)

1. **Cost center is a foreign key, never text.** Canonical table seeded with
   the division centers (5105, 5205, 5305, 5405, 5505…) plus one per project.
   Include a `spectronova_code` column — projects have no code there yet;
   nullable until finance creates them.
2. **Vendor uniqueness.** Canonical vendor table with normalized-name unique
   index and a `spectronova_contact_id` mapping (one-to-many tolerated during
   cleanup, flagged). Import of the current 1,979-row contact export must
   pass a cleaning step: strip test records, merge duplicates, exclude
   non-vendors (employees, cash tills, GL concepts).
3. **Duplicate invoice guard.** Unique constraint on
   `(vendor_id, supplier_invoice_no)`; a same-amount near-duplicate within
   30 days raises a blocking warning. This directly closes the audit's
   15-duplicate finding.
4. **No orphan money.** Invoices must reference a commitment; captures must
   reference a commitment; call-offs must reference a blanket.
5. **Audit trail on everything** — who, when, before/after — append-only.

## Explicitly out of scope
- Anything that replicates the general ledger (no debit/credit engine).
- Editing data inside SpectroNova.
- Payroll.
- Historical data migration (test-contaminated; cutover is forward-only).

## Open inputs (do not hard-code — build as configuration)
- Approval thresholds and approver identities (14 July meeting).
- Internal transfer rates and recharge cycle date.
- Blanket LPO ceilings per category.
- SpectroNova API details (existence confirmed; pending: docs, auth method,
  endpoints — can it POST vouchers/invoices? READ masters and ledger? — rate
  limits, and whether a sandbox/test tenant exists so we never develop
  against production).

## Suggested order of work
1. Schema + canonical master tables + vendor import/cleaning script.
2. Request portal + numbering.
3. Approval queue + blanket LPO logic.
4. Commitment register + link to existing dispatch module.
5. GRN + internal recharge run.
6. Export batches + reconciliation view.

Each step should ship usable on its own; the plant's LPO flow (blanket
call-offs for diesel/bitumen) is the first end-to-end slice to prove.
