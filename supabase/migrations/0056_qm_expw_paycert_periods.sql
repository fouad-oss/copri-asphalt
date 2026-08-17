-- ════════════════════════════════════════════════════════════════════
-- 0056 — QUANTITIES: the Expressway certificate periods
--        (Fouad, 2026-08-17)
--
-- 0052 imported the 21 ministry payment certificates but left period_end
-- NULL, because nothing in the corpus stated the periods and no monthly
-- rule I could test fitted the data. Fouad has now given the rule:
--
--     each certificate covers works up to the FIFTH of its month,
--     starting with certificate 1 at 2024-12-05
--
-- i.e. period_end(N) = 2024-12-05 + (N - 1) months.
--
-- Corroboration: every one of the 21 PDFs in الدفعات الشهرية was submitted
-- AFTER its own period end under this rule (lag 0-52 days, typically one
-- to three weeks), with zero violations. The reading I had been unable to
-- rule out — anchoring on الكشف الشهري «حتى 05/07/2026» for شهادة دفع 021
-- and stepping back a month at a time — would instead have placed
-- certificate 1 at 2024-11-05, before work order 1 had even started on
-- 2024-11-06. Under the confirmed rule 05/07/2026 is the period end of
-- certificate 20, so the working papers filed in `الدفعة` run one ahead of
-- the payment number printed on the form.
--
-- tools/qm_expw_paycert.py now computes these, so a regenerated 0052
-- carries them; this migration is the patch for the already-applied data.
-- Touches only source='mpw' certificates — hand-made ones are left alone.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

do $qmexpwpe$
declare
  v_contract bigint;
  v_updated int;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'run 0047 first'; end if;

  update qm_pay_certs c
     set period_end = t.period_end
    from (values
    (1, date '2024-12-05'),
    (2, date '2025-01-05'),
    (3, date '2025-02-05'),
    (4, date '2025-03-05'),
    (5, date '2025-04-05'),
    (6, date '2025-05-05'),
    (7, date '2025-06-05'),
    (8, date '2025-07-05'),
    (9, date '2025-08-05'),
    (10, date '2025-09-05'),
    (11, date '2025-10-05'),
    (12, date '2025-11-05'),
    (13, date '2025-12-05'),
    (14, date '2026-01-05'),
    (15, date '2026-02-05'),
    (16, date '2026-03-05'),
    (17, date '2026-04-05'),
    (18, date '2026-05-05'),
    (19, date '2026-06-05'),
    (20, date '2026-07-05'),
    (21, date '2026-08-05')
    ) as t(cert_no, period_end)
   where c.contract_id = v_contract
     and c.cert_no = t.cert_no
     and c.source = 'mpw'
     and c.period_end is distinct from t.period_end;

  get diagnostics v_updated = row_count;
  raise notice 'EXPW certificate periods: % updated, now spanning % .. %',
    v_updated,
    (select min(period_end) from qm_pay_certs
      where contract_id = v_contract and source = 'mpw'),
    (select max(period_end) from qm_pay_certs
      where contract_id = v_contract and source = 'mpw');
end $qmexpwpe$;
