-- ════════════════════════════════════════════════════════════════════
-- 0045 — QUANTITIES: rebuild the executed side for the work orders whose
--        certificates were re-sourced from دفعات الوزارة in 0041.
--
--   Those work orders' certificates now tie to the ministry tracker, but
--   their executed quantities were still the older كشف حساب totals — so
--   certified exceeded executed, which cannot happen, and the finished-
--   awaiting-certification list could not see them.
--
--   Here the opening طلبات تدقيق for these work orders are rebuilt from
--   the same folder sheets, PER SUBCONTRACTOR (the sheets are one per
--   company), and allocations are resynced to match. Executed, allocated
--   and certified then all come from one source.
--
--   Only opening (رصيد افتتاحي) entries are touched — anything the QA
--   records in the app is left alone. Idempotent.
-- ════════════════════════════════════════════════════════════════════
do $qmex$
declare
  v_contract bigint;
  v_k bigint;
  v_t bigint;
  v_item bigint;
  v_line bigint;
  v_wos int := 0;
begin
  select id into v_contract from qm_contracts where code = 'HAW9';
  if v_contract is null then raise exception 'run 0033 first'; end if;

  -- ══ أمر عمل 7 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 7;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 10 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 10 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 10, '2025-11-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/15 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1853.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8338.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 877.44, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 102 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/102 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 954.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1567.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1339.15, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 20 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/20 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4182.45, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3020.16, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9691.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 3 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/3 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 16273.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 20342.57, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/46 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4158.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 70 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/70 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10146.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/72 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1750.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 73 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/73 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8827.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/76 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1123.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 350.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 350.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 182.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 81 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/81 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 212.06, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 463.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 277.05, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/19 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1502.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 24.96, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1313.76, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 24.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 148.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 58 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/58 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8868.24, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/72 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4200.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2061.45, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 337.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 35.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 34 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 54 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 54 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 54, '2025-11-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 1 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2025-11-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8186.4, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 11 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/11 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4509.73, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4370.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/18ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4512.4, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 20 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'د';
    if v_item is null then raise exception 'bop 4/20د missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4509.73, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 24.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 6 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 14 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 14;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 54 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 54 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 54, '2025-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 296 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/296 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8449.3, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 297 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/297 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 416.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 302 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/302 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 326.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 3 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 19 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 19;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2025-12-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 46710.71, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 46710.71, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 19355.07, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2992.78, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 46710.71, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 5 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 21 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 21;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-02-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 110186.61, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 101312.3, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/18ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8874.31, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 38992.38, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5035.35, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 101312.3, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9776.81, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 7 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 29 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 29;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 10 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 10 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 10, '2026-06-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 81.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 904.14, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3746.28, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 14 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/14 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4211.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8062.42, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2154.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2154.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1169.99, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1462.8, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 424.96, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 406.53, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2154.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 755.81, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 60.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 74.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1045.8, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/28 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 108.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/29 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 309.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 99.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 40 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/40 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 12.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 21 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 371 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 371 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 371, '2026-06-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 746.06, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4055.79, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4522.46, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2288.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2207.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 632.37, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1145.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 241.55, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 47.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2288.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 3 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/3 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 14.28, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 56 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/56 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 200.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/87 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 150.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1398.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 45.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 69.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 909.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 42.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 218.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/29 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 157.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 20.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 40 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/40 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/76 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 24 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-06-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 973.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 973.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4647.35, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 34.07, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 973.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 882.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/87 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1323.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1875.98, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 8 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 30 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 30;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 9 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 9 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 9, '2026-04-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4049.03, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9800.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 13943.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 70 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/70 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 113.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/72 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4547.55, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/76 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2530.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6411.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6411.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2085.83, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 86 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/86 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2519.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 815.77, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 310.28, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5452.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 168.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 54 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/54 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1137.67, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/72 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4801.4, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6212.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 77.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1278.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 371.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 207.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/28 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 260.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/29 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 109.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 206.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 80.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 27 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 10 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 10 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 10, '2026-04-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 255.38, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/15 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5037.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4593.44, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 210.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 210.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 303.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 83 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/83 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 86 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/86 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 113.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 95 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/95 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 253.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 55.3, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 15.88, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 120.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 3 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/3 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 12.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 186.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 113.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/33 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 253.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 40 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/40 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 97 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/97 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 23 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 371 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 371 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 371, '2026-04-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 14 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/14 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1933.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1774.57, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 172.37, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 86 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/86 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 52.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 95 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/95 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 141.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 24.57, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 3 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/3 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 11.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 52.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/33 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 141.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 40 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/40 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/76 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 15 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-04-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/46 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 322.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/72 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1075.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1075.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 11 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/11 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1075.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1075.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'د';
    if v_item is null then raise exception 'bop 4/19د missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1075.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6584.68, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 7 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 42 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 42;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-07-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 58121.74, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 45915.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10888.08, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/29 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 164.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6071.49, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 14166.57, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/32 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 92.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 16.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 45915.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 12206.74, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 10 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 49 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 49;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-06-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 29233.8, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10526.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9420.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9286.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10526.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 18706.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 6 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 53 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 53;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-07-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 12223.42, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 11337.92, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/19ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1545.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/28 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 866.97, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2420.99, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 11337.92, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 7 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/7 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1545.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 7 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 54 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 54;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 12 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 12 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 12, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 52.19, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1769.61, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1249.41, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 554.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10.74, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3.19, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 31.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 341.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 184.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 19.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 11 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 13 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 13 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 13, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 95.28, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3716.68, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2415.21, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5068.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 109.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1102.3, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 38.66, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 213.64, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5068.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3306.04, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 498.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 414.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/28 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 190.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 36.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 42 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/42 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/46 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 62 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/62 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 17 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/29 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2405.15, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/32 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 327.6, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 2 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 59 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 59;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 54 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 54 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 54, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 296 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/296 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 3896.9, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 297 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/297 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 369.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 298 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/298 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 571.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 300 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/300 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 306.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 4 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 62 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 62;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 10 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 10 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 10, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 304.4, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1067.39, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 708.29, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 163.03, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 86 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/86 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 443.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 93.52, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 5.48, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 141.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 88.3, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 95.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/28 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 56.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/29 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 61.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 18.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 2.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 15 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 12 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 12 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 12, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 220.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4.34, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 220.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 206.7, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 4 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 63 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 63;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 371 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 371 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 371, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1254.13, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 14 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/14 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 762.43, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1614.04, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1216.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 310.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 212.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 95 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/95 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 134.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 17.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 11.16, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1216.1, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 836.25, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 106.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 50.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 56.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/30 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 48.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 86.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 9.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 40 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/40 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 19 بند', 'folders-rebuild');
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/32 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 170.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 1 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 64 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 64;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 20715.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6005.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 10750.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 6005.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 14710.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 5 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 66 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 66;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 35 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/35 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 396.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 80 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/80 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 7962.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 2 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 68 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 68;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 45421.18, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8816.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 36605.18, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 4572.45, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 1050.2, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/32 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 326.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 8816.0, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 36605.18, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 8 بند', 'folders-rebuild');
  end if;

  -- ══ أمر عمل 69 — إعادة بناء المنفَّذ من دفعات الوزارة ══
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 69;
  if v_k is not null then
    v_wos := v_wos + 1;
    delete from qm_tadqiq where kashef_id = v_k and opening;
    select id into v_item from vendors where id = 591 and qm_subcontractor;
    if v_item is null then raise exception 'vendor 591 missing or not flagged'; end if;
    insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, serial_no, street_no, note, opening)
    values (v_k, 591, '2026-08-05', '', '', 'رصيد افتتاحي — من دفعات الوزارة', true) returning id into v_t;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 27902.09, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/17ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 14550.4, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/19ب missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 13351.69, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 112.5, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 14550.4, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 7 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/7 missing'; end if;
    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_t, v_item, 13415.69, not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item), false);
    insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
    values ('tadqiq', v_k, 'tadqiq_create', '', '', '', 'رصيد افتتاحي معاد بناؤه — 6 بند', 'folders-rebuild');
  end if;

  -- ── resync allocations for the rebuilt work orders (allocated = executed) ──
  delete from qm_allocations a using qm_kashef_lines kl, qm_kashefs k
   where a.kashef_line_id = kl.id and kl.kashef_id = k.id
     and k.contract_id = v_contract and k.kashef_no in (7, 14, 19, 21, 29, 30, 42, 49, 53, 54, 59, 62, 63, 64, 66, 68, 69);

  insert into qm_allocations (kashef_line_id, vendor_id, qty)
  select kl.id, t.vendor_id, sum(tl.qty)
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_kashef_lines kl on kl.kashef_id = t.kashef_id and kl.bop_item_id = tl.bop_item_id
  join qm_kashefs k on k.id = t.kashef_id
  where k.contract_id = v_contract and k.kashef_no in (7, 14, 19, 21, 29, 30, 42, 49, 53, 54, 59, 62, 63, 64, 66, 68, 69)
  group by kl.id, t.vendor_id
  on conflict (kashef_line_id, vendor_id) do update set qty = excluded.qty;

  raise notice 'work orders rebuilt: %', v_wos;
end $qmex$;
