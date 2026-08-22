-- ✅ APPLIED LIVE 2026-08-22 via the service-role API (row-for-row equivalent; all 10
--    operations confirmed 1 row each, verified by re-pull). Kept as the record —
--    re-pasting is a harmless no-op (every write guards on the current value).
--
-- 0071_qm_expw_fils_outstanding — removes the last executed-vs-certified residues on
-- the Expressway that carry no payment behind them (Fouad, 2026-08-22):
--
--   A. WO 2 — طلب تدقيق serial 99: the single 5/80 بلاط متداخل line (12 م²,
--      KD 135.95 after pct). Claimed in the WO 2 workbook's payment-3 papers but never
--      certified by the ministry (كميات settles WO 2 without it) — DELETED COMPLETELY
--      (request + line). The «… (2)» siblings of serial 99 carry item 2/80 and are
--      certified — untouched.
--   B. WO 41 — three fils-level rounding misalignments between the three tiers
--      (executed came from the تدقيق cross-tabs at 3 d.p., certificates from كميات at
--      2 d.p.). All three tiers are aligned to the MINISTRY-CERTIFIED quantity:
--        7/114  exec 120.863 → 120.860 (−0.003, KD −0.09)  + the stray 0.003 كوبري
--                allocation row is deleted (rounding residue of allocated:=executed)
--        7/175  exec  54.875 →  54.880 (+0.005, KD +0.03)
--        7/25   exec 457.375 → 457.380 (+0.005, KD +0.01)
--      kashef line qty and allocations follow the same certified figures.
--
-- After this, executed == certified to the fils on every Expressway WO except WO 63,
-- whose genuine uncertified work (KD 9,215.57 pre-pct on 2/61 + 2/17) awaits the next
-- certificate — see 0072 for its true scope.
--
-- Idempotent: every write guards on the current value. Actor 'qty-audit'.

