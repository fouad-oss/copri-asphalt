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
- Proper authentication for OFFICE roles (accountant, approvers, plant
  manager, admin, management read-only). FIELD capture roles — **civil
  engineers** (material receival) and **asphalt engineers** (dispatch) —
  stay **passwordless as today**: identified by name selection / device
  attribution, no credentials, revisit later. Safe because field input is
  raw data with no financial effect until an authenticated accountant maps
  and approves it. The existing plantRole=manager query-param access is
  replaced by real auth and redirected.
- Roles scoped by cost center and function: civil engineer (capture
  material deliveries, their project), asphalt engineer (dispatch-side
  capture), plant clerk (dispatch/receiving capture at 5205), plant
  manager (RF-LPOs for 5205, oversight, approves nothing), requester
  (RF creation for their center), accountant (map + batch-approve
  captures, invoices, exceptions — AND may raise requests), finance
  approver ("Jimmy" — approves accountant-raised requests), head-office
  approver, management (read-only), admin.
- **Approval chains are configurable sequential gates, not a single
  approver field.** Current config: accountant-raised requests → finance
  approver (Jimmy). Planned future chain: PM → Jimmy → Admin — adding a
  gate must be a config change, not a schema change.
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
- **Delivery note capture is raw entry — NO PO reference at capture.**
  Field engineers record exactly what is in front of them: vendor note
  photo, material (from the item master), quantity, date. **Mapping a DN
  to its PO line is an ACCOUNTING step**, done in the daily batch screen:
  map first, then approve. A DN may exist unmapped, but cannot be approved
  or posted unmapped — that is where the no-orphan rule is enforced. Qty
  received accumulates against the PO line at mapping time.
- **Three-way match view.** Per PO: ordered vs. received vs. invoiced, with
  gaps highlighted. Invoice records reference PO + delivery notes.
- **Accountant daily batch screen: map, then approve.** Yesterday's raw
  captures in one list; each gets its PO-line mapping (suggested
  automatically by vendor + material + open-PO match, confirmed by the
  accountant), exceptions flagged, the clean remainder approved in one
  action. Never per-ticket approval.

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
- **A blanket is specified by item lines, not a money ceiling.** Header:
  vendor, category, cost center scope, validity window. Lines: item (FK to
  the materials master), **agreed rate per unit, agreed quantity** —
  drawdown is tracked in quantity per line; KD values are derived
  (qty × rate), shown as totals but never the primary control.
- Call-offs and delivery captures reference a specific **blanket line**;
  each decrements that line's remaining quantity. Warn/block at line
  breach (configurable). A call-off for an item not on the blanket, or at
  a rate different from the line's agreed rate, is flagged — rate variance
  is a first-class exception at match time.
- Transport/testing blankets: lines are service items with unit = trip /
  ton-km / test, same mechanics.

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
- **Master-data dedup tool** (`tools/dedup/`): merge-and-map, never delete
  (FULL SPEC in the Appendix at the end of this brief).
  Cluster candidate duplicates (normalize: trim, strip punctuation and
  legal suffixes like Co./W.L.L./شركة, unify Arabic letter variants ه/ة
  and ي/ى; then fuzzy match; hard-match on CR number/phone where present)
  and output clusters for **human confirmation — never auto-merge**.
  Survivor = most recent history + most complete record, renamed to the
  canonical convention. Losers are retired, not deleted (mark inactive;
  fallback convention: rename `ZZ — DO NOT USE — see <survivor>`), and
  the app's mapping table holds many old SpectroNova IDs per canonical
  record so history aggregates. Applies to the **vendor master** now and
  the **materials/item master the same way once its export lands** (file
  pending — Fouad will add it to the data folder; do not block on it).
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
3. Canonical **materials/item master** with the same pattern: normalized
   unique names, unit of measure per item, mapping to SpectroNova item
   codes, new items only via a controlled request path — PO lines and
   delivery notes reference item IDs, never free-text descriptions.
   (Seed export pending from Fouad.)
4. Duplicate invoice guard: unique `(vendor_id, supplier_invoice_no)`;
   same-amount near-duplicate within 30 days = blocking warning.
5. No orphan money: invoices → commitment; delivery notes → PO line;
   dispatch tickets → WO; call-offs → blanket; sub materials → subcontract.
6. Append-only audit trail everywhere.

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

