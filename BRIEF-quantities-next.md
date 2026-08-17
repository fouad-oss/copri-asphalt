# BRIEF — Quantities module, state of play

For the next Claude Code session. Written 2026-08-17, at the end of the
session that loaded the Expressway. Supersedes `BRIEF-expressway-backfill.md`
(that job is done). Read `CLAUDE.md` and `copri-frontend-SKILL.md` alongside
this; `BRIEF-quantities-handover.md` still describes phase 1's domain model
accurately.

**There is no single next job.** The backfill is finished and everything is
live. What follows is the state, the traps, and a list of open items — pick
with Fouad.

---

## 1. State of the world

- **Module**: `/app/quantities`, React screens in `app/src/screens/quantities/`,
  own Supabase-Auth email gate, Arabic-first with an AR⇄EN toggle.
  Repo: `C:\Users\fszog\Desktop\Copri webapp` (local-only, not in OneDrive).
- **Migrations 0033–0057 are ALL pasted and confirmed** (0057 pasted
  2026-08-17 — Expressway executed tier now per subcontractor, see §2a).
  **0058 + 0059 (WO 3) pasted 2026-08-17** — WO 3's request sheet is named
  `الطلبات`, so 0051 had skipped it (27 requests / KD 290,353, all بحر الابداع
  bar 5 pro-rata remainders). Migrations 0033–0059 all applied. Nothing
  pending. Both tools take `--wo N --mig <file>` for such increments.
- **Front-end deploys on push to `main`.** Last commit `d0060ae`.
- **Two projects**, switched from the header (`ProjectSwitcher`, selection in
  `localStorage['qm.contract']`, default `HAW9`):

| | Hawalli `HAW9` | Expressway `EXPW` |
|---|---|---|
| contract | ق ص / ط ش / 9 | هـ ص / ط / 9 |
| نسبة العقد | +9% | **+19%** |
| value | 19,300,000 | 15,250,000 + 3,812,500 variation |
| BOP items | 1,309 | 1,737 |
| work orders | 76 (46 closed) | 65 (58 closed) |
| WO lines | ~2,295 | 876 |
| طلبات تدقيق | 148 opening entries | **1,117 real dated requests (1,344 rows after the per-sub split)** |
| certificates | 17 (KD 9.38M after pct) | 21 (KD 15.61M after pct) |

### Screens

home dashboard · أوامر العمل register · دفعات الوزارة (dashboard, detail,
generate) · طلبات التدقيق · **مقاولو الباطن** (new) · new work order.

## 2. What the Expressway looks like, and why to trust it

Three independent reconciliations agree, which is the main reason to believe
the import:

1. **Work orders vs the register** — all 65 tie to within 1 KD each.
2. **طلبات التدقيق vs the work orders** — the تدقيق cross-tabs and the نهائي
   sheets are written independently in the same workbook, and reproduce each
   other at ratio 1.000 on 61 of 64 work orders.
3. **Certificates vs the work orders** — cumulative certified lands within
   **KD 0.045** of the work-order total, and no work order is certified above
   its own value.

Money split: **43% subcontracted / 57% self-performed** (KD 5,700,418 vs
7,415,919 pre-pct).

### 2a. Executed per subcontractor (0057) — how it was derived

Fouad's key (2026-08-17): the subcontractor payment workbooks are a **time
series**. Each folder's numbered files are that sub's payment certificates in
order; `رئيسي` states «الاعمال المنتهية حتى dd/mm/yyyy» (period end, the 5th,
same calendar as the ministry certs) and «كشف رقم N»; each numbered sheet is a
work order with cumulative quantities per BOP item. Proof: WO 54's طلبات
التدقيق (33/2 = 5,078.75, 92/2 = 1,587, 93/2 = 195, 1/5 = 31.16, 34/5 = 966,
62/5 = 10,315 + 10,000) equal, item for item, بحر الابداع مدني certificate 13
sheet 54.

