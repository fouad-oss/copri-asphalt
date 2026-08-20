-- 0068_qm_expw_580_back_to_wo2 — reverses part B2 of 0067 (Fouad, 2026-08-19):
-- طلب تدقيق serial 99 (the single 5/80 بلاط متداخل line, 12 م², KD 135.95 after pct)
-- returns from WO 30 to WO 2. The deferral note appended by 0067 is stripped.
-- Effect: WO 30 executed ties its certified total again; WO 2 executed exceeds
-- certified by KD 135.95 (the line stays out_of_kashef — 5/80 is not among WO 2's
-- lines either).
-- Idempotent: no-op if the request is already on WO 2. Actor 'qty-audit'.

do $qm580$
declare
  v_contract bigint;
  v_k2  bigint;
  v_k30 bigint;
  v_n   int;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'EXPW contract missing'; end if;
  select id into v_k2  from qm_kashefs where contract_id = v_contract and kashef_no = 2;
  select id into v_k30 from qm_kashefs where contract_id = v_contract and kashef_no = 30;
  if v_k2 is null or v_k30 is null then raise exception 'work order 2/30 missing'; end if;

  update qm_tadqiq t
  set kashef_id = v_k2,
      note = replace(t.note, ' — مؤجَّل من أمر عمل 2 إلى أمر عمل 30 (قرار فؤاد 2026-08-19)', '')
  where t.kashef_id = v_k30 and t.serial_no = '99'
    and not exists (
      select 1 from qm_tadqiq_lines tl
      join qm_bop_items bi on bi.id = tl.bop_item_id
      where tl.tadqiq_id = t.id
        and not (bi.bab = 5 and bi.band = 80 and coalesce(bi.suffix,'') = ''));
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k30, 'update', 'kashef', '5/80',
            'أمر عمل 30', 'أمر عمل 2 — طلب 99 (12 م² بلاط) أُعيد إلى أمر عمل 2 (قرار فؤاد 2026-08-19)',
            'qty-audit');
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k2, 'update', 'kashef', '5/80',
            'أمر عمل 30', 'أمر عمل 2 — طلب 99 (12 م² بلاط) أُعيد إلى أمر عمل 2 (قرار فؤاد 2026-08-19)',
            'qty-audit');
  end if;
  raise notice 'serial 99 (5/80) moved back to WO 2: % (0 = already there)', v_n;
end $qm580$;

-- ── post-paste check (read-only) ────────────────────────────────────────────
-- select k.kashef_no, round(sum(tl.qty * bi.rate) * 1.19, 3) as executed_after_pct
-- from qm_tadqiq t join qm_kashefs k on k.id = t.kashef_id
-- join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
-- join qm_bop_items bi on bi.id = tl.bop_item_id
-- where k.contract_id = (select id from qm_contracts where code='EXPW')
--   and k.kashef_no in (2, 30)
-- group by k.kashef_no order by 1;
-- expected: 2 → 353,268.913 · 30 → 600,224.695