## Autonomous operation
Work unattended to a reviewable preview. Do NOT pause to ask permission or
preference questions mid-run: make the reasonable assumption, record it in
`DECISIONS.md` (one line each: what was assumed and why), and continue.
Deliver at the end of each run: the running preview (dev server or build),
a summary of what shipped, and the decision log. Only stop for true
blockers (missing credential, contradictory requirement) — and even then,
finish everything not blocked first. Never run destructive git operations
(force-push, reset --hard on shared branches, history rewrites) or delete
data files; commit work-in-progress frequently so a break never loses work.

## Security requirements (enforce from Slice 0, audit every slice)
Authentication and sessions
- Password hashing: argon2id (or bcrypt, cost >= 12). Never reversible.
- Sessions: httpOnly, Secure, SameSite cookies; server-side revocation;
  idle timeout for office roles; login rate limiting + lockout backoff.
- MFA (TOTP) available and REQUIRED for admin and finance-approver roles.
- Passwordless field roles are contained, not trusted: scoped capture
  tokens (per device/site), can ONLY create raw captures in their scope,
  cannot read registers or values; device/name attribution logged.

Authorization
- Deny by default. Every endpoint checks role AND cost-center scope
  SERVER-SIDE; scope filters live in the query layer, never only in UI.
- No role or identity from URL parameters (retire plantRole=manager).
- IDOR protection: every object fetch validates the record belongs to the
  caller's scope; sequential IDs are fine only because of this check.
- Separation of duties in code: creator of a record can never be its
  approver; enforced by the approval-chain engine, not convention.

Input, output, and files
- Parameterized queries only (no string-built SQL). ORM or prepared
  statements throughout.
- Output encoding everywhere + a Content-Security-Policy header; no
  dangerouslySetInnerHTML with user data.
- CSRF protection on all state-changing routes.
- Upload hardening (delivery photos): whitelist content types, size cap,
  strip EXIF, randomized names, stored OUTSIDE the web root (or object
  storage), served via authenticated routes; client-side compression.
- All financial validation server-side; client checks are convenience.

Secrets and infrastructure
- No secrets in the repo or client bundle — env vars / secret store; the
  SpectroNova API credentials live server-side ONLY and never reach the
  browser.
- HTTPS only, HSTS; database not exposed publicly; app connects with a
  least-privilege DB user (the app user cannot DROP; audit table grants
  are INSERT+SELECT only so the log is append-only at the grant level).
- Dependency hygiene: lockfile committed, `npm audit` (or equivalent) in
  CI, patch cadence.
- Backups: automated encrypted DB backups + the data folder, 3-2-1
  (local, external, offsite), and a TESTED restore procedure documented.

Monitoring and people
- Log and alert on: repeated failed logins, permission-denied bursts,
  approvals where creator == approver attempts, exports of unusual size.
- Error tracking without leaking stack traces to users.
- Offboarding: disabling a user revokes sessions immediately; quarterly
  role review report (who can do what) generated from config.

Deliverable per slice: a SECURITY.md checklist ticked for that slice; a
final pre-launch pass runs an authenticated scan of every route as every
role (matrix test: role x endpoint, expect deny outside scope).

## Performance requirements (right-sized — tens of users, not thousands)
- Postgres (or equivalent) with indexes on every FK and on the normalized
  search-key columns; pagination on all registers; no N+1 in the match
  view (single joined query per PO).
- Batch endpoints: approving 44 captures is ONE request, not 44.
- Photos: client-side compression before upload, thumbnail generation,
  storage lifecycle plan (originals archived after posting).
- Offline field capture: local queue with idempotent sync (client-
  generated UUIDs so retries never duplicate a DN).
- Do not over-engineer: no caching layers, queues, or microservices until
  a measured problem exists. Measure first: log slow queries > 200 ms.

## Front-end note
A visual refresh is wanted but must not gate the control slices. Invest UX
effort in the five daily-touch screens (delivery capture, batch approval,
PO register, match view, dispatch) as they ship; general redesign is a
separate later track.

---

## Appendix — Master-data dedup tool (`tools/dedup/`) — full spec

### Goal