`tools/qm_expw_exec_split.py` reassigns each request (or request line) to
the vendor whose certificate absorbed it. Per (WO, item): no claim → كوبري
(57.6% of value); one vendor whose claim ≥ requests → whole (35.0%); else
exact/combo delta matching (2.2%) then **pro rata** for the unmatched
remainder (5.2%, 87 pairs, listed in `expw-exec-report.md` — the only
estimated part; the milling certificates on WO 43 etc. simply do not
reconcile line-by-line with the requests). Dates are a tie-break only: request
and certificate dates disagree by months in both directions. Result per
vendor lands within 2–7% of the 0054 allocation (ANA, ريكافكو, سكوير, milling
exactly 1.00). 786 of 1,090 requests touched, 222 split into two vendor rows;
quantities and dates unchanged. Simulated twice against 0051's state:
per-(WO, item) totals identical to the source, idempotent.

It also **heals a 0051 gap**: 6 requests were silently skipped by 0051's
`not exists` guard — 5 share (WO, serial, date) with another (WO 2/99,
30/716, 31/506, 31/507, 31/508) and one UNDATED one (WO 15/514) shares its
serial with a dated sibling (undated rows were guarded on serial alone). The
DB held 1,084 requests, not 1,090. 0057 inserts them with note «… (2)». First
paste attempt (2026-08-17) raised «WO 15 طلب 514 missing» for exactly this
reason and rolled back cleanly; regenerated.

## 3. The traps — do not relearn these

### The Expressway source corpus (`~\Desktop\ExpresswaysQMbackfill`)

- **The register `بيان اوامر العمل.xls` has THREE vintages.** Use
  `جميع اوامر العمل` — **trailing space, no parenthetical**. It runs to WO 70,
  states `قيمة الامر التغييري رقم 1 : 3,812,500`, and its totals tie to
  `كميات`'s ملخص. The `(3)` copy is an older snapshot in which WOs 39, 42, 52,
  56, 57, 58 and 59 were still جزئي with part-values — comparing against it
  makes seven good work orders look broken. **Resolve register columns by
  HEADER TEXT**: the vintages differ (the `(3)` copy has an extra `المتبقي`
  column, shifting everything right).
- **Register values are POST-pct; Σ(qty × rate) is PRE-pct.** Compare ×1.19 or
  every work order looks 19% short.
- **`كميات 9المفصلة.xls` shifts on BOTH axes between its 21 sheets.** Sheet 1
  has 1,830 rows and the rest 1,829, and a work-order column is inserted at
  index 31 from sheet 10 on, with more appended at 16/20/21
  (**59 → 60 → 74 → 75 columns**). Rebuild the row→code map AND the col→WO map
  **per sheet**. Reusing sheet 1's maps made 65 items appear to drop to zero
  and inflated the total to **67M against a true 12.5M**.
- Also in that file: the **value columns go stale from sheet 10** (11.9M
  against a true 7.7M). Trust the quantity columns only.
- **Pick the WO sheet by evidence, not by name.** WO 37's `نهائي` is a 4-line
  stub worth KD 4,237 while its sibling ties to the register exactly; WOs 63–68
  have `#REF!` in every quantity cell of `نهائي` but an intact `1` sheet. The
  rule used: among sheets carrying a باب table, take the one whose Σ×1.19 lands
  within 1 KD of the register, `نهائي` breaking ties. This also recovered WOs
  23 and 53, which otherwise failed outright.
- **The باب|رقم البند table is not at a fixed cell** — (19,1) in 54 files,
  (17,1) in 4, (18,1) in 4, (17,0) in 1. Locate the header pair, read every
  column as an offset from it.
- **`طلبات التدقيق` sheets are CROSS-TABS**: rows = رقم الطلب + تاريخ الطلب,
  columns = BOP codes, cells = quantity. Use the **unnumbered** sheet (WO 19's
  has 69 requests against 35/17/19 in its (2)/(3)/(4) subsets). They carry
  **no subcontractor at all**. **WO 3 names its sheet `الطلبات`** (variants
  `الطلبات (2)`, `الطلبات حسب الترتيب`) — and it is an `.xls`, so xlrd hands
  serials back as floats (`340.0`): normalise before the `^\d+$` test or every
  row is silently skipped.
- **In-sheet titles and headers are STALE COPIES.** WO 19's file contains a
  sheet titled `امر عمل رقم : 6`; a دالكو claim file cites the *Hawalli*
  contract number; a سكوير file names بحر الابداع as the contractor. **Identity
  comes from the file path only.**
