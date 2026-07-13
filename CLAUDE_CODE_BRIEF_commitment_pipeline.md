# Build Brief — COPRI Commitment-Control Pipeline (v2, post finance meeting 14 Jul 2026)

> **For Claude Code.** Before writing any code: read the repo memory files —
> `CLAUDE.md` at the root, everything under `.claude/` (rules, memory, agents),
> and any module-level `CLAUDE.md` files. They hold the stack, conventions,
> auth model, and the existing modules this build must extend, not duplicate —
> at minimum the **asphalt dispatch** module and the **material receival**
> module; check the memory files for others (e.g. milling scheduling). If the
> memory files conflict with this brief on conventions (naming, folder layout,
> DB style), the memory files win; on scope or data rules, this brief wins —
> flag the conflict either way.

## Context (what the finance meeting established)

COPRI's request front-end works today: RF-LPO → approval → PO happens across
departments (partly on paper / in SpectroNova). **The process breaks after
the PO**: delivery notes are not tracked against POs, so nobody can say
whether what was invoiced was delivered, or whether a PO is fully received.
Subcontractors have **no commitment process at all** — contracts are filed
documents with no financial shadow; subs surface in the books only through
payment certificates and through materials COPRI delivers on their behalf
(company policy), which must be recovered against those certificates.
Blanket LPOs/WOs already exist informally (KNPC diesel/bitumen, Jawharat
Berlin aggregates, transport contractors for aggregate port→plant and
asphalt plant→site, a third-party testing company) but live outside any
system, with no ceilings or drawdown tracking.

SpectroNova (the ERP) stays as the system of record (GL only). It has an
API (confirmed, no cost; docs pending). This app is the system of
engagement and posts coded batches to SpectroNova.

**Design principles:** the pipeline must be faster than the workaround;
approvals must be provable (auth first); no orphan money (every dinar
links to a commitment); requests/PO intake is never closed — new POs are
created continuously, so from day one there is always a working way to
register a new PO.

## Build order (each slice ships usable on its own)

### Slice 0 — Users, roles, permissions, audit log (prerequisite)
- Proper authentication (upgrade from whatever exists — check memory files).
- Roles scoped by cost center and function: e.g. site engineer (create
  delivery notes for their project), accountant (approve captures, manage
  matching), head-office approver (approve commitments), admin.
- Append-only audit log on every state change: who, when, before/after.
  Everything later hangs on this.

### Slice 1 — PO register + delivery matching (the broken part; highest value)
- **PO register.** Import existing approved POs from SpectroNova exports
  (script in `tools/`). Note: procurement exports are split **per
  department** — main office, project 363, project 364, asphalt plant,
  milling, steel factory, garage — one file each, but **the filenames do
  not identify the department**; the transaction fields inside should.
  Importer approach: (a) create a small mapping config
  (`import-map.json`: filename → department/cost center) and have Fouad
  confirm it once; (b) cross-check each file's in-record department
  fields against that mapping — a file should be homogeneous, so flag any
  record disagreeing with its file's department instead of trusting
  either silently; (c) tag every imported record with the confirmed
  canonical cost center. Also provide a lightweight **manual PO entry screen**
  mirroring today's RF-LPO→PO paper flow — this is the always-open intake
  door until Slice 4 replaces it. PO: vendor, cost center, project/WO
  reference, lines (item, qty, unit, rate), status.
- **Delivery note capture.** Extend the existing material receival module so
  every delivery note references a PO line. Qty received accumulates
  against the line. Orphan delivery notes are not allowed (site can flag
  "no PO found" which opens an exception for the accountant, not a free pass).
- **Three-way match view.** Per PO: ordered vs. received vs. invoiced, with
  gaps highlighted. Invoice records reference PO + delivery notes.
- **Accountant approval as a daily batch screen** — yesterday's captures in
  one list, flag exceptions, approve the rest in one action. Never
  per-ticket approval.

### Slice 2 — Subcontract register (the invisible liability)
- Contract record: subcontractor, project/cost center, scope, contract
  value, retention %, advance, validity, document attachment.
- Certified-to-date: payment certificates recorded against the contract
  (ties into the existing payment-certificate extraction work — check
  memory files).