Turn the polluted SpectroNova vendor master (~1,979 contacts: exact
duplicates, near-duplicates across English/Arabic spellings, test records,
another company's demo data, and non-vendors like employees and cash tills)
into: (a) a clean **canonical vendor table**, (b) a **many-to-one mapping
table** (every old SpectroNova contact ID → one canonical vendor, one ID
marked primary), and (c) a **retirement checklist** for finance. Same
pipeline must run later on the **materials/item master** (export pending —
build config-driven, don't block).

**Merge-and-map, never delete. The tool proposes; a human disposes.
Zero auto-merges.**

## Inputs

- `Accounting raw data\spectronova\` — vendor export (Excel). Expect
  columns like contact ID, company name, AR account code, phone, email;
  handle missing/renamed columns gracefully and report what was found.
- Later: materials export in the same folder (item name, unit of measure,
  category if present — use both as clustering evidence when available).

## Pipeline (three stages, separately runnable)

#### Stage 1 — Classify and cluster (`dedup propose`)
1. **Classify every record** first:
   - `test` — names matching test patterns (test, tset, dummy, xxx,
     keyboard-mash, "System Administrator", implementer names).
   - `non-vendor` — employees, cash tills, GL concepts ("Salaries
     Outstanding Payable", "CASH TILL", "J.xxx Transitory"), COPRI itself.
   - `foreign-demo` — the real-estate/architecture demo block (flag for
     human review rather than hard-coding a list).
   - `vendor` — everything else, proceeds to clustering.
   Classification is a *suggestion column*, human-confirmable like merges.
2. **Normalize names** into a match key: trim; casefold; strip punctuation
   and tatweel/tashkeel; unify Arabic variants (ة→ه, ى→ي, أ/إ/آ→ا);
   remove legal suffixes as *tokens* (Co, Company, W.L.L., ذ.م.م, Est.,
   شركة) — but keep business words (Trading, Contracting, Transport) since
   they distinguish real entities.
3. **Cluster**: exact normalized-key match; then fuzzy (token-set
   similarity) with two bands — high confidence (suggest merge) and low
   confidence (list as "possible, review carefully"); hard evidence
   (same phone / CR number / email) promotes any pair to high confidence
   and can bridge English↔Arabic name pairs that fuzzy matching misses.
4. **Suggest a survivor** per cluster: most transaction history (join
   against the supplier-invoice export if present in the folder),
   tiebreak on completeness of fields, then lowest contact ID.

#### Stage 2 — Human review (Excel, not a UI)
Output `output\dedup-review-vendors.xlsx`: one row per record, grouped by
cluster, with columns: cluster ID, suggested action
(merge-into-survivor / keep / exclude-test / exclude-non-vendor /
exclude-demo), confidence, evidence (which rule matched), suggested
survivor flag, and an empty **DECISION** column with a dropdown.
Cluster IDs must be deterministic across re-runs (hash of member IDs) so a
partially-filled review survives a re-propose. The accountant fills
DECISION; blank = not yet decided (tool treats as keep, listed in the
undecided report).

#### Stage 3 — Apply (`dedup apply`)
Reads the decided workbook and produces, transactionally:
- Canonical vendor table rows (survivor data, canonical naming convention:
  official English name + Arabic name in its own field, no suffix soup).
- Mapping table rows: every merged SpectroNova contact ID → canonical ID,
  survivor's ID flagged `is_primary`.
- Exclusions table (test/non-vendor/demo) with reasons — these get **no**
  canonical row but stay resolvable so historical imports referencing them
  don't crash; they resolve to a quarantine bucket, reported not posted.
- `output\retirement-checklist.xlsx` for finance: the losers, each with
  its survivor, for marking inactive in SpectroNova (or renaming
  `ZZ — DO NOT USE — see <survivor>` if no inactive flag exists).
- A summary report: counts per action, undecided remainder, before/after
  totals.

## Rules
- Idempotent and re-runnable end to end; `apply` must be safe to run twice.
- Full provenance: every canonical row and mapping row records which
  review file and row produced it, and when.
- Never modify SpectroNova or the raw input files; all outputs to
  `output\`.
- The canonical table this produces is the same one the main pipeline's
  vendor picker reads — coordinate the schema with the commitment-pipeline
  brief, don't invent a parallel one.
- Materials run: same three stages driven by a per-master config (columns,
  normalization extras like unit-of-measure equivalence and dimension
  patterns "5/10", "5-10", "5 to 10 mm); activate when the export lands.

## Acceptance
- Running `propose` on the current export completes and produces the
  review workbook with zero crashes on Arabic text, blank fields, or
  duplicate contact IDs.
- Applying a partially-decided workbook works; undecided rows pass through
  as standalone canonical vendors and are listed for later review.
- Round-trip test: every one of the ~1,979 input IDs is accounted for in
  exactly one of {canonical primary, mapped duplicate, excluded,
  undecided} — none silently dropped.