- **Subcontractor claims: take the latest file THAT MENTIONS EACH WORK ORDER**,
  not simply the latest file — a sub's work order can appear in an early claim
  and be absent from the newest. Using the newest alone lost KD 2.7M.
- **Fold folders onto vendors BEFORE splitting.** Allocations are keyed
  (kashef_line, vendor); several folders are one vendor (بحر الابداع is three,
  قصر البيداء two, سكوير+ابراهيم two) and they overlap on the same work orders,
  so folder-by-folder writes overwrite instead of summing.
- **Subcontractor rates are usually but not always the BOP rate** (6,057 of
  6,252 lines). Claim value ≠ what they are owed.
- **Idempotency guards on (kashef, vendor, serial, date) are NOT unique** in
  the تدقيق cross-tabs — the same serial+date can appear on two rows. 0051
  lost 6 requests that way (healed by 0057) — undated rows were guarded on
  serial ALONE, so an undated request with a dated same-serial sibling died too. Guard on an occurrence
  discriminator (0057 uses the note text «… (2)»).
- **`قشط الاسفلت-1` states period end 05/03/2022** — a stale-copy year; it is
  the first certificate, so sorting by date still orders it correctly.
- **Certificate periods**: works up to the **fifth of the month**, certificate
  1 = 2024-12-05, so `period_end(N) = 2024-12-05 + (N−1) months`. Note the
  working papers in `الدفعة` run **one ahead** of the payment number on the
  form: `مرفقات` says «شهادة دفع رقم (021) … حتى 05/07/2026», but 05/07/2026 is
  certificate **20**.

### bab / band — settled, with evidence

Composite codes (`1/1`, `17/د/4`, `36/17أ`, `أ / 16/2`) are **band-first,
bab-second**, everywhere in this corpus. Established by cross-checking against
the أمر عمل workbooks, which carry باب and رقم البند in **separate** columns:

| reading | matches | mismatches |
|---|---|---|
| band-first | 207 rates, 7,152 descriptions | 3, then 0 |
| bab-first | 2 rates, 172 descriptions | 16, 1,670 |