do $qmfils$
declare
  v_contract bigint;
  v_k2   bigint;
  v_k41  bigint;
  v_copri bigint;
  v_t    bigint;
  v_item bigint;
  v_line bigint;
  v_n    int;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'EXPW contract missing'; end if;
  select id into v_k2  from qm_kashefs where contract_id = v_contract and kashef_no = 2;
  select id into v_k41 from qm_kashefs where contract_id = v_contract and kashef_no = 41;
  if v_k2 is null or v_k41 is null then raise exception 'work order 2/41 missing'; end if;
  select id into v_copri from vendors where name = 'كوبري — تنفيذ ذاتي';
  if v_copri is null then raise exception 'كوبري — تنفيذ ذاتي vendor missing'; end if;

  -- ── A. WO 2 — delete طلب 99 (the 5/80-only request, never certified) ──────
  select t.id into v_t
  from qm_tadqiq t
  where t.kashef_id = v_k2 and t.serial_no = '99'
    and not exists (                       -- every line must be 5/80 (it is: single line)
      select 1 from qm_tadqiq_lines tl
      join qm_bop_items bi on bi.id = tl.bop_item_id
      where tl.tadqiq_id = t.id
        and not (bi.bab = 5 and bi.band = 80 and coalesce(bi.suffix,'') = ''));
  if v_t is not null then
    delete from qm_tadqiq_lines where tadqiq_id = v_t;
    delete from qm_tadqiq where id = v_t;
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k2, 'tadqiq_delete', '', '5/80',
            'طلب 99 — 2024-12-29 — كوبري — 12 م² بلاط متداخل (منفذ غير معتمد، لا دفعة له)', '',
            'qty-audit');
    raise notice 'A. WO 2 request 99 (5/80, 12) deleted';
  else
    raise notice 'A. WO 2 request 99 (5/80) not found — already deleted';
  end if;

  -- ── B. WO 41 — align the three fils lines to the certified quantities ─────

  -- B1. 7/114 — exec 120.863 → 120.860
  select id into v_item from qm_bop_items
  where contract_id = v_contract and bab = 7 and band = 114 and coalesce(suffix,'') = '';
  if v_item is null then raise exception 'bop 7/114 missing'; end if;
  select id into v_line from qm_kashef_lines where kashef_id = v_k41 and bop_item_id = v_item;

  update qm_kashef_lines set qty = 120.86
  where id = v_line and qty = 120.863;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_k41, 'line_qty', '', '7/114', '120.863',
            '120.86 — مطابقة الكمية المعتمدة (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  update qm_tadqiq_lines tl set qty = 27.153
  from qm_tadqiq t
  where t.id = tl.tadqiq_id and t.kashef_id = v_k41 and t.serial_no = '703'
    and tl.bop_item_id = v_item and tl.qty = 27.156;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k41, 'update', 'qty', '7/114',
            'طلب 703 — 27.156', '27.153 — مطابقة الكمية المعتمدة (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  delete from qm_allocations a
  where a.kashef_line_id = v_line and a.vendor_id = v_copri and a.qty <= 0.0031;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('allocation', v_k41, 'alloc_set', '', '7/114 — كوبري — تنفيذ ذاتي', '0.003',
            '0 — إزالة بقية تدوير (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  -- B2. 7/175 — exec 54.875 → 54.880
  select id into v_item from qm_bop_items
  where contract_id = v_contract and bab = 7 and band = 175 and coalesce(suffix,'') = '';
  if v_item is null then raise exception 'bop 7/175 missing'; end if;

  update qm_kashef_lines set qty = 54.88
  where kashef_id = v_k41 and bop_item_id = v_item and qty = 54.875;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_k41, 'line_qty', '', '7/175', '54.875',
            '54.88 — مطابقة الكمية المعتمدة (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  update qm_tadqiq_lines tl set qty = 25.205
  from qm_tadqiq t
  where t.id = tl.tadqiq_id and t.kashef_id = v_k41 and t.serial_no = '755'
    and tl.bop_item_id = v_item and tl.qty = 25.2;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k41, 'update', 'qty', '7/175',
            'طلب 755 — 25.2', '25.205 — مطابقة الكمية المعتمدة (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  -- B3. 7/25 — exec 457.375 → 457.380
  select id into v_item from qm_bop_items
  where contract_id = v_contract and bab = 7 and band = 25 and coalesce(suffix,'') = '';
  if v_item is null then raise exception 'bop 7/25 missing'; end if;

  update qm_kashef_lines set qty = 457.38
  where kashef_id = v_k41 and bop_item_id = v_item and qty = 457.375;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_k41, 'line_qty', '', '7/25', '457.375',
            '457.38 — مطابقة الكمية المعتمدة (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  update qm_tadqiq_lines tl set qty = 319.005
  from qm_tadqiq t
  where t.id = tl.tadqiq_id and t.kashef_id = v_k41 and t.serial_no = '829'
    and tl.bop_item_id = v_item and tl.qty = 319;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k41, 'update', 'qty', '7/25',
            'طلب 829 — 319', '319.005 — مطابقة الكمية المعتمدة (تسوية فلسات 2026-08-22)', 'qty-audit');
  end if;

  raise notice 'B. WO 41 fils alignment done';
end $qmfils$;

-- ── post-paste check (read-only) ────────────────────────────────────────────
-- Executed vs certified per WO — expected: NO rows except WO 63 (its 2/61 + 2/17
-- uncertified work, +9,215.570 pre-pct):
-- with e as (
--   select t.kashef_id, tl.bop_item_id, sum(tl.qty) q
--   from qm_tadqiq t join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
--   group by 1, 2),
-- c as (
--   select kashef_id, bop_item_id, sum(qty) q from qm_pay_cert_lines group by 1, 2)
-- select k.kashef_no, bi.bab || '/' || bi.band || coalesce(bi.suffix,'') item,
--        coalesce(e.q,0) executed, coalesce(c.q,0) certified,
--        round(((coalesce(e.q,0) - coalesce(c.q,0)) * bi.rate)::numeric, 3) diff_kd
-- from e full join c on c.kashef_id = e.kashef_id and c.bop_item_id = e.bop_item_id
-- join qm_kashefs k on k.id = coalesce(e.kashef_id, c.kashef_id)
-- join qm_bop_items bi on bi.id = coalesce(e.bop_item_id, c.bop_item_id)
-- where k.contract_id = (select id from qm_contracts where code = 'EXPW')
--   and abs(coalesce(e.q,0) - coalesce(c.q,0)) > 0.0005
-- order by 1;
