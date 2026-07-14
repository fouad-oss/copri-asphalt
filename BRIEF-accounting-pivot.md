# Brief: Accounting pivot — bundle approvals, GRN, SpectroNova data page

## Context
SpectroNova (SN) is the company ERP and the system of record. Requests and
POs live in SN. This app is a PRE-SN WORKSPACE: field delivery data flows
in, the accountant rectifies and bundles it against SN POs, and a
read-only data page exposes verified bundles for SpectroNova staff to
import into SN themselves. We build NO import/export integration into SN.

Existing stack conventions apply (see CLAUDE.md): single HTML file, no
build step, Google Apps Script backend, Google Sheets as database,
Arabic-first RTL, PIN authentication. Do not introduce a framework or
build step.

---

## PART 1 — Shelving

1. Tag the repo first: `full-build-2026-07`. Permanent bookmark.
2. Shelve by removing NAVIGATION AND ROUTES, not code. Do not delete
   component/page files.
3. Keep reachable:
   - Dispatch flow (plant clerk → receiving engineer)
   - Material capture on site
   - Asphalt plant dashboard (apply pending skill edits if not done)
   - Desk selection view (Fouad only)
   - Approvals page (this brief rebuilds it)
4. Everything else: unreachable but preserved in the repo. Note in README
   which pages are shelved and that the new front-end design is kept for
   later re-use.

---

## PART 2 — Data model additions (Google Sheets tabs)

### Canonical masters
- `VendorMaster`: canonical_id (SN Supplier ID), sn_name, aliases.
  Plant dispatches are ALWAYS supplier **5205 — Asphalt Plant Amghara**
  (hardcode this mapping).
- `ItemMaster`: sn_item_code, description, uom. Seed with:
  - 1020220001  Asphalt - Type I    Tons
  - 1020221001  Asphalt - Type II   Tons
  - 1020222001  Asphalt - Type III  Tons
  - 1020249001  Emulsion            m²
  - 1020248001  M.C. 70             m²
- Canonization is a MAPPING, never a rename. Historical capture records
  keep their raw text AND gain a canonical_id link. Capture dropdowns
  show canonical entries only, store canonical_id going forward.

### PO register (manual entry by accountant)
- `PORegister`: po_number, po_line_no, sn_item_code, description,
  uom, order_qty, unit_price, remarks.
- PO number soft-validated as `PO/\d{3,5}` — WARN on mismatch, never
  block.
- CRITICAL: the same item code appears on multiple PO lines at different
  prices (e.g. hand-laid vs machine-laid). The PO LINE is the matching
  unit everywhere, never the item code alone.
- PO numbers are NOT chronological (fiscal-year resets). Never sort or
  infer recency by PO number; always use dates.

### Note status (rectification)
Every delivery note carries exactly one status:
`matched | dispatched_not_received | received_not_dispatched |
qty_mismatch`
Status is a stored field, recomputed on data change. The accountant's
job is driving everything to `matched` before bundling.

### Bundles
- `Bundles`: bundle_id, po_number, po_line_no, created_date, status,
  published_date, imported_flag, sn_reference, notes.
- `BundleLines`: bundle_id, note_id (delivery note), qty, amount.
- One note maps to exactly ONE PO line within a bundle. No splitting a
  note across POs (rare real splits are handled manually in SN).
- Only `matched` notes can enter a bundle.

### Bundle lifecycle (non-negotiable)
`draft → verified → published`
- Only PUBLISHED bundles appear on the SN data page.
- Published bundles are IMMUTABLE. Corrections = a new adjusting bundle
  referencing the original, never an edit.
- After SN staff import: `imported_flag` set and `sn_reference`
  (INVSI/... and/or Stock_Receipt/... numbers) recorded — by SN staff on
  the data page (their ONLY write action) or by the accountant.

---

## PART 3 — Approvals page rebuild (accountant, PIN access)

### Tabs
`Asphalt | Materials` switch at the top. Same mechanics, different data
source (asphalt = plant dispatch/receipt logs; materials = capture flow).

### Views
1. **Rectification queue** — notes grouped by status; dispatched-vs-
   received comparison side by side; one-click follow-up marker for
   engineer chase-ups.
2. **PO line balance** — for each PO line: order_qty, received-to-date
   (sum of published + draft bundle qty), remaining balance. PER LINE,
   never aggregated per PO. This is the page's core view.
3. **Bundling** — select matched notes → assign to a PO line → bundle.
   App suggests the last-used PO line per item per PO (accountant
   confirms; suggestion self-corrects).
4. **Bundle summary (transcription layout)** — fields in SN's names and
   SN's order: Supplier, PO Number, PO Line, Item Code, Description,
   Qty, UOM, Unit Price, Amount, Delivery Date, Supplier DN Number
   (our printed note number), Site. Built for side-by-side manual entry
   into SN with zero mental translation.

### Rules
- DN date BEFORE PO date is NORMAL (field delivery precedes paperwork).
  Never flag it as an error.
- Reported/dispatched qty vs received qty divergence is a data-quality
  signal — surface it, never block on it.

---

## PART 4 — GRN generator (printable supporting document)

- Generates a printable GRN per individual note OR per bundle (filter:
  day / site / PO).
- Our own numbering, clearly formatted as a COPRI supporting document.
  It is NOT an SN document and must not imitate SN's Stock_Receipt/xxxx
  numbering.
- A5 or A4 print layout consistent with existing delivery note template
  (Arabic-first, QR optional). Signature blocks: engineer, accountant.

---

## PART 5 — SpectroNova data page (external, read-only)

- Separate URL with its own access TOKEN — not a PIN. Zero edit surface
  except the import-confirmation fields (imported_flag + sn_reference)
  per bundle. Token rotation must be trivial (one config value).
- Shows PUBLISHED bundles only. Filter by date range, PO, site.
- Excel/CSV download.
- **Column layout is a frozen contract**, agreed once with SN staff:
  Supplier | PO Number | PO Line | Item Code | Item Description | Qty |
  UOM | Unit Price | Amount | Delivery Date | Supplier DN Number | Site
  After freeze: additions go at the END only; nothing is ever renamed
  or reordered. Treat like an API contract.
- Unimported published bundles surface as a simple list (the "pending
  import" queue) visible to both sides.

---

## Build order (stop for review after each)
1. Shelving pass + repo tag
2. Sheets schema: masters, PO register, statuses, bundles
3. Vendor/item canonization on capture flow (mapping table + dropdowns)
4. Approvals page: rectification queue + PO line balances
5. Approvals page: bundling + lifecycle + transcription summary
6. GRN generator
7. SN data page + token access + import confirmation
8. Polish pass

## Constraints
- One step at a time. No framework, no build step, no localStorage.
- Prefer boring, obvious code.
- All money in KWD, 3 decimal places.
- Arabic-first RTL on any screen field staff or SN staff see.

## Out of scope (README note)
- Any programmatic SN import/export (revisit when SN API is available —
  the data page's frozen layout is the future API payload).
- Real user auth (trigger to revisit: second accountant, first audit
  request, or SN API arrival).
- Blueprint map feature (separate track, separate brief).
