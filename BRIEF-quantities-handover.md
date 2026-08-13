# BRIEF-quantities-handover.md
## Quantities module — session handover (written 2026-08-13)

For the next Claude Code session. The module is LIVE with historical data; this
brief is the state of the world + the remaining work. Read `CLAUDE.md` (repo
conventions) and `QUANTITIES_MODULE_BRIEF.md` (Desktop — original spec, now
partially superseded by the feedback rounds below) alongside this.

---

## 1. What exists and where

- **Module**: `/app/quantities` — the QA's work-order + طلبات تدقيق workspace.
  React screens in `app/src/screens/quantities/` (own i18n namespace
  `quantities`, Arabic-first + AR⇄EN toggle), lazy-mounted OUTSIDE the office
  guard with its own **Supabase Auth email gate** (plain `signInWithPassword`,
  no PIN, no pipeline_users link — unlike `/accounting`).
- **DB**: migrations **0033–0037** (all pasted by Fouad except **0037 —
  UNCONFIRMED at handover time**; verify, see §4). Tables `qm_contracts`,
  `qm_bop_items`, `qm_kashefs`, `qm_kashef_lines`, `qm_allocations`,
  `qm_tadqiq(+lines)`, `qm_changelog`. RLS `to authenticated` ONLY on all qm_*
  (anon/PIN sees nothing); all writes via `qm_*` SECURITY DEFINER RPCs that
  write the changelog in-transaction. Views `qm_kashef_overview`,
  `qm_line_status`, `qm_sub_line_status` (security_invoker, authenticated-only).
- **Deployed**: main @ `4828239`, Vercel auto-deploy, prod
  `app.copri.com/app/quantities` (verified serving the module login).

## 2. Model decisions (supersede parts of the original brief)

1. **DIRECT-WO MODEL** (feedback round 1): the kashef→approval flow is
   ABANDONED. The QA creates/uploads work orders directly. `status` column
   stays but the app always writes `'wo'`; `qm_kashef_approve` exists in the
   DB but is unused. WO number = `kashef_no` (int) = `wo_no` (text mirror).
   Unissued/placeholder WOs live in the **900 range** (901–906); the new-WO
   form suggests next number ignoring ≥900.
2. **Three quantity tiers per line**: WO qty / allocated (per sub) / executed
   (Σ طلبات تدقيق per sub). Over-allocation and executed>allocated **WARN,
   never block** (warnings also logged to changelog).
3. **Fully editable, always**: header (incl. wo_no/wo_date/`duration_days`),
   line qty, line add/remove (removal cascades its allocations, all logged).
   WO delete cascades everything, leaving a changelog summary row (0037).
4. **طلب تدقيق**: one sub + one date + free-entry `serial_no`; adaptive
   location (block ⇒ street_no required; street ⇒ inherited; متفرقات ⇒ none);
   out-of-WO items allowed + flagged.
5. **History = append-only `qm_changelog`** (entity_id is always the kashef
   id; entities kashef/kashef_line/allocation/tadqiq). No version forks.

## 3. Historical backfill (DONE — know its shape)

`tools/qm_backfill.py` (+ `tools/qm-backfill-map.json`, confirmed) parsed
Fouad's corpus on `D:\التجميع الشهري new` and generated the pasted SQL:

- **76 WOs, 1,882 lines, 135 opening طلبات تدقيق (1,610 lines)**. Sources: WO
  register (`Downloads\سجل أوامر العمل والدفعات - عقد 9.xlsx`), per-WO
  `كشف حساب` workbooks (WO qty + dated monthly جزئي executed + مجموع), and
  per-company `جميع الشركات` sheets in the monthly `دفعات الوزارة` folders
  (قديم+جديد cumulative per sub).
- Executed history = ONE opening entry per WO×sub (`opening=true`), dated at
  the WO's last دفعة. Allocations seeded = executed (Fouad's "Option B").
- **كوبري self-performed = per-line residual** vs the ministry مجموع (its own
  monthly sheets over-count); **CCC = Copri's asphalt operation**, merged into
  كوبري via `mergeInto` in the map file. **فتيح = المثنى** (same company).
- Vendor canonicalization (0037): history sits on Fouad's Arabic rows
  **9–16** (9 المثنى، 10 بحر الابداع، 11 بوبيان، 12 الكندية، 13 الجارحي،
  14 وايت بروجكت، 15 الوفرة، 16 اليمامة) + no-twin rows 54 المد الاخضر،
  371 عبيد، 493 دالكو، 495 الجود + **591 كوبري — تنفيذ ذاتي** (single history
  bucket; Fouad's unit rows 17 مصنع الأسفلت / 18 القشط / 19 الكراج exist for
  going-forward use — folding 591 into one of them is a one-line remap if asked).
