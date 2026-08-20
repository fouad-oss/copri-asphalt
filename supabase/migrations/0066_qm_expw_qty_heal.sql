-- 0066_qm_expw_qty_heal — heals the findings of the 2026-08-19 Expressway quantities
-- audit against كميات 9المفصلة.xls (Desktop\quantities-backfill\expw-qty-audit.md).
--
--   A. ALLOCATIONS: 573 work-order lines that subcontractors claim IN FULL still carry the
--      0051 «كوبري — تنفيذ ذاتي» seed (allocated := executed) because 0054 only upserts a
--      كوبري remainder where it is > 0 and never deletes. Σ allocated was KD 21.44M against
--      15.62M of work (KD 5,836,283 stale after 19 %). Computed dynamically: every كوبري
--      allocation on a line whose OTHER vendors already cover the full line qty is removed.
--      No quantity on any work order / طلب تدقيق / certificate changes.
--   B. WO 48: executed 1,236.72 م² sits on 4/19ب (the unnumbered طلبات التدقيق sheet's
--      header slip); the work order, its (2) sheet and the ministry certificate say 4/19ج.
--      WO 51: executed 90 م² sits on 4/37د; work order + certificate say 4/37ب. Both are
--      moved (bop_item_id update on the تدقيق line, out_of_kashef cleared).
--   C. WO 27: the تدقيق cross-tab is short — 4/10 Tack Coat 1,150 of 2,300 م², 4/21د 0 of
--      1,150 م² — against a certified-and-closed WO. One correcting طلب تدقيق on كوبري
--      (the vendor holding both lines) brings executed to the certified quantity.
--   D. WO 26a (register «تخطيط ارضي لطريق الملك فهد من كيلو 000+000 الى 000+5 باتجاه
--      الجنوب», 01/07/2025 → 30/08/2025, 60 days, نهائي, KD 16,132.663) was never imported:
--      qm_expw_wo.py globs «امر عمل رقم N» and qm_expw_paycert.py only accepts numeric
--      column headers. Imported here from الدفعة\26a.xlsx + كميات sheet 10 (first
--      appearance, unchanged through 21): header, 9 lines, 3 طلبات تدقيق (773/774/775 on
--      25/08/2025, quantities = the work order, no sub claim → كوبري), allocations, and
--      its 9 lines on certificate 10. qm_kashefs.kashef_no is an INT, so it is stored under
--      v_26a_no (default 261 — change the one constant below if Fouad prefers another
--      number) with wo_no = '26a'.
--   NOT touched (QA decisions, see audit §9): WO 31 12/101 900 م² and WO 2 bab-1 daywork
--   executed-but-never-certified; rate 2/13 (zero qty).
--
-- Idempotent: A re-derives; B/C/D guard on current state. Actor 'qty-audit'.
-- Paste after 0065 (any order relative to SN migrations — touches qm_* only).