- **Materials-issued-to-sub ledger:** deliveries COPRI makes on behalf of a
  sub are recorded against that sub's contract with a back-charge status
  (pending / deducted on cert #N). This closes the recovery leak.
- Register view: value vs. certified vs. back-charges vs. retention held.

### Slice 3 — Blanket LPO / WO register with drawdown
- Formalize the existing informal blankets. Seed records: KNPC (diesel,
  bitumen), Jawharat Berlin (aggregates), transport contractors (aggregate
  port→plant; asphalt plant→site), third-party testing.
- Fields: vendor, category, rate reference, ceiling, validity window,
  cumulative drawdown. Call-offs (POs or delivery captures referencing a
  blanket) decrement it; warn/block at breach (configurable).

### Slice 4 — Request portal (upgrade the intake door)
- RF-LPO / RF-WO / RF-Contract forms per cost center; routing rules
  (config, not constants): new vendor → head office; new subcontract →
  head office; above threshold → head office; within active blanket →
  auto-approved.
- Approval generates the numbered commitment (`LPO-`, `WO-`, `CON-` series)
  directly into the Slice 1 register; the manual PO entry screen from
  Slice 1 is then restricted to exceptions.
- This mirrors, then replaces, the existing paper RF flow — do not force a
  switch before the register has earned trust.

### Slice 5 — Execution feeds + integration + reconciliation
- **Asphalt dispatch feed:** dispatch tickets reference their WO/PO;
  accountant daily-batch approval releases them into the matched data.
- **SpectroNova integration layer** behind one interface, two adapters:
  file-export adapter (Excel/CSV coded batches — build first) and API
  adapter (stub until docs arrive; then implement). Rows carry date,
  vendor (SpectroNova contact ID via mapping table), cost center code, GL
  account, amount, commitment reference, source-record ID.
- **JV reconciliation tool** (`tools/reconcile/`): parse the legacy
  accounting software JV export and the SpectroNova JV export (both in
  `data/`), normalize (dates, encodings, account-code mapping table),
  auto-match by date+amount+account with tolerance rules, output an
  exceptions-only report (Excel) for finance. Re-runnable monthly. Expect
  ugly inputs: legacy date formats, Arabic text encoding, code mismatches.

## Data rules (schema-enforced, not UI-suggested)
1. Cost center is a foreign key, never free text. Canonical table: division
   centers (5105, 5205, 5305, 5405, 5505…) + one per project (363, 364, …),
   each with a nullable `spectronova_code` (staged cutover — masters map
   later, then SpectroNova becomes source of truth synced via API).
2. Canonical vendor table, normalized-name unique index,
   `spectronova_contact_id` mapping. Seeding script must clean the current
   export: strip test records, merge duplicates, exclude non-vendors.
3. Duplicate invoice guard: unique `(vendor_id, supplier_invoice_no)`;
   same-amount near-duplicate within 30 days = blocking warning.
4. No orphan money: invoices → commitment; delivery notes → PO line;
   dispatch tickets → WO; call-offs → blanket; sub materials → subcontract.
5. Append-only audit trail everywhere.

## Data folder conventions
- All raw inputs live in **`C:\Users\fszog\Desktop\Copri webapp\Accounting raw data\`**
  (local disk — no cloud sync).
- The folder sits inside the repo, so add `Accounting raw data/` to
  `.gitignore` **before** copying anything in (company books never enter
  version control) — verify with `git check-ignore` after adding.
- Subfolders: `legacy-jv\` (USB: old accounting software), `spectronova\`
  (full exports, now unrestricted access), plus a `README.md` noting source
  module + export date per file.
- Write outputs (reconciliation reports, cleaned masters) to a separate
  `output\` subfolder; raw input files stay byte-identical to their source.

## Out of scope
- Replicating the GL (no debit/credit engine). Editing inside SpectroNova.
  Payroll. Historical migration beyond the JV reconciliation inputs.

## Open inputs (build as configuration)
- Approval thresholds, approver identities, internal transfer rates,
  blanket ceilings (finance follow-ups pending).
- SpectroNova API docs/credentials (requested; timing unknown — hence
  file adapter first).

## Front-end note
A visual refresh is wanted but must not gate the control slices. Invest UX
effort in the five daily-touch screens (delivery capture, batch approval,
PO register, match view, dispatch) as they ship; general redesign is a
separate later track.
