# Brief: Accounting interface rebuild — FINAL (supersedes BRIEF-accounting-pivot.md)

## Context
SpectroNova (SN) is the company ERP and system of record. This app is a
PRE-SN WORKSPACE: field delivery data flows in, the accountant audits and
bundles it against SN POs, and a read-only data page exposes published
bundles for SpectroNova staff to import into SN themselves. We build NO
programmatic SN integration.

Data layer is **Supabase** (migrated Jul 2026). Google Sheets / Apps
Script are no longer the database — if CLAUDE.md still says otherwise,
update it as part of step 0.

## DESIGN MANDATE (the reason for this rebuild)
The current accounting build wrongly extended the OLD app shell (the
messy overflowing-tabs UI). That stops now.

- All accounting screens use the NEW front-end design system from the
  shelved build — same tokens, components, spacing, typography.
- **Refer to the design skill file already in this repo/setup for the
  exact design preferences.** It is the authority on look and feel; this
  brief is the authority on layout, data, and behavior. Read it before
  writing any UI code.
- UI language: **English only**. No language toggle, no RTL machinery.
- BUT: every UI string lives in ONE central labels object — never
  hardcoded inline. (An approved Arabic dictionary exists for a future
  language switch; see Appendix. Do not build the switch now.)
- Vendor names, item names, and all master-data values display EXACTLY
  as they appear in the SN masters. Only UI chrome comes from the labels
  object.

---

## Data model (Supabase)

Segmented as before; stage of truth:

### Masters
- `vendor_master`: id (SN Supplier ID), sn_name, aliases[].
  Plant dispatches are ALWAYS supplier **5205 — Asphalt Plant Amghara**
  (hardcoded mapping).
- `item_master`: sn_item_code, description, uom. Seed:
  1020220001 Asphalt - Type I (Tons); 1020221001 Asphalt - Type II
  (Tons); 1020222001 Asphalt - Type III (Tons); 1020249001 Emulsion
  (m²); 1020248001 M.C. 70 (m²).
- Canonization is a MAPPING, never a rename. Historical records keep raw
  text AND gain a canonical id. Capture dropdowns store canonical id.

### PO register (manual entry)
- `po_register`: id, po_number, po_line_no, sn_item_code, description,
  uom, order_qty, unit_price, remarks.
- PO number soft-validated `PO/\d{3,5}` — warn, never block.
- The SAME item code appears on multiple PO lines at different prices
  (hand-laid vs machine-laid etc.). **The PO LINE is the matching unit
  everywhere. Never the item code alone.**
- PO numbers are NOT chronological (fiscal-year resets). Never sort or
  infer recency by PO number; use dates.

### Delivery note statuses
Asphalt: `matched | dispatched_not_received | received_not_dispatched`
Materials: `matched | not_received | no_po`
There is NO qty-mismatch status anywhere — receipt confirms a load, it
does not re-weigh it. Do not build dispatched-vs-received quantity
comparison columns; a single Qty column per note.

### Bundles
- `bundles`: id, po_line_id (FK → po_register), status, created_at,
  published_at, imported_flag, sn_reference, notes.
- `bundle_lines`: bundle_id, note_id (FK, UNIQUE), qty, amount.
- One note → exactly one PO line within one bundle (enforce via FK +
  unique constraint, not convention).
- Only `matched` notes can enter a bundle.

### Lifecycle (non-negotiable, enforced in the DATABASE)
`draft → verified → published`
- Published bundles are IMMUTABLE — enforce with RLS policy or trigger
  rejecting UPDATE/DELETE where status = 'published' (except the two
  import-confirmation fields). Corrections = new adjusting bundle
  referencing the original.
- Only published bundles appear on the SN data page.
- Import confirmation: `imported_flag` + `sn_reference` (INVSI/… and/or
  Stock_Receipt/…), settable by SN staff on the data page (their ONLY
  write, via a single RPC) or by the accountant.

### Rules
- DN date BEFORE PO date is NORMAL. Never flag it.
- All money KWD, 3 decimals. All percentage/consumption figures derive
  from qty sums per PO line.

---

## Screens (accountant, PIN access) — layouts as prototyped and approved

### 1. Audit queue (landing)
- `Asphalt | Materials` tab pills.
- Three status tiles per tab (counts, act as filters):
  Asphalt: Matched / Dispatched, not received / Received, not dispatched.
  Materials: Matched / Not received / No PO.
