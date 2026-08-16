# BRIEF — Expressway (الطرق السريعة) backfill into the quantities module

For the next Claude Code session. Written 2026-08-15, at the end of the
session that built payment certificates, the MPW mirroring and multi-project
support. Read `CLAUDE.md` (repo conventions) and `copri-frontend-SKILL.md`
(design authority) alongside this. The earlier `BRIEF-quantities-handover.md`
describes phase 1 and is still accurate for the module's domain model.

**Job:** load the Expressway project's data into the existing module. No new
screens. The module is already multi-project; the Expressway just needs its
contract header, its price book, its work orders and its payments — mirroring
exactly what Hawalli contract 9 has.

---

## 1. State of the world

- **Module**: `/app/quantities`, React screens in `app/src/screens/quantities/`,
  own Supabase-Auth email gate, Arabic-first with an AR⇄EN toggle.
  Repo: `C:\Users\fszog\Desktop\Copri webapp` (local-only, not in OneDrive).
- **Migrations 0033–0046 are ALL pasted and confirmed** (2026-08-15). Nothing
  is pending. Front-end deployed via Vercel on push to `main`.
- **Screens**: home dashboard · أوامر العمل register (with filters) ·
  دفعات الوزارة (certificates dashboard + detail + generate) · طلبات التدقيق ·
  new work order (manual or Excel import).
- **Hawalli figures for reference** (so you can sanity-check the Expressway
  ones): 76 work orders, ~2,295 lines after the OCR heal, 17 payment
  certificates / 2,381 lines / KD 9.38M after 9%, ministry tracker says
  KD 12.21M, 46 work orders closed.

## 2. How multi-project works (read before touching anything)

The schema was per-contract from day one — `qm_kashefs.contract_id`,
`qm_bop_items.contract_id`, `unique (contract_id, kashef_no)`. So each project
keeps **its own WO numbering and its own price book**, through the same screens.

- **App**: `data.ts` holds the selection — `getContract()` / `setContract()`,
  persisted in `localStorage['qm.contract']`, default `HAW9`. Every read is
  scoped by `contract_code` (views that carry it) or `contract_id`
  (via `contractId()`). `contractInfo` and the BOP are cached **per project**.
  `ProjectSwitcher.tsx` sits in the header and hides itself when only one
  contract exists; `<Routes key={project}>` remounts screens on switch.
- **DB**: `qm_contracts` is the project table. 0046 appended `contract_id` to
  the five views that used to aggregate across all contracts
  (`qm_sub_totals`, `qm_monthly_exec`, `qm_wo_flags`, `qm_certified_totals`,
  `qm_exec_totals`).
- **Nothing else needs changing to add a project** — only data.

### The Expressway row as seeded (0046) — MUST be corrected

```
code 'EXPW' · contract_no 'هـ ص / ط / 9' · name 'أعمال الطرق السريعة'
contractor 'شركة كوبري للمشاريع الإنشائية' · pct 0
contract_value / start_date / duration_days = NULL
```

`pct 0` and the nulls are deliberate placeholders so nothing silently
inherits Hawalli's 9%. **First migration of the new session should set the
real header** (contract no, name, نسبة العقد, value, start date, duration) —
those figures come from Fouad. Until then the Expressway dashboard shows raw
rates and a blank contract strip, which is correct-but-useless.

What the app already knows about this project (from
`app/src/screens/dispatch/reference.ts`): «كوبري — الطرق السريعة», contract
`هـ ص / ط / 9`, sites طريق الملك فهد / طريق الفحيحيل / أخرى, locations are
**km ranges** not blocks, engineers أحمد عبد الرحمن / أندرو ماهر / علي صابر.

⚠ **The km-range location model may not fit `qm_kashefs`' block/street/misc.**
Check the real work orders before assuming; if Expressway WOs are chainage-based,
raise it with Fouad rather than forcing them into `misc`.

## 3. Order of work

1. **Contract header** — one small migration updating the EXPW row.
2. **BOP (جدول الأسعار)** — must exist before any work order can reference it.
   Mirror `0034_qm_bop_seed.sql`. Guard on `contract_id` of EXPW, and re-read
   §5 gotchas about bab/band before parsing anything.
3. **Work orders** — mirror `tools/qm_backfill.py`. If scanned أوامر عمل exist,
   the OCR pass (§4) is worth repeating: on Hawalli it produced the
   authoritative durations and values and caught 413 missing lines.
4. **Payments** — mirror `tools/qm_paycert_rebuild.py`. Needs whatever the
   Expressway equivalent of the `كشف حساب` workbooks and `دفعات الوزارة`
   folders is, plus its ministry tracking report if one exists.
5. **Closed work orders** — mirror `0043`, driven by the tracker's status text.

Each step is independently pasteable and independently verifiable; do not
batch them.

## 4. The tools that already exist (all in `tools/`, all re-runnable)

| tool | what it does |
|---|---|
| `qm_backfill.py` | WO headers + lines + allocations + opening تدقيق from the register, `كشف حساب` workbooks and `دفعات الوزارة` folders. Contains the reusable parsers: `parse_hesab`, `parse_company_sheet`, `classify_sheet`, `payment_folders`, `wo_key_of_folder`, `norm_ar/norm_suffix`. **Import from it rather than rewriting.** |
| `qm_paycert_from_hesab.py` | certificates from the dated `جزئي` columns |
| `qm_payfolders_audit.py` | four-way audit: tracker vs folders vs executed vs certificates |
| `qm_paycert_rebuild.py` | **the current certificate generator** — picks the best source per WO against the tracker, drops copied-forward months, emits sub-1MB parts |
| `qm_exec_rebuild.py` | rebuilds executed (opening تدقيق) per subcontractor from the folders + resyncs allocations |
| `qm_tracker_reconcile.py` | diffs the ministry tracking report against the module |
| `wo-ocr/` (on Desktop) | `INSTRUCTIONS.md` for the vision-extraction agents, `compare.py` (OCR vs DB diff), `gen_heal.py` (emits the heal SQL) |

