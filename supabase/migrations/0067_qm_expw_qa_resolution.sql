-- 0067_qm_expw_qa_resolution — closes the two QA items left open by the 2026-08-19
-- Expressway quantities audit (expw-qty-audit.md §9), per Fouad 2026-08-19:
--
--   A. WO 31 — the 900 م² on 12/101 (ورق عاكس نموذج III, KD 19,931.31 after pct) was
--      CANCELLED. It sits alone on طلب تدقيق serial 508 (2025-06-20, كوبري) — the whole
--      request is deleted.
--   B. WO 2 — the bab-1 daywork requests were DEFERRED TO WO 30, and verification against
--      the live data shows they are ALREADY THERE: every one of serials 81, 82, 83, 84,
--      85, 87, 88, 89, 90 and 109 exists on WO 30 line-for-line with identical
--      quantities (WO 30's copies are the certified ones; only the dates differ, by the
--      0063 date repair). The 0051 import had read the same requests from both WOs'
--      cross-tabs. Deleting WO 2's copies therefore removes duplicates — nothing moves.
--      The one exception is serial 99 (5/80 بلاط متداخل, 12 م², KD 135.95 after pct):
--      it has NO counterpart on WO 30, so that single request is REASSIGNED to WO 30
--      (out_of_kashef stays true — 5/80 is not among WO 30's lines) as the genuinely
--      deferred work, awaiting certification there.
--
-- After this, WO 2 and WO 31 executed tie to the source exactly; WO 30 executed exceeds
-- certified by KD 135.95 = the deferred serial-99 work (correct: it shows in
-- «منتهية بانتظار الاعتماد» until the ministry certifies it under WO 30).
--
-- Idempotent: deletes/moves guard on current state. Actor 'qty-audit'.

do $qmqa$
declare
  v_contract bigint;
  v_k2   bigint;
  v_k30  bigint;
  v_k31  bigint;
  v_t    bigint;
  v_n    int;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'EXPW contract missing'; end if;
  select id into v_k2  from qm_kashefs where contract_id = v_contract and kashef_no = 2;
  select id into v_k30 from qm_kashefs where contract_id = v_contract and kashef_no = 30;
  select id into v_k31 from qm_kashefs where contract_id = v_contract and kashef_no = 31;
  if v_k2 is null or v_k30 is null or v_k31 is null then
    raise exception 'work order 2/30/31 missing';
  end if;

  -- ── A. WO 31 — cancelled 12/101 request (serial 508) ──────────────────────
  select t.id into v_t
  from qm_tadqiq t
  where t.kashef_id = v_k31 and t.serial_no = '508'
    and not exists (                       -- every line must be 12/101 (it is: single line)
      select 1 from qm_tadqiq_lines tl
      join qm_bop_items bi on bi.id = tl.bop_item_id
      where tl.tadqiq_id = t.id
        and not (bi.bab = 12 and bi.band = 101 and coalesce(bi.suffix,'') = ''));
  if v_t is not null then
    delete from qm_tadqiq_lines where tadqiq_id = v_t;
    delete from qm_tadqiq where id = v_t;
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k31, 'tadqiq_delete', '', '12/101',
            'طلب 508 — 2025-06-20 — كوبري — 900 م²', '',
            'qty-audit');
    raise notice 'A. WO 31 request 508 (12/101, 900) deleted';
  else
    raise notice 'A. WO 31 request 508 not found — already deleted';
  end if;

  -- ── B1. WO 2 — delete the 10 daywork requests duplicated on WO 30 ─────────
  -- Guarded three ways: the serial list, every line in the bab-1 daywork set, and an
  -- identical-quantity counterpart request existing on WO 30 under the same serial.
  with dup as (
    select t.id
    from qm_tadqiq t
    where t.kashef_id = v_k2
      and t.serial_no in ('81','82','83','84','85','87','88','89','90','109')
      and not exists (
        select 1 from qm_tadqiq_lines tl
        join qm_bop_items bi on bi.id = tl.bop_item_id
        where tl.tadqiq_id = t.id
          and not (bi.bab = 1 and coalesce(bi.suffix,'') = ''))
      and exists (
        select 1 from qm_tadqiq t30
        where t30.kashef_id = v_k30 and t30.serial_no = t.serial_no
          and (select coalesce(sum(x.qty),0) from qm_tadqiq_lines x where x.tadqiq_id = t30.id)
            = (select coalesce(sum(x.qty),0) from qm_tadqiq_lines x where x.tadqiq_id = t.id))
  ), gone as (
    delete from qm_tadqiq_lines where tadqiq_id in (select id from dup) returning tadqiq_id
  )
  delete from qm_tadqiq t using (select distinct tadqiq_id from gone) g
  where t.id = g.tadqiq_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k2, 'tadqiq_delete', '', 'باب 1',
            v_n || ' طلبات (81–90، 109) — أعمال يومية مكررة', '',
            'qty-audit');
  end if;
  raise notice 'B1. WO 2 duplicate daywork requests deleted: % (expected 10)', v_n;

  -- ── B2. WO 2 serial 99 (5/80, 12 م²) → WO 30 — the genuinely deferred work ─
  update qm_tadqiq t
  set kashef_id = v_k30,
      note = t.note || ' — مؤجَّل من أمر عمل 2 إلى أمر عمل 30 (قرار فؤاد 2026-08-19)'
  where t.kashef_id = v_k2 and t.serial_no = '99'
    and not exists (
      select 1 from qm_tadqiq_lines tl
      join qm_bop_items bi on bi.id = tl.bop_item_id
      where tl.tadqiq_id = t.id
        and not (bi.bab = 5 and bi.band = 80 and coalesce(bi.suffix,'') = ''));
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k2, 'update', 'kashef', '5/80',
            'أمر عمل 2', 'أمر عمل 30 — طلب 99 (12 م² بلاط) مؤجَّل، بانتظار الاعتماد',
            'qty-audit');
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k30, 'update', 'kashef', '5/80',
            'أمر عمل 2', 'أمر عمل 30 — طلب 99 (12 م² بلاط) مؤجَّل، بانتظار الاعتماد',
            'qty-audit');
  end if;
  raise notice 'B2. WO 2 serial 99 moved to WO 30: % (expected 1; 0 = already moved)', v_n;
end $qmqa$;

-- ── post-paste check (read-only) ────────────────────────────────────────────
-- Executed must now equal certified on WOs 2 and 31, and exceed it by 135.946
-- (= 12 م² × 9.52 × 1.19) on WO 30 only:
-- select k.kashef_no,
--        round(sum(tl.qty * bi.rate) * 1.19, 3) as executed_after_pct
-- from qm_tadqiq t join qm_kashefs k on k.id = t.kashef_id
-- join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
-- join qm_bop_items bi on bi.id = tl.bop_item_id
-- where k.contract_id = (select id from qm_contracts where code='EXPW')
--   and k.kashef_no in (2, 30, 31)
-- group by k.kashef_no order by 1;
-- expected: 2 → 353,132.967 · 30 → 600,360.641 · 31 → 202,580.813
