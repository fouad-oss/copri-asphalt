---
name: copri-frontend
description: COPRI web app front-end design system — visual tokens, the six screen patterns, bilingual EN/AR rules, role-scoped navigation, and standing UX rules. Read before building or modifying ANY screen or component in this repo, including restyling existing modules (dispatch, material receival, milling).
---

# COPRI front-end skill

Every screen in this app is an instance of one of six patterns wearing
different data. Build the pattern, not the screen. When a new screen is
requested, first identify its pattern; if it fits none, stop and flag it.

## Identity

A working tool for accountants, engineers, and managers in Kuwait — dense
but calm, fast over decorative. The anti-goal is the dated-Material ERP
look (heavy shadows, colored app bars, floating buttons). Flat surfaces,
hairline borders, generous type, one accent action per view.

## Stack

- Tailwind CSS + shadcn/ui (components copied into the repo, owned by us).
- TanStack Table for all registers and queues.
- react-i18next for ALL strings from the first screen — no hardcoded text,
  ever, including "Save".
- Recharts (or none) — charts are rare; numbers and bars beat charts here.

## Brand (from copri.com)

- Logo: download `https://copri.com/images/logo.png` into the repo at
  `assets/brand/copri-logo.png` (never hotlink the website). Produce from
  it: a white/knockout version for dark surfaces, a small square mark for
  favicon and PWA icons, and check whether an SVG exists on the site or
  in the brochure (`copri.com/copri-brochure.pdf`) — prefer vector if so.
- Brand tokens from the logo, not from guesses: sample the logo's primary
  hue(s) and set `--brand` accordingly. If the sampled brand hue differs
  from the placeholder accent `#D35400` in the tokens above, THE LOGO
  WINS — update the accent token to the logo hue (adjusted only as needed
  for WCAG AA contrast on white and on Ink) and note the final hex in
  DECISIONS.md.
- Logo placement is restrained: the app header (small, start-aligned, one
  per screen), the login screen, and printed/PDF exports (delivery notes,
  reports, retirement checklists — anything leaving the app carries the
  logo and company name). Never as watermark, never repeated per card.
- Login screen may carry the tagline "The Art of Construction" under the
  logo; nowhere else. Company footer line for exports:
  "COPRI Construction Enterprises W.L.L. · Founded 1969".
- The app is a tool, not the website: no hero videos, no marketing
  imagery, no project photos in chrome. Brand presence = logo + accent
  hue + Ink, nothing more.

## Tokens

Colors (semantic, not decorative):
- Ink `#1A2733` (headers, primary text on light), Paper `#FFFFFF`,
  Canvas `#F5F6F7` (page background).
- Brand/accent orange `#D35400` — ONE use per view: the primary action.
- Progress/info blue `#2471A3`, success green `#1E8449`,
  warning amber `#B7791F` on `#FDF3E3`, danger red `#B03A2E` on `#FBEAE8`.
- Warnings and exceptions are the ONLY colored surfaces on any screen —
  if everything is highlighted, nothing is.

Typography:
- Latin: Inter. Arabic: IBM Plex Sans Arabic. Declare both in one stack;
  weights 400 and 600 only.
- Reference codes and quantities: monospace (JetBrains Mono), always.
- Body 14px in office screens, 16px on field/mobile screens; never below
  12px.

Density: two modes, not one compromise — `office` (desktop, dense tables,
36px controls) and `field` (mobile, 48px touch targets, one column).

## Bilingual EN/AR (structural, not cosmetic)

- `dir` is set once on the root from the user's saved language preference;
  everything else follows.
- CSS logical properties ONLY: `ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`/
  `text-end`. Never `ml/mr/pl/pr/text-left/text-right`. This is what makes
  RTL free.
- Codes, quantities, and amounts stay Latin-script Western-digit in both
  languages, wrapped in `<bdi>` or `dir="ltr"` spans so they never
  scramble inside Arabic sentences: `LPO-2026-0041`, `12,400.000`.
- Master-data names render `name_ar` in Arabic UI, `name_en` in English
  UI, falling back to whichever exists. People's names likewise. Pickers
  render one script per view — never a mixed jumble.
- System vocabulary (statuses, roles, labels) comes from i18n keys backed
  by coded DB values (`approved`), never stored strings.