do $qmheal2$
declare
  v_contract  bigint;
  v_copri     bigint;
  v_k         bigint;
  v_t         bigint;
  v_c         bigint;
  v_item      bigint;
  v_item2     bigint;
  v_line      bigint;
  v_n         int;
  v_26a_no    int := 261;   -- ← numeric kashef_no for work order «26a»
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'EXPW contract missing (run 0047 first)'; end if;
  select id into v_copri from vendors where id = 591 and name like 'كوبري%';
  if v_copri is null then raise exception 'vendor 591 «كوبري — تنفيذ ذاتي» missing'; end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- A. stale كوبري allocations on fully-subcontracted lines
  -- ════════════════════════════════════════════════════════════════════════
  -- log first, then delete the same set (same predicate, one transaction)
  with s as (
    select a.id as alloc_id, a.qty, kl.kashef_id, bi.bab, bi.band, coalesce(bi.suffix,'') as suffix
    from qm_allocations a
    join qm_kashef_lines kl on kl.id = a.kashef_line_id
    join qm_kashefs k      on k.id = kl.kashef_id and k.contract_id = v_contract
    join qm_bop_items bi   on bi.id = kl.bop_item_id
    where a.vendor_id = v_copri
      and (select coalesce(sum(b.qty), 0) from qm_allocations b
            where b.kashef_line_id = kl.id and b.vendor_id <> v_copri) >= kl.qty - 1e-6)
  insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
  select 'allocation', s.kashef_id, 'alloc_set', '',
         s.bab || '/' || s.band || s.suffix || ' — كوبري — تنفيذ ذاتي',
         s.qty::text, '0 — إزالة توزيع مكرر (البند موزَّع بالكامل على مقاولي الباطن) — تدقيق الكميات 2026-08-19',
         'qty-audit'
  from s;
  get diagnostics v_n = row_count;
  raise notice 'A. stale كوبري allocations to remove: % (audit expected 573)', v_n;

  delete from qm_allocations a
  using qm_kashef_lines kl, qm_kashefs k
  where kl.id = a.kashef_line_id and k.id = kl.kashef_id and k.contract_id = v_contract
    and a.vendor_id = v_copri
    and (select coalesce(sum(b.qty), 0) from qm_allocations b
          where b.kashef_line_id = kl.id and b.vendor_id <> v_copri) >= kl.qty - 1e-6;

  -- ════════════════════════════════════════════════════════════════════════
  -- B. suffix slips — WO 48 4/19ب → 4/19ج · WO 51 4/37د → 4/37ب
  -- ════════════════════════════════════════════════════════════════════════
  -- WO 48
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 48;
  select id into v_item  from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and coalesce(suffix,'') = 'ب';
  select id into v_item2 from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and coalesce(suffix,'') = 'ج';
  if v_k is not null and v_item is not null and v_item2 is not null then
    update qm_tadqiq_lines tl set bop_item_id = v_item2, out_of_kashef = false
      from qm_tadqiq t
      where tl.tadqiq_id = t.id and t.kashef_id = v_k and tl.bop_item_id = v_item;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('tadqiq', v_k, 'update', 'bop_item', '4/19ج', '4/19ب',
              '4/19ج — تصحيح لاحقة البند في ' || v_n || ' سطر تدقيق (أمر العمل وشهادة الدفع على ج) — تدقيق الكميات 2026-08-19',
              'qty-audit');
    end if;
  end if;
  -- WO 51
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 51;
  select id into v_item  from qm_bop_items where contract_id = v_contract and bab = 4 and band = 37 and coalesce(suffix,'') = 'د';
  select id into v_item2 from qm_bop_items where contract_id = v_contract and bab = 4 and band = 37 and coalesce(suffix,'') = 'ب';
  if v_k is not null and v_item is not null and v_item2 is not null then
    update qm_tadqiq_lines tl set bop_item_id = v_item2, out_of_kashef = false
      from qm_tadqiq t
      where tl.tadqiq_id = t.id and t.kashef_id = v_k and tl.bop_item_id = v_item;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('tadqiq', v_k, 'update', 'bop_item', '4/37ب', '4/37د',
              '4/37ب — تصحيح لاحقة البند في ' || v_n || ' سطر تدقيق (أمر العمل وشهادة الدفع على ب) — تدقيق الكميات 2026-08-19',
              'qty-audit');
    end if;
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- C. WO 27 — correcting طلب تدقيق (executed → certified)
  -- ════════════════════════════════════════════════════════════════════════
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 27;
  if v_k is not null and not exists (select 1 from qm_tadqiq where kashef_id = v_k and serial_no = 'تسوية-21') then
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, street_no, note, opening, serial_no)
    values (v_k, v_copri, date '2025-08-11', '',
            'تسوية تدقيق الكميات — مطابقة الكمية المنفذة لشهادة الدفع رقم 21 (كشف الطلبات ناقص) — 2026-08-19',
            false, 'تسوية-21') returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 10/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 1150, false, false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 21 and coalesce(suffix,'') = 'د';
    if v_item is null then raise exception 'bop 21/4/د missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 1150, false, false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '4/10 + 4/21د', '',
            'طلب تسوية-21 — كوبري — 2025-08-11 — 2 بند (1,150 + 1,150 م²) — تدقيق الكميات 2026-08-19', 'qty-audit');
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- D. WO 26a
  -- ════════════════════════════════════════════════════════════════════════
  select id into v_k from qm_kashefs where contract_id = v_contract and wo_no = '26a';
  if v_k is null and exists (select 1 from qm_kashefs where contract_id = v_contract and kashef_no = v_26a_no) then
    raise exception 'kashef_no % already used — change v_26a_no', v_26a_no;
  end if;
  if v_k is null then
    insert into qm_kashefs (contract_id, kashef_no, area, loc_type, block_no, street_name, work_type, status, wo_no,
                            wo_date, kashef_date, duration_days, daily_penalty, location_text, km_from, km_to, direction,
                            closed, scopes, description)
    values (v_contract, v_26a_no, 'طريق الملك فهد', 'chainage', '', '', 'أخرى', 'wo', '26a',
            date '2025-07-01', date '2025-07-01', 60, 17, 'من كيلو 0+000 إلى كيلو 5+000', 0, 5, 'اتجاه الجنوب',
            true, array['other']::text[], 'تخطيط ارضي لطريق الملك فهد من كيلو 000+000 الى 000+5 باتجاه الجنوب')
    returning id into v_k;
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_k, 'create', '', '', '',
            'استيراد تاريخي — أمر عمل 26a — تخطيط ارضي لطريق الملك فهد من كيلو 000+000 الى 000+5 باتجاه الجنوب (مستورد في تدقيق الكميات 2026-08-19)',
            'qty-audit');
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — نهائي — الانتهاء الفعلي 25/8/2025', 'qty-audit');

    -- lines (كشف تنفيذي نهائي = sheet 21 of كميات, KD 13,556.86 pre-pct)
    -- allocations: no subcontractor claim → كوبري in full
    -- تدقيق: 773 / 774 / 775 dated 25/08/2025 (quantities = the work order)
    -- certificate 10: first appearance of 26a in كميات, unchanged through 21
    select id into v_c from qm_pay_certs where contract_id = v_contract and cert_no = 10 and source = 'mpw';
    if v_c is null then raise exception 'certificate 10 (mpw) missing — paste 0052 first'; end if;

    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, street_no, note, opening, serial_no)
    values (v_k, v_copri, date '2025-08-25', '', 'استيراد تاريخي — الطرق السريعة', false, '773') returning id into v_t;
    -- 773: 20/7, 25/7, 63/7
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 20 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 20/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 2000);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 2000, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 2000, 420)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 25 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 25/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 750) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 750);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 750, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 750, 1890)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 63 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 63/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 600) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 600);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 600, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 600, 3162)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    -- 774: 27/7, 28/7, 30/7, 34/7
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, street_no, note, opening, serial_no)
    values (v_k, v_copri, date '2025-08-25', '', 'استيراد تاريخي — الطرق السريعة', false, '774') returning id into v_t;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 27 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 27/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 14);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 14, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 14, 50.82)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 28 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 28/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 14);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 14, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 14, 173.32)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 30 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 30/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 14);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 14, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 14, 173.32)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 34 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 34/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 30);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 30, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 30, 599.4)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    -- 775: 43/7, 59/7
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, street_no, note, opening, serial_no)
    values (v_k, v_copri, date '2025-08-25', '', 'استيراد تاريخي — الطرق السريعة', false, '775') returning id into v_t;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 43 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 43/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 17000) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 17000);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 17000, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 17000, 4930)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 59 and coalesce(suffix,'') = '';
    if v_item is null then raise exception 'bop 59/7 missing'; end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2600) returning id into v_line;
    insert into qm_allocations (kashef_line_id, vendor_id, qty) values (v_line, v_copri, 2600);
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation) values (v_t, v_item, 2600, false, false);
    insert into qm_pay_cert_lines (cert_id, kashef_id, bop_item_id, qty, amount) values (v_c, v_k, v_item, 2600, 2158)
      on conflict (cert_id, kashef_id, bop_item_id) do update set qty = excluded.qty, amount = excluded.amount;

    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('kashef', v_k, 'line_add', '', '', '',
            '9 بنود (باب 7) — KD 13,556.86 قبل النسبة / 16,132.66 بعدها — 3 طلبات تدقيق 773/774/775 (25/08/2025) — كوبري — شهادة الدفع 10',
            'qty-audit');
    raise notice 'D. WO 26a imported as kashef_no % (id %)', v_26a_no, v_k;
  else
    raise notice 'D. WO 26a already present (id %) — skipped', v_k;
  end if;
end $qmheal2$;

-- ── post-paste check (read-only, run separately) ───────────────────────────
-- select v.name, round(sum(a.qty*bi.rate)*1.19) as allocated_after_pct
--   from qm_allocations a join qm_kashef_lines kl on kl.id=a.kashef_line_id
--   join qm_kashefs k on k.id=kl.kashef_id join qm_contracts c on c.id=k.contract_id and c.code='EXPW'
--   join qm_bop_items bi on bi.id=kl.bop_item_id join vendors v on v.id=a.vendor_id
--   group by v.name order by 2 desc;                      -- Σ must be 15,624,574 (was 21,444,725)
-- select kashef_no, wo_no, closed from qm_kashefs where wo_no='26a';