- Header-only WOs (no lines): 1–5, 7, 8, 11, 14 (final kashefs are scanned
  PDFs in `كشوف تنفيذية نهائية...`), 26, 39. Their per-sub payment data was
  still imported where found (entries flagged out-of-kashef), likewise WO 901
  (مدني سلوى ق12).
- **Known data caveat**: 17 WOs have named-sub totals slightly ABOVE the
  ministry cumulative (worst: WO 18, 9, 30) — kept as the QA's sheets state
  (work-ahead-of-paper is legitimate); listed in
  `Desktop\quantities-backfill\qm-backfill-report.md`.
- The tool re-runs idempotently (per-WO guards); outputs land in
  `Desktop\quantities-backfill\`. BOP validation report:
  `QUANTITIES_BOP_VALIDATION.md` (repo root) — 4 corrected source typos.

## 4. FIRST THINGS TO VERIFY next session

1. **0037 pasted?** Anon probe: `vendors?qm_subcontractor=eq.true` should show
   the Arabic rows 9–16 and NOT 490/494/498/500/525/468/536/538. If ERP rows
   are still flagged → ask Fouad to paste `0037_qm_vendor_canon_delete.sql`.
2. **QA auth account** — still missing (Supabase dashboard → create email user;
   no linking needed). fouad@copri.com works today.
3. **E2E smoke test with a real login** (nobody has done one yet!): open a
   backfilled WO → check lines/tiers/duration render → edit a qty → allocate →
   record a طلب تدقيق (with serial; force an over-allocation warning) → print
   أمر مقاول → changelog panel → delete a scratch WO. Also Excel-import one
   real kashef file (e.g. `Desktop\Bayan - Block 4\بيان قطعة4 - أعمال مدنية.xls`).
4. The UI was built from the brief's §7 spec — the approved
   `quantities-ui-preview.jsx` was a claude.ai artifact never on disk. Fouad
   has NOT yet compared the live UI to what he approved; expect tweak requests.

## 5. Hard-won gotchas (do not relearn these)

- **BOP ids are bidi-inconsistent**: standalone BOP stores band/bab, kashef
  files bab/band, both render bab-first. NEVER trust segment order — validate
  against the bab set {1,2,3,4,5,6,7,12,14,17,22} + BOP existence. bab & band
  are separate int columns + Arabic letter suffix; normalize hamza (أ→ا)
  before matching. Display always `bab/band` inside `dir="ltr"` isolates.
- **Supabase SQL editor**: anonymous `$$` bodies get MIS-SPLIT in long pastes
  ("unterminated dollar-quoted string") → always use named tags (`$qm$`);
  queries over ~1MB are refused → split generated SQL into part files
  (part 1 carries shared setup; later parts guard on its side effects).
- In-sheet titles in the QA's `جميع الشركات` workbooks are STALE COPIES
  (wrong WO/site) — trust folder/file names only.
- `vendors.kind` is NOT NULL without default — inserts need it.
- Legacy `work_orders` table (dispatch auto-fill, revenue side) and pipeline
  `WO-` commitments are DIFFERENT things from qm work orders. Never join.
- The repo pre-existing untracked files `AUDIT_REPORT.md`/`SN_API_FINDINGS.md`
  belong to another session — don't commit them.

## 6. Remaining work (in rough order)

1. Whatever this session's opening request is — Fouad said "the remainder of
   the work", likely: smoke-test fixes + UI polish after he reviews, then
   **phase 2 = PAYMENTS** (Fouad will spec; the register's مصفوفة الدفعات
   sheet + دفعات المقاولين folders are the obvious data sources; subcontract
   certificates machinery already exists in the pipeline — 0021).
2. Out of scope from phase 1, still pending someday: engineer/QS approval
   workflow, Blueprint-map location integration, Expressway contract seeding,
   bulk historical-import UI (schema-ready).
3. Notion: tracker page "Quantities management" + Open Items rows exist and
   are current to 0037-pending — keep updating per standing instruction
   (Area select now has a "Quantities" option).

## 7. Conventions reminders

- Migrations: append-only numbered files in `supabase/migrations/`; **Fouad
  pastes them** in the dashboard SQL editor — never assume applied until he
  confirms; verify with anon probes where possible.
- Push to main = Vercel deploy. Ask/confirm before pushing unless Fouad is in
  a ship-it flow (this session he was). Never touch copri.com apex.
- Update the memory directory + Notion when milestones land.
- Design system: `copri-frontend-SKILL.md` is the look-and-feel authority
  (logical CSS properties only, `RefCode`/`bdi` for codes, KD 3 decimals,
  warnings are the only colored surfaces).
