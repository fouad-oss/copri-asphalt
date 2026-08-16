-- ════════════════════════════════════════════════════════════════════
-- 0047 — QUANTITIES: the real Expressway (الطرق السريعة) contract header
--
-- 0046 seeded EXPW with deliberate placeholders (pct 0, value/dates NULL)
-- so nothing silently inherited Hawalli's 9%. This replaces them with the
-- figures carried by the QA's own Expressway corpus
-- (~\Desktop\ExpresswaysQMbackfill):
--
--   name          صيانة عامة لطريق الملك فهد وطريق الفحيحيل
--                 — the contract name as every source writes it: the
--                   register header, each أمر عمل workbook (sheet كيمز,
--                   'اسم العقد'), الكشف الشهري للدفعة and مرفقات الدفعة.
--                   Replaces the 0046 placeholder 'أعمال الطرق السريعة'.
--   pct           19.00 — derived, then confirmed by Fouad 2026-08-16 as
--                   the contract-wide rate. See note below.
--   contract_value 15,250,000 — 'قيمة العقد' in the header block of all
--                   seven sheets of بيان اوامر العمل.xls, and
--                   'قيمــة العقــد الاصلية' in جدول قيمة الاعمال الشهرية.
--   start_date    2024-05-11 — 'تاريخ المباشرة' (Excel serial 45423),
--                   identical across all seven register sheets.
--   duration_days 1095 — 'مدة العقد' (= 'المدة الاصلية : 36 شهرا').
--
-- ── نسبة العقد is DERIVED, not stated ────────────────────────────────
-- No source in the corpus prints the percentage as a number. It is
-- recovered from كميات 9المفصلة.xls, sheet 'تصنيف ', which carries both
-- 'السعر الاجمالى' (col F) and 'السعر بعد نسبة العقد' (col G) per BOP
-- line. The ratio is exactly 1.19 on all 237 priced rows — no other
-- ratio occurs — so نسبة العقد = +19%. Fouad confirmed (2026-08-16) that
-- 19% is the contract-wide rate.
--
-- ── change_orders_value 3,812,500 ────────────────────────────────────
-- Two register sheets ('جميع اوامر العمل' and 'جميع اوامر العمل  (2)')
-- split the header into 'قيمة العقد الاصلية' 15,250,000 and
-- 'اجمالي قيمة العقد' 19,062,500. Fouad confirmed (2026-08-16) that the
-- 3,812,500 difference is a variation order actually received above the
-- original contract value — not unused ceiling — so it is recorded as
-- change_orders_value, exactly as 0042 does for Hawalli.
-- Total contract value therefore reads 19,062,500.
--
-- Data-only migration: not visible to an anon probe. Verify with
--   select code, name, pct, contract_value, start_date, duration_days
--     from qm_contracts where code = 'EXPW';
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

do $qmexpw$
declare
  v_contract bigint;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then
    raise exception 'qm_contracts EXPW missing - run 0046 first';
  end if;

  update qm_contracts
     set contract_no         = 'هـ ص / ط / 9',
         name                = 'صيانة عامة لطريق الملك فهد وطريق الفحيحيل',
         contractor          = 'شركة كوبري للمشاريع الإنشائية',
         pct                 = 19.00,
         contract_value      = 15250000,
         change_orders_value = 3812500,
         start_date          = date '2024-05-11',
         duration_days       = 1095
   where id = v_contract;

  raise notice 'EXPW contract header set (pct 19%%, value 15,250,000, start 2024-05-11, 1095 days)';
end $qmexpw$;