- Table below: Asphalt → Delivery note no. | Site | Qty (t) | Status.
  Materials → Delivery note no. | Vendor | Item | Qty | Status.
- Status badges colored: success (matched), warning (not received),
  neutral (no PO / received-not-dispatched).
- Hint line: unmatched notes cannot be bundled.

### 2. PO register / line balances
- PO selector; per-LINE cards: line no. + description + laying method
  from remarks, item code + unit price (mono), progress bar
  received/ordered, remaining qty. Warning state when nearing limit.
- Never aggregate lines of the same item code.

### 3. Bundling
- Table of matched notes with checkboxes; live selected-count and
  qty total.
- PO line selector, pre-set to the last-used line for this item on this
  PO (accountant confirms). Create bundle button.

### 4. Bundles list
- Columns: Bundle | PO / line | Qty · amount | Status | SN reference.
- Lifecycle badges: Draft (neutral) / Verified (accent) / Published
  (success). Published without SN reference shows "pending import".

### 5. Bundle detail (transcription layout)
- Header: bundle id + lifecycle badge; actions: GRN, Excel.
- Field grid in SN's names and order: Supplier, PO Number, PO Line,
  Delivery Date.
- Line table: Supplier DN No. | Item Code | Qty | UOM | Unit Price |
  Amount. Totals row (notes count, qty, KWD total).
- Footer: Imported to SN checkbox + SN reference field.
- Built for side-by-side manual entry into SN — zero mental translation.

### 6. GRN (printable)
- Per note or per bundle (filters: day / site / PO).
- Own numbering (GRN-C-####). Header disclaimer: "COPRI supporting
  document — not a SpectroNova record". Must NOT imitate SN's
  Stock_Receipt numbering.
- Print-clean A4/A5 layout consistent with the delivery note template;
  signature blocks: Site engineer, Accountant.

### 7. SN data page (external, read-only)
- Separate URL with its own access TOKEN (single config value, trivially
  rotatable). Not a PIN. Supabase RLS: anon role sees published bundles
  only.
- Filters: date range, PO, site. Excel/CSV download.
- **Frozen column contract (already agreed with SN staff — implement
  LITERALLY, no renames, no reordering; additions at the END only):**
  Supplier | PO Number | PO Line | Item Code | Item Description | Qty |
  UOM | Unit Price | Amount | Delivery Date | Supplier DN Number | Site
- Only write surface: imported_flag + sn_reference per bundle (one RPC).
- Pending-import list visible (published bundles without sn_reference).

---

## Build order (stop for review after each)
0. Update CLAUDE.md: Supabase data layer; design skill file is the UI
   authority; English-only labels-object rule.
1. Supabase schema + constraints + lifecycle enforcement + seed masters
2. Audit queue (both tabs)
3. PO register + line balances
4. Bundling + lifecycle + bundle list
5. Bundle detail (transcription layout) + import confirmation
6. GRN generator
7. SN data page + token access + RPC
8. Polish pass against the design skill file

## Constraints
- One step at a time. No new frameworks. No localStorage.
- Prefer boring, obvious code.

## Out of scope (README note)
- Programmatic SN import/export (the data page's frozen layout is the
  future API payload).
- Language toggle / RTL (see Appendix).
- Real user auth (revisit on: second accountant, first audit request, or
  SN API arrival).
- Blueprint map feature (separate track).

## Appendix — approved Arabic dictionary (DO NOT BUILD NOW; store with
the labels object for a future language switch)
- bundle = تجميعة (bundles = التجميعات, bundling = التجميع)
- audit queue = قائمة التدقيق (rectification/audit = تدقيق)
- delivery note = سند تسليم (Supplier DN No. = رقم سند تسليم المورد)
- GRN = سند استلام بضاعة; disclaimer = مستند داعم من كوبري — ليس سجلاً في
  SpectroNova
- PO = أمر شراء; PO line = بند أمر الشراء; Qty = الكمية; UOM = الوحدة;
  Unit Price = سعر الوحدة; Amount = المبلغ; Tons = طن; KWD = د.ك
- Statuses and lifecycle labels remain in ENGLISH in all languages.
- Vendor/item names always display exactly as in the SN masters.