- Free-text user input displays verbatim in its original script.
- KD amounts: three decimals, thousands separators, `KD` label in EN and
  `د.ك` in AR.

## The six patterns

1. QUEUE (approvals, daily batch, exception inbox)
   - Items waiting for the viewer, oldest-age indicator in the header.
   - Every item shows WHY it is here (routing reason / flag reason) inline.
   - Batch action is primary; flagged items are excluded from batch by
     design. Never per-item approval when a batch is possible.
   - Inline approve/reject plus an open-detail affordance on every row.

2. REGISTER (POs, blankets, subcontracts, vendors, materials, cost centers)
   - Filter bar (search + scope selects) above a dense table or card list.
   - Progress rendered as thin twin bars where two measures exist
     (received/invoiced); values right-aligned; status as a small tinted
     badge.
   - Rows open the matching DETAIL. Pagination always. Nobody browses a
     register; they query it.

3. DETAIL (three-way match, blanket lines, subcontract)
   - Header: reference + status badge + one-line context.
   - Metric strip (3–4 tiles, the exceptional one tinted).
   - Line table with per-line state, then linked-document panels.

4. CAPTURE (mobile delivery note, dispatch ticket, plant receiving)
   - Field density, one column, three-tap goal. Raw data only — capture
     screens NEVER ask for PO/commitment mapping; that is an accounting
     step in the daily batch.
   - Pre-scoped to the user's cost center/project; escape hatches ("can't
     find X") create an exception for the accountant, never block and
     never free-pass.
   - Offline-first: local queue, client-generated UUIDs, visible sync
     state, idempotent retry.

5. DASHBOARD (admin home, plant manager home, accountant strip,
   management overview)
   - Leads with "waiting on you" count; every tile above the fold is
     actionable; passive analytics are the smallest elements.
   - Quick-action rows behave exactly like QUEUE rows.
   - Sync-health tile (exported / pending / unmatched) appears on admin
     and management views.

6. ADMIN (users & roles, config)
   - Role = function x cost-center scope, shown as badge + scope text.
   - Audit log is a readable feed (time · actor · action · reference),
     resolved to names at display time from stored IDs.

## Navigation

Seven sections, organized by OBJECT, never by build history or department:
Home · Approvals · Commitments (POs / blankets / subcontracts) ·
Deliveries · Masters · Reports · Admin.
- Nav is role-scoped: no user sees a section they cannot act or read in.
- Home is role-routed: admin dashboard / accountant queue / field "my
  day" / plant manager plant view / management read-only.
- Experimental screens live in a Labs section visible to admin only.
- Legacy routes (including plantRole=manager) redirect into the new
  structure.

## Standing rules (apply to every screen)

- No unbounded pickers. Every selection control is, in order: scoped by
  role, ranked by recency/history, then searchable. Full-master pickers
  exist only on accountant/admin surfaces; requesters get history-ranked
  pickers with a request-new path; field roles only ever see derived,
  pre-scoped lists.
- Submitters see the fate of what they submitted (approved / flagged with
  reason) on their home screen — the feedback loop is an adoption
  feature, not a nicety.
- Exceptions carry their reason and their owner ("with accountant")
  wherever they appear.
- Aging is visible on every queue ("oldest: 2 days").
- Every reference code is a link to its detail, everywhere it appears.
- Loading: skeletons for tables, spinners only for actions. Empty states
  say what would appear here and how to cause it.
- Destructive or high-value confirmations restate the object and amount;
  no generic "Are you sure?".
- Toasts confirm batch results with counts ("44 approved, 3 flagged
  remain").

## Screen inventory (24)

Home: admin dashboard · accountant home (queue + summary strip) · field
"my day" (civil/asphalt engineers) · plant manager home · management
overview. Approvals: head-office queue · daily batch (map, then approve).
Commitments: PO register · three-way match detail · blanket register ·
blanket detail (item lines, qty drawdown, rate variance) · subcontract
register · subcontract detail (certificates + materials back-charges) ·
request form (RF-LPO/WO/Contract, blanket auto-approve banner).
Deliveries: mobile delivery capture · dispatch feed/board · plant
receiving · exception inbox. Masters: vendors (canonical + aliases) ·
materials · cost centers. Reports: reconciliation & sync. Admin: users &
roles + audit feed.

Existing modules (dispatch, material receival, milling) are restyled into
these patterns, not rebuilt beside them.