Outputs land in `C:\Users\fszog\Desktop\quantities-backfill\`. The Hawalli
reports there are worth reading as worked examples — especially
`paycert-rebuild-report.md` and `payfolders-audit.md`.

**The OCR pipeline** (used for the 210 Hawalli WO scans): split the folders
across ~10 parallel subagents, each following `wo-ocr/INSTRUCTIONS.md`, each
writing one JSON per PDF; then `compare.py` diffs them against the DB and
`gen_heal.py` emits the corrections. Claude's vision reads these Arabic scans
well; Azure Document Intelligence is **not** available (subscription disabled).

## 5. Gotchas — do not relearn these

**Data shape**
- **bab/band are bidi-inconsistent.** Standalone BOP files store band/bab,
  kashef files bab/band, both *render* bab-first. Never trust segment order —
  validate against the bab set and BOP existence, and disambiguate with the
  printed rate when both readings resolve. Normalize hamza (أ→ا) in suffixes.
- **`قديم+جديد` sheets are NOT work-order cumulative** (at least from 2026) —
  they're per-batch. Proven on Hawalli WO 34: those sheets totalled KD 41K
  while the same companies' monthly sheets totalled 277K. Use the **monthly
  (plain) sheets** for quantities; use `قديم+جديد` only for sub allocations.
- **Payment folders contain copied-forward months** — a month whose sheet is
  identical to the previous month for the same WO+company is a stale copy, not
  new work. 47 such sheets in Hawalli; ignoring this overstated WO 24 by 50%.
- **Folder sheets are subcontractor CLAIMS** and can legitimately exceed what
  the ministry certified. That is why some work orders never tie.
- **The ministry tracking report is the CONTROL TOTAL** — Fouad confirmed it is
  transcribed from what the ministry approved. Its *status text* column is
  authoritative, not its coloured P-marker columns. WO numbers in it are stored
  as **text**, and the data starts at row 16.
- In-sheet titles inside the QA's workbooks are stale copies — trust folder and
  file names only.
- `vendors.kind` is NOT NULL without a default. Subcontractors are
  `vendors.qm_subcontractor`; after 0037 the canonical ids are the Arabic rows
  9–16 plus 54, 371, 493, 495 and 591 (كوبري — تنفيذ ذاتي, which absorbs CCC).

**Postgres / Supabase**
- **`create or replace view` cannot rename or reorder columns** (ERROR 42P16) —
  new columns must be **appended last**. Hit this on 0046. Use explicit
  `GROUP BY` columns, never ordinals, in views you may extend later.
- Anonymous `$$` bodies get mis-split in long pastes — always use named tags
  (`$qm$`, `$qmbf$`, `$qmpc$`…).
- The SQL editor refuses pastes over ~1 MB — **split into numbered parts**, each
  a self-contained `do` block, split only between records. Validate before
  handing over: one `do`/`end` per part, `end if;` count matching, no duplicate
  records across parts.
- **Anon probe to check whether an object exists**: `42501 permission denied`
  means the view exists and RLS is doing its job; a schema error means it was
  never created. Data-only migrations are invisible this way — verify those
  with a counting query instead.

**App**
- `supabase.ts` binds `fetch` late specifically so the dev preview can be driven
  with an injected mock. That is how every screen in this module was verified
  without a login — inject a session into
  `localStorage['sb-abwsxqnppihrmkhydkai-auth-token']` plus a `window.fetch`
  stub. **`.single()` returns an object, not an array** — a mock that returns an
  array poisons the contract cache and makes `contract_id` come out `undefined`.
- All money is displayed **after نسبة العقد**; the views return pre-pct sums and
  the app multiplies. KD is always 3 decimals, codes and quantities always
  inside `dir="ltr"`/`<bdi>`.
- Logical CSS properties only (`ms-*`/`me-*`), no `ml/mr`.

## 6. Open items (not Expressway, still outstanding)

1. **SECURITY: public email signup is still enabled** on the Supabase project.
   Anyone with the publishable key from the app bundle can self-register and
   read every qm_* row. Fix: Authentication → Sign In / Up → disable
   "Allow new users to sign up". Raise this again if it is still on.
2. **QA auth account** never created; `fouad@copri.com` works.
3. **No end-to-end test with a real login has ever been run.**
4. **23 Hawalli work orders** in `paycert-rebuild-report.md` tie to neither
   source — KD 2.8M of certified value. Needs the QA's records, not more
   parsing.
5. **WO 50 (Hawalli)**: tracker says 119,627, the latest scanned amendment says
   97,228 — a newer amendment is missing from its folder.
6. Deferred features: subcontractor management page (0045 already produced the
   per-sub executed data it needs), engineer/QS approval workflow, Blueprint-map
   integration.

## 7. Conventions

- Migrations are append-only numbered files in `supabase/migrations/`.
  **Fouad pastes them** — never assume applied until he confirms; verify with an
  anon probe where possible.
- Push to `main` deploys. Ask before pushing unless he is in a ship-it flow.
  Never touch the copri.com apex site.
- Update the memory directory and the Notion tracker page
  ("Quantities management", Area = Quantities) when milestones land.
- Verify UI changes in the dev preview before pushing — `preview_start` with the
  `copri-app` launch config, then the mock-injection technique above.