**The suffix letter floats through every position** — `04/ب`, `د/4` (letter
FIRST), `0017/د`, `36/17أ`, `أ / 16/2`. Parse the first NUMBER and the first
ARABIC LETTER of each cell wherever they sit; anchoring a regex on a leading
digit silently drops lines (it cost 3 of WO 43's 7). Normalise hamza (أ→ا).
Watch for small but legitimate babs: a neighbour-majority vote for a run's bab
swallows bab 3 (6 items) and bab 14 (4 items) — detect runs of ≥3 and never
second-guess an established one.

### Postgres / Supabase

- **`create or replace view` cannot rename or reorder columns** (ERROR 42P16).
  New columns must be **APPENDED last**. Hit on 0046 and again on 0055.
- **A view keyed by vendor needs contract scoping** — بحر الابداع is
  `vendors.id 10` on BOTH contracts. 0046 fixed five views this way, 0055 a
  sixth (`qm_sub_line_status`).
- Anonymous `$$` bodies get mis-split in long pastes — use named tags
  (`$qm$`, `$qmexpwwo$`, `$qmexpwtd$`…).
- **The SQL editor refuses pastes over ~1 MB.** Split into numbered parts, each
  a self-contained `do` block, split only between records. Budget ~600 KB for
  the value blocks — the header and preamble are added on top.
- `vendors.kind` is NOT NULL without a default.
- **Anon probe to check an object exists**: `42501 permission denied` means it
  exists and RLS works; a schema error means it was never created. Data-only
  migrations are invisible this way — verify those by counting.

### App

- Views return **pre-pct** sums; screens multiply by `1 + pct/100`.
  **Quantities are never multiplied, only money.** KD is 3 decimals; codes and
  quantities live inside `dir="ltr"`/`<bdi>`.
- Logical CSS only (`ms-*`/`me-*`), **named exports** (not default),
  `detail.col.*` i18n keys for table headers.
- **Dev preview verification** (no login needed): another chat may hold port
  8124 — just point the browser at it, same working tree, HMR live. The gate
  needs BOTH `sessionStorage['copri_app_session']` (PIN profile, `lib/session.ts`)
  AND a Supabase session. Patch `window.fetch` after load, then
  `await import('/src/lib/supabase.ts')` and call `supabase.auth.setSession()`
  with a **well-formed base64url JWT** (a fake string is rejected: "JWT not in
  base64url format"). Route with `history.pushState` + `PopStateEvent`.
  **Dev routes are at ROOT** (`/quantities/new`) — the `/app` prefix is
  production-only. `.single()` returns an object, not an array.

## 4. Tools (all in `tools/`, all re-runnable)

| tool | what it does |
|---|---|
| `qm_expw_bop.py` | Expressway price book from the standalone جدول الأسعار |
| `qm_expw_wo.py` | WO headers + lines from each `نهائي` sheet, register cross-check |
| `qm_expw_tadqiq.py` | طلبات التدقيق from the unnumbered cross-tab sheets |
| `qm_expw_paycert.py` | certificates as per-payment deltas of sheets 1..21 |
| `qm_expw_close_wos.py` | closes WOs the register calls نهائي |
| `qm_expw_subs.py` | subcontractor claims → allocation split; **gated on `qm-expw-subs-map.json`** |
| `qm_expw_exec_split.py` | claims as a time series → executed (تدقيق) split per sub, emits 0057 in ≤600 KB parts; same gate; report `expw-exec-report.md` |
| `qm_backfill.py` and the other `qm_*.py` | the Hawalli equivalents |

Outputs land in `~\Desktop\quantities-backfill\`. The `expw-*-report.md` files
are the validation reports and are worth reading before trusting any number.

Two tools follow the `import_pos.py` convention: they always write the report
and dataset but **refuse to emit SQL** until a mapping file is confirmed.

## 5. Open items

**Needs Fouad, not code**

1. **ريكافكو on WO 1** claims 8,655 م.ط against a work-order line of 1,572
   (×5.5), at a sheet rate of 29.75 against a BOP rate of 323.00. Scaled pro
   rata to fit, but it looks like a different item or a unit mix-up.
2. **WO 26** — قصر البيداء and دالكو both claim the same bab-7 kerb work
   (×1.9 to ×2.8 of the line). Also scaled pro rata, which is a guess.
3. **Source files worth repairing**: WOs 63–68 have `#REF!` in `نهائي`
   (read from the sibling `1` sheet); WOs 61, 62, 69, 70 are in the register
   with no workbook. (WO 3's «missing» تدقيق sheet was just named `الطلبات` —
   loaded by 0058/0059.)
4. **WOs 27 and 31** do not tie to their own line quantities (0.87 and 1.10).

**Decisions taken that could be revisited**

5. ~~Per-sub executed is still all on «كوبري — تنفيذ ذاتي».~~ **Resolved by
   0057 (§2a), pasted 2026-08-17.** Residual judgement: the 87 pro-rata pairs
   (KD 671k, 5.2%) in `expw-exec-report.md`; if Fouad prefers a rule other than
   proportional (e.g. earliest requests to the sub), change `attribute()`
   step 3 and re-run — the migration is idempotent and rewrites split rows.
6. **9 subcontractor claims reference items absent from their work order**
   (largest WO 11 bab 4/4, 137,275 م²) and are skipped.

**Unverified, and not checkable from the CLI**

7. **SECURITY: public email signup may still be enabled** on the Supabase
   project. Anyone with the publishable key from the app bundle could
   self-register and read every `qm_*` row — now including the Expressway.
   Fix: Authentication → Sign In / Up → disable "Allow new users to sign up".
   **Raise this again if it is still on.**
8. **No end-to-end test with a real login has ever been run.** Worth doing now
   that both projects hold real data.
9. **QA auth account** never created; `fouad@copri.com` works.
10. **23 Hawalli work orders** tie to neither source — KD 2.8M of certified
    value. See `paycert-rebuild-report.md`. Needs the QA's records.

**Possible next builds** — engineer/QS approval workflow, Blueprint-map
integration, per-sub executed split, a subcontractor payment/valuation view
(the page currently reports quantities and contract value, not what is owed at
negotiated rates).

## 5a. Site / location model (front-end rework, 2026-08-17)

Fouad's spec: **Hawalli** = قطعة + شارع / شارع رئيسي / أخرى;
**Expressway** = طريق الفحيحيل (30) / طريق الملك فهد (40) / أخرى, and under
a road either a **km range** (from/to station) or a **specific intersection**.

- Lives in `app/src/screens/quantities/site.ts` (model, station parsing,
  derivations, `locationLabel`) + `SiteFields.tsx` (the form cells, shared by
  `KashefNew` and the detail `EditDialog`). Model is chosen by contract code:
  `EXPW` → roads, everything else → areas.
- **No schema change.** Roads model maps onto 0049's columns: `area` = the
  canonical road name (or free text for «أخرى»), `loc_type` 'chainage' when a
  road / level 2 is given, 'misc' only for «أخرى» + «بدون تحديد»;
  `km_from/km_to` for a range, `location_text` = the intersection name (spot)
  or an optional description (range — auto-composed «من محطة 9+200 إلى محطة
  12+200» when empty, because 0049 requires a non-empty text for chainage).
- **Level 2 is derived on read-back**: km set ⇒ range; else text beyond the
  road + direction ⇒ spot; else whole road. Historic rows keep the ministry's
  full sentence in `location_text`; the label only prefixes the road when the
  text does not already name it. Badges/filters use `siteKind()`
  (block / street / misc / range / spot / road), not `loc_type`.
- Stations are typed as **km+m** («9+200»); the parser also takes the
  mirrored «200+9», «9.2» and plain «12» — the 3-digit token is metres.
- Misc rows are pinned to «أخرى» in the edit dialog: their `area` IS the
  description (WO 34 mentions الفحيحيل) and must not be re-read as a road.
- **0061 (data-only, PENDING PASTE)** canonicalises `area` for Expressway
  chainage rows naming exactly one road — simulated against 0050: WOs 3, 6,
  19 → «طريق الفحيحيل» (WO 53 «… + …» skipped by the `+` guard). Optional but
  it un-splits the register's area filter.

## 5b. Description + scope taxonomy + Expressway site clean-up (0062)

- **`qm_kashefs.description`** — the ministry's own wording; **shown ONLY on
  the WO page** (header + edit dialog). Register/dashboard use the short
  site fields. **`qm_kashefs.scopes text[]`** — MULTI-select scope of works,
  codes `asphalt | civil | storm | sewage | tiles | metal | other`; the four
  reporting categories are asphalt / civil (general, أمطار, صحي, بلاط) /
  metal / other (`scopes.ts`, `ScopeFields.tsx`). `work_type` stays the
  printable label, rewritten from the scopes on save («أسفلت + أعمال
  معدنية»); rows with empty scopes (Hawalli backfill) still show/filter by
  their legacy text via a keyword fallback (`categoriesOf`). Dashboard «حسب
  نوع الأعمال» buckets each WO under its PRIMARY category (first in
  taxonomy order) so money is not double-counted.
- **0062 = schema + RPCs (create/update learn description + scopes; scopes
  arrive in `qm_kashef_update` as a comma-separated code string) + view
  columns APPENDED + the Expressway DATA clean-up: all 65 WOs re-keyed by
  the explicit table in `tools/qm_expw_site_clean.py`** (area = road or a
  short «other» site, location_text = range/spot, direction, description =
  old sentence, scopes + work_type; changelog actor `expw-site-clean`).
  Re-run the tool after editing the mapping; the SQL only UPDATEs.
  **0062 PASTED 2026-08-17.** 0061 is redundant (skip it).
- Dates: `fmtKWDate` strips the RTL marks the `ar-KW` locale inserts (they
  scrambled dd/mm/yyyy inside `dir="ltr"`), and treats a bare ISO date as a
  calendar date. Wrap inline dates in `<bdi dir="ltr">`.

## 6. Conventions

- Migrations are append-only numbered files in `supabase/migrations/`.
  **Fouad pastes them** — never assume applied until he confirms.
- Push to `main` deploys. Ask before pushing unless he is in a ship-it flow.
  Never touch the copri.com apex site.
- Update the memory directory and the Notion tracker page
  ("Quantities management", Area = Quantities) when milestones land.
- Verify UI changes in the dev preview before pushing (§3).
