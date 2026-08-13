-- ════════════════════════════════════════════════════════════════════
-- 0038 — QUANTITIES: heal migrated WOs against the OFFICIAL scanned
--        work-order documents (OCR pass 2026-08-14, see
--        Desktop\quantities-backfill\wo-ocr-comparison.md).
--   A. recreate WOs 1+2 (deleted in-app 2026-08-13) with official lines
--   B. official lines for the header-only WOs (3,4,5,7,8,11,14,26,39)
--   C. add doc lines the كشف حساب workbooks never tracked
--   D. correct quantities to the latest تعديل  E. durations from amendments
--   F. un-flag out_of_kashef where items now exist + seed allocations
-- Idempotent; every change is changelog-logged with actor 'ocr-heal'.
-- NOT touched: migrated lines absent from official docs (Fouad to review).
-- ════════════════════════════════════════════════════════════════════
do $qmheal$
declare
  v_contract bigint;
  v_k bigint;
  v_item bigint;
  goto_skip boolean := false;
begin
  select id into v_contract from qm_contracts where code = 'HAW9';
  if v_contract is null then raise exception 'run 0033 first'; end if;

  -- ══ WO 1 — أمر عمل متفرقات و طوارئ (نطاق 9) (migrated header-only; OCR recovers 52 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 1;
    if v_k is null then
      insert into qm_kashefs (contract_id, kashef_no, area, loc_type, block_no, street_name, work_type, status, wo_no, wo_date, kashef_date, duration_days)
      values (v_contract, 1, 'أمر عمل متفرقات و طوارئ (نطاق 9)', 'misc', '', '', 'متفرقات', 'wo', '1', '2024-11-28', '2024-11-28', 90) returning id into v_k;
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'create', '', '', '', 'استعادة بعد حذف + بنود من أمر العمل الرسمي — أمر عمل متفرقات و طوارئ (نطاق 9)', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 57 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/57 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 240);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '1/57', '', '240', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 59 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/59 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 240);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '1/59', '', '240', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 89 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/89 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '1/89', '', '1200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 125);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/4', '', '125', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/5 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1250);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/5', '', '1250', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 170);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/10', '', '170', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 34 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/34 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 0.5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/34', '', '0.5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 74 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/74 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/74', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2350);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/77', '', '2350', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 183);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/78', '', '183', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 40);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/79', '', '40', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 83 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/83 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 25);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/83', '', '25', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 84 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/84 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/84', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/87 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/87', '', '3', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 89 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/89 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/89', '', '20', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 90 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/90 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/90', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 91 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/91 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/91', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 45);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/94', '', '45', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 111 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/111 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 60);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/111', '', '60', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 112 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/112 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/112', '', '500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 115 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/115 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 75);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/115', '', '75', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 116 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/116 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 45);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/116', '', '45', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1952.32);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/4', '', '1952.32', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1952.32);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/10', '', '1952.32', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1952.32);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '1952.32', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 23 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/23 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 127.9);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/23', '', '127.9', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25', '', '2200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/25ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1650);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25ا', '', '1650', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 80);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '80', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/1', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/25', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 25);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/41', '', '25', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 68 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/68 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 250);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/68', '', '250', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/87 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 305);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/87', '', '305', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/88', '', '4200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/52', '', '3', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 66 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/66 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/66', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/76 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/76', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/87 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/87', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 98 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/98 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/98', '', '20', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/100', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 96 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/96 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/96', '', '400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 97 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/97 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/97', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 172 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/172 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 45);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/172', '', '45', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 175 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/175 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/175', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 176 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/176 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/176', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 179 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/179 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/179', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 222 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/222 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 40);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/222', '', '40', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 233 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/233 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 140);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/233', '', '140', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 242 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/242 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 140);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/242', '', '140', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 245 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/245 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 140);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/245', '', '140', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 140);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/280', '', '140', 'ocr-heal');
    end if;
  -- ══ WO 2 — تنظيف الخطوط الصحية بمنطقة سلوى (migrated header-only; OCR recovers 6 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 2;
    if v_k is null then
      insert into qm_kashefs (contract_id, kashef_no, area, loc_type, block_no, street_name, work_type, status, wo_no, wo_date, kashef_date, duration_days)
      values (v_contract, 2, 'سلوى', 'misc', '', '', 'صحي', 'wo', '2', '2024-12-03', '2024-12-03', 180) returning id into v_k;
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'create', '', '', '', 'استعادة بعد حذف + بنود من أمر العمل الرسمي — تنظيف الخطوط الصحية بمنطقة سلوى', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 296 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/296 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 126292);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/296', '', '126292', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 297 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/297 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3369.4);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/297', '', '3369.4', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 298 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/298 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3052.7);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/298', '', '3052.7', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 299 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/299 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 845.3);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/299', '', '845.3', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 300 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/300 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4898.9);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/300', '', '4898.9', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 302 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/302 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2383.9);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/302', '', '2383.9', 'ocr-heal');
    end if;
  -- ══ WO 3 — تنظيف الخطوط الصحية بمنطقة بيان (migrated header-only; OCR recovers 6 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 3;
    if v_k is null then raise notice 'WO 3 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 296 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/296 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 89111.6);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/296', '', '89111.6', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 297 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/297 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3591.4);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/297', '', '3591.4', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 298 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/298 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2549.5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/298', '', '2549.5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 300 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/300 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4073);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/300', '', '4073', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 302 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/302 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1142);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/302', '', '1142', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 303 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/303 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2947.3);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/303', '', '2947.3', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 4 — تنظيف و تصوير شبكة أمطار منطقة سلوى (migrated header-only; OCR recovers 14 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 4;
    if v_k is null then raise notice 'WO 4 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 131 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/131 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 27624);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/131', '', '27624', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 133 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/133 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 17500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/133', '', '17500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 135 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/135 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6600);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/135', '', '6600', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 136 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/136 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3286);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/136', '', '3286', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 137 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/137 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 166);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/137', '', '166', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 138 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/138 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4753);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/138', '', '4753', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 139 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/139 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/139', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 140 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/140 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2420);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/140', '', '2420', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 141 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/141 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1065);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/141', '', '1065', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 142 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/142 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/142', '', '1100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 143 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/143 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 283);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/143', '', '283', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 144 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/144 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 435);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/144', '', '435', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 145 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/145 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 600);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/145', '', '600', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 156 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/156 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 69218);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/156', '', '69218', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 5 — تنظيف و تصوير شبكة امطار منطقة بيان (migrated header-only; OCR recovers 15 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 5;
    if v_k is null then raise notice 'WO 5 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 131 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/131 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 19000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/131', '', '19000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 133 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/133 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/133', '', '15000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 134 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/134 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2230);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/134', '', '2230', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 135 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/135 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6600);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/135', '', '6600', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 136 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/136 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/136', '', '7000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 137 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/137 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/137', '', '3000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 138 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/138 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/138', '', '4000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 139 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/139 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 180);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/139', '', '180', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 140 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/140 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/140', '', '4500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 141 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/141 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1843);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/141', '', '1843', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 142 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/142 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/142', '', '2000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 143 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/143 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/143', '', '3000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 144 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/144 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/144', '', '1000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 145 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/145 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 750);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/145', '', '750', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 156 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/156 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 88186);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/156', '', '88186', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 6 — صيانة منطقة بيان - قطعة 7 (duration: doc 211 vs migrated 180 | 4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 6;
    if v_k is null then raise notice 'WO 6 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 69384);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '69384', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 41630.4);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '41630.4', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 13876.8);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '13876.8', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 180);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '180', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 211 where id = v_k and duration_days is distinct from 211;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '180', '211', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 7 — إعادة تنظيم المنطقة الدبلوماسية بضاحية مبارك العبدالله قطعة ( 7B ) (duration: doc 151 vs migrated 90 | migrated header-only; OCR recovers 75 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 7;
    if v_k is null then raise notice 'WO 7 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/1 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14774);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/1', '', '14774', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 3 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/3 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 12102);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/3', '', '12102', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 18836);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/4', '', '18836', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 927);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/10', '', '927', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2032.155);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/12', '', '2032.155', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/13 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3103);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/13', '', '3103', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 20 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/20 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2585);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/20', '', '2585', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2830);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/24', '', '2830', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/27 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7657.34);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/27', '', '7657.34', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/46 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2330);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/46', '', '2330', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 70 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/70 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/70', '', '4000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/72 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4846);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/72', '', '4846', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 73 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/73 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4762);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/73', '', '4762', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/76 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1123.995);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/76', '', '1123.995', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1458);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/77', '', '1458', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1458);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/78', '', '1458', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 181);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/79', '', '181', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 81 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/81 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/81', '', '1100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 83 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/83 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 8);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/83', '', '8', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 86 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/86 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/86', '', '14', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 329.84);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/94', '', '329.84', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 102 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/102 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 480.655);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/102', '', '480.655', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 105 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/105 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/105', '', '16', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 106 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/106 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/106', '', '300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2222.08);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/4', '', '2222.08', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 13400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/10', '', '13400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 11 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/11 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/11', '', '7400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '7400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/18 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/18', '', '7400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 20 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/20 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/20', '', '7400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 361.739);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24', '', '361.739', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 0);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '0', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 27.125);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '27.125', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 490);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/1', '', '490', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/2', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/5 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/5', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 13 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/13 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 126.403);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/13', '', '126.403', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1012.305);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/19', '', '1012.305', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2291.625);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/25', '', '2291.625', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 28);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/41', '', '28', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 56 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/56 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 0);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/56', '', '0', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 58 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/58 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1670);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/58', '', '1670', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 72 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/72 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3613);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/72', '', '3613', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/88', '', '2100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 514);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/24', '', '514', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/26 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 135);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/26', '', '135', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/27 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 305);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/27', '', '305', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/28 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 0);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/28', '', '0', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 39 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/39 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 45);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/39', '', '45', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 42 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/42 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/42', '', '16', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/46 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16.2);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/46', '', '16.2', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 25);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/52', '', '25', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 6 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/6 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/6', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 21 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/21 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2700);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/21', '', '2700', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/25', '', '1000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/26 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/26', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/27 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/27', '', '35', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/31 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 9);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/31', '', '9', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/32 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/32', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/33 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/33', '', '2', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 34 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/34 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/34', '', '10', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/41 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 321);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/41', '', '321', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 43 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/43 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/43', '', '500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 44 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/44 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 325);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/44', '', '325', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 61 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/61 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1030);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/61', '', '1030', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 65 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/65 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 299);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/65', '', '299', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 68 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/68 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 732);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/68', '', '732', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/94 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 11);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/94', '', '11', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 108 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/108 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1.784);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/108', '', '1.784', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 125 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/125 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 11);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/125', '', '11', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 127 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/127 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 31.8);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/127', '', '31.8', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 129 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/129 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 11);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/129', '', '11', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 138 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/138 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 56.775);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/138', '', '56.775', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/15 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1420);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/15', '', '1420', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 12);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/280', '', '12', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 151 where id = v_k and duration_days is distinct from 151;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '90', '151', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 8 — امر عمل متفرقات و طوارئ (migrated header-only; OCR recovers 64 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 8;
    if v_k is null then raise notice 'WO 8 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 57 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/57 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '1/57', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 59 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/59 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '1/59', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 1 and band = 89 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 1/89 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '1/89', '', '300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/4', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/10', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 22 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/22 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/22', '', '20', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 34 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/34 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/34', '', '10', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 45 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/45 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 45);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/45', '', '45', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 70 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/70 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/70', '', '300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/76 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/76', '', '150', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/77', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/78', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/79', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 86 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/86 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/86', '', '10', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/87 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/87', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 90 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/90 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/90', '', '5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 91 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/91 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/91', '', '5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/94', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 111 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/111 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 80);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/111', '', '80', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 112 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/112 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/112', '', '800', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 115 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/115 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 350);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/115', '', '350', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 116 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/116 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/116', '', '1500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/4', '', '6000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/10', '', '6000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 11 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/11 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/11', '', '1000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '6000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 23 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/23 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/23', '', '1800', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25', '', '3000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 250);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '250', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/25ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25ا', '', '1800', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 320);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '320', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 60);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/1', '', '60', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/19', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1600);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/25', '', '1600', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/41', '', '500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 49 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/49 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/49', '', '150', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 56 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/56 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/56', '', '300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 70 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/70 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 250);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/70', '', '250', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/87 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/87', '', '1000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/88', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/24', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/52', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 74 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/74 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/74', '', '5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/76 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/76', '', '5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/100', '', '5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/103', '', '5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 131 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/131 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/131', '', '500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 133 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/133 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 250);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/133', '', '250', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 61 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/61 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/61', '', '300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 62 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/62 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/62', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 9 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/9 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/9', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 23 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/23 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/23', '', '20', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/24', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 96 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/96 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 600);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/96', '', '600', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 97 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/97 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 650);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/97', '', '650', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 172 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/172 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 80);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/172', '', '80', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 175 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/175 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/175', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 176 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/176 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/176', '', '20', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 179 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/179 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 80);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/179', '', '80', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 222 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/222 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 23);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/222', '', '23', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 233 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/233 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 8);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/233', '', '8', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 242 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/242 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/242', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 245 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/245 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 25);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/245', '', '25', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/280', '', '35', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 9 — سلوى قطعة 10 (duration: doc 219 vs migrated 90 | 1 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 9;
    if v_k is null then raise notice 'WO 9 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 12189.04);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '12189.04', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 219 where id = v_k and duration_days is distinct from 219;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '90', '219', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 10 — بيان قطعة (8) (duration: doc 158 vs migrated 75 | 1 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 10;
    if v_k is null then raise notice 'WO 10 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '6150', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 158 where id = v_k and duration_days is distinct from 158;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '75', '158', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 11 — صيانة بيان شارع المسجد الاقصى (migrated header-only; OCR recovers 22 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 11;
    if v_k is null then raise notice 'WO 11 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/77', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 34841);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/4', '', '34841', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/5', '', '3400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 38241);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/10', '', '38241', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 34841);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15ا', '', '34841', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/18 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/18', '', '3400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/30', '', '3500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/25', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 21 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/21 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 11131);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/21', '', '11131', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/26 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/26', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/27 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 511);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/27', '', '511', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/32 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 31);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/32', '', '31', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 34 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/34 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/34', '', '15', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 36 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/36 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/36', '', '10', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/41 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 168);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/41', '', '168', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 43 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/43 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/43', '', '3500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 44 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/44 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1506);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/44', '', '1506', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 61 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/61 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/61', '', '500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 64 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/64 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 850);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/64', '', '850', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 65 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/65 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1671);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/65', '', '1671', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 68 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/68 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/68', '', '300', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 14 — أعمال الصحي مشرف ق3 (migrated header-only; OCR recovers 11 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 14;
    if v_k is null then raise notice 'WO 14 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/94', '', '400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 115 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/115 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/115', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 116 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/116 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/116', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 117 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/117 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/117', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 97 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/97 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 350);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/97', '', '350', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 98 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/98 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/98', '', '50', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 30);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/280', '', '30', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 296 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/296 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 8461);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/296', '', '8461', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 297 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/297 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 461);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/297', '', '461', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 302 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/302 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1362);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/302', '', '1362', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 303 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/303 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 24);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/303', '', '24', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 16 — سلوى قطعة 11 أعمال مدنية (duration: doc 182 vs migrated 120) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 16;
    if v_k is null then raise notice 'WO 16 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    update qm_kashefs set duration_days = 182 where id = v_k and duration_days is distinct from 182;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '182', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 19 — صيانة مشرف ق 3 لأعمال الاسفلت (duration: doc 90 vs migrated 60 | 3 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 19;
    if v_k is null then raise notice 'WO 19 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 52800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '52800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/18 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/18', '', '5300', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '50', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 90 where id = v_k and duration_days is distinct from 90;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '60', '90', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 20 — امر عمل متفرقات و طوارئ (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 20;
    if v_k is null then raise notice 'WO 20 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '5500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 750);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '750', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/25ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25ا', '', '1800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 320);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '320', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 21 — مشرف قطعة 5 اعمال الاسفلت (duration: doc 136 vs migrated 75 | 3 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 21;
    if v_k is null then raise notice 'WO 21 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 123500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '123500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/18 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 15000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/18', '', '15000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '100', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 136 where id = v_k and duration_days is distinct from 136;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '75', '136', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 22 — تنظيف وتصوير خطوط الصرف الصحي واعمال مدنية صحية في مشرف ق4 (13 qty mismatches) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 22;
    if v_k is null then raise notice 'WO 22 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    update qm_kashef_lines set qty = 170
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 170) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/94', '0', '170', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 115 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/115 missing'; end if;
    update qm_kashef_lines set qty = 300
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 300) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/115', '0', '300', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 116 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/116 missing'; end if;
    update qm_kashef_lines set qty = 300
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 300) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/116', '0', '300', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 117 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/117 missing'; end if;
    update qm_kashef_lines set qty = 250
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 250) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/117', '0', '250', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 97 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/97 missing'; end if;
    update qm_kashef_lines set qty = 120
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 120) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/97', '0', '120', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 101 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/101 missing'; end if;
    update qm_kashef_lines set qty = 45
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 45) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/101', '0', '45', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 172 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/172 missing'; end if;
    update qm_kashef_lines set qty = 5
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 5) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/172', '0', '5', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 184 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/184 missing'; end if;
    update qm_kashef_lines set qty = 2
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 2) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/184', '0', '2', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    update qm_kashef_lines set qty = 20
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 20) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/280', '0', '20', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 296 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/296 missing'; end if;
    update qm_kashef_lines set qty = 11250
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 11250) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/296', '8454.9', '11250', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 298 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/298 missing'; end if;
    update qm_kashef_lines set qty = 67
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 67) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/298', '66.9', '67', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 300 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/300 missing'; end if;
    update qm_kashef_lines set qty = 583
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 583) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/300', '577.4', '583', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 302 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/302 missing'; end if;
    update qm_kashef_lines set qty = 460
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 460) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '22/302', '448', '460', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 23 — تنظيف وتصوير خطوط الامطار +الاعمال المدنية لمنطقة مشرف قطعة 4 (1 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 23;
    if v_k is null then raise notice 'WO 23 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '2000', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 24 — سلوى قطعة 10 - أعمال الاسفلت (duration: doc 120 vs migrated 90 | 3 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 24;
    if v_k is null then raise notice 'WO 24 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 70900);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '70900', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 32000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '32000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 120 where id = v_k and duration_days is distinct from 120;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '90', '120', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 25 — صيانة بيان قطعة 8 (أعمال إسفلت) (duration: doc 126 vs migrated 65 | 4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 25;
    if v_k is null then raise notice 'WO 25 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 52865);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '52865', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 18200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '18200', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '4000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 126 where id = v_k and duration_days is distinct from 126;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '65', '126', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 26 — شارع التعاون - من تقاطع شارع المعتز حتى تقاطع طريق الفحيحيل (30) مع السادس (duration: doc 91 vs migrated 60 | migrated header-only; OCR recovers 56 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 26;
    if v_k is null then raise notice 'WO 26 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 12 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/12 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/12', '', '400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 20 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/20 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 350);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/20', '', '350', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/24', '', '500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 71 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/71 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/71', '', '200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 74 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/74 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/74', '', '1200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 76 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/76 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/76', '', '2500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 285);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/77', '', '285', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 285);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/78', '', '285', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 102 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/102 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/102', '', '150', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 77750);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/4', '', '77750', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/5', '', '7300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 92680);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/10', '', '92680', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 72800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15ا', '', '72800', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4950);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '4950', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/18 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/18', '', '7300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/27 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2660);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/27', '', '2660', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/28 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/28', '', '300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14550);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/30', '', '14550', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3650);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/31', '', '3650', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 37 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/37ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 7630);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/37ا', '', '7630', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 145);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/1', '', '145', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 212);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/25', '', '212', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 56 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/56 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1950);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/56', '', '1950', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '5/88', '', '3000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 23 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/23 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/23', '', '150', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/24', '', '150', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 52 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/52 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 11);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/52', '', '11', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 62 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/62 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 19);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/62', '', '19', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 23);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/100', '', '23', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 11);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/103', '', '11', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 135 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/135 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 245);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/135', '', '245', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 140 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/140 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 32);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/140', '', '32', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 143 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/143 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 77);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/143', '', '77', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 144 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/144 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 34);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/144', '', '34', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 146 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/146 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 350);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/146', '', '350', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 152 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/152 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/152', '', '1', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 156 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/156 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 388);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/156', '', '388', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 157 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/157 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 557);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '6/157', '', '557', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 21 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/21 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 65000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/21', '', '65000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 26 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/26 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/26', '', '1500', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 27 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/27 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/27', '', '3000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 32 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/32 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/32', '', '400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 34 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/34 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 90);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/34', '', '90', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 36 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/36 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 45);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/36', '', '45', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/41 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/41', '', '100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 43 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/43 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/43', '', '20000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 44 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/44 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/44', '', '5000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/46 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 950);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/46', '', '950', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 61 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/61 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/61', '', '3000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 64 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/64 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/64', '', '10000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 65 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/65 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4398);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/65', '', '4398', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 68 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/68 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/68', '', '2000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 7 and band = 82 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 7/82 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3044);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '7/82', '', '3044', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 28 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/28 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1066.3);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/28', '', '1066.3', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/30 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 281.5);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/30', '', '281.5', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/280', '', '10', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 91 where id = v_k and duration_days is distinct from 91;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '60', '91', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 29 — بيان قطعة 11 - تنظيف و تصوير خطوط الأمطار + أعمال مدنية أمطار (1 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 29;
    if v_k is null then raise notice 'WO 29 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6012);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '6012', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 30 — بيان قطعة 10 - تنظيف وتصوير خطوط أمطار + أعمال مدنية أمطار (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 30;
    if v_k is null then raise notice 'WO 30 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1650);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '1650', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 17 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 17/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1650);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '17/4', '', '1650', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1650);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '1650', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 6894);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '6894', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 32 — أمر عمل متفرقات و طوارئ (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 32;
    if v_k is null then raise notice 'WO 32 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '2000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '150', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/25ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25ا', '', '1800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '100', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 33 — سلوى قطعة 7 - أعمال مدنية صحي (3 doc lines missing from migration | 1 migrated lines not in latest doc | 6 qty mismatches) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 33;
    if v_k is null then raise notice 'WO 33 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 97 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/97 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 80);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/97', '', '80', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 98 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/98 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/98', '', '20', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 22 and band = 280 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 22/280 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '22/280', '', '2', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 70 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/70 missing'; end if;
    update qm_kashef_lines set qty = 25
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 25) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/70', '0', '25', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    update qm_kashef_lines set qty = 80
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 80) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/94', '0', '80', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 115 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/115 missing'; end if;
    update qm_kashef_lines set qty = 70
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 70) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/115', '7.5', '70', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 116 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/116 missing'; end if;
    update qm_kashef_lines set qty = 55
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 55) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/116', '0', '55', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 117 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/117 missing'; end if;
    update qm_kashef_lines set qty = 95
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 95) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/117', '0', '95', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    update qm_kashef_lines set qty = 80
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 80) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/88', '5.5', '80', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 34 — سلوى قطعة 7 مع شارع 104 للأعمال المدنية (duration: doc 181 vs migrated 120) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 34;
    if v_k is null then raise notice 'WO 34 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    update qm_kashefs set duration_days = 181 where id = v_k and duration_days is distinct from 181;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '181', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 39 — سلوى قطعة 11 - أعمال الاسفلت (duration: doc 181 vs migrated 120 | migrated header-only; OCR recovers 13 lines) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 39;
    if v_k is null then raise notice 'WO 39 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 46 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/46 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4700);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '2/46', '', '4700', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 4 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/4 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 68100);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/4', '', '68100', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 32400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/5', '', '32400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 9 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/9 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 18200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/9', '', '18200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 96000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/10', '', '96000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 11 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/11 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 8300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/11', '', '8300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 55000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '55000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 34300);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '34300', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '16200', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/29 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 170);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/29', '', '170', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 30 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/30 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/30', '', '14000', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 31 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/31 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3400);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/31', '', '3400', 'ocr-heal');
    end if;
    -- official WO line
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 181 where id = v_k and duration_days is distinct from 181;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '181', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 41 — بيان ق9 - تنظيف وتصوير خطوط أمطار + أعمال مدنية أمطار (duration: doc 195 vs migrated 120) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 41;
    if v_k is null then raise notice 'WO 41 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    update qm_kashefs set duration_days = 195 where id = v_k and duration_days is distinct from 195;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '195', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 42 — مشرف قطعة (4) أعمال اسفلت (duration: doc 151 vs migrated 90 | 4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 42;
    if v_k is null then raise notice 'WO 42 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '50500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '14000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 1000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '1000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '20', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 151 where id = v_k and duration_days is distinct from 151;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '90', '151', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 43 — صيانة بيان قطعة 15 (أعمال مدنية+أسفلت) (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 43;
    if v_k is null then raise notice 'WO 43 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '20800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '20800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '20800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 120);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '120', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 48 — مشرف قطعة(1)أعمال مدنية +تنظيف وتصوير خطوط الأمطار (duration: doc 150 vs migrated 120) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 48;
    if v_k is null then raise notice 'WO 48 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    update qm_kashefs set duration_days = 150 where id = v_k and duration_days is distinct from 150;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '150', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 49 — أمر عمل مشرف شارع(52) أعمال اسفلت (3 doc lines missing from migration | 3 migrated lines not in latest doc | 5 qty mismatches) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 49;
    if v_k is null then raise notice 'WO 49 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 13800);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15ا', '', '13800', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 9500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '9500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    update qm_kashef_lines set qty = 60
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 60) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/77', '570', '60', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 5 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/5 missing'; end if;
    update qm_kashef_lines set qty = 9500
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 9500) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '4/5', '19000', '9500', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 10 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/10 missing'; end if;
    update qm_kashef_lines set qty = 23300
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 23300) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '4/10', '30000', '23300', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    update qm_kashef_lines set qty = 5000
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 5000) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '4/19', '9300', '5000', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    update qm_kashef_lines set qty = 60
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 60) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/25', '602', '60', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 50 — مشرف قطعه 6 اعمال مدنيه + تنظيف و تصوير خطوط الامطار (duration: doc 140 vs migrated 90 | value: doc 97228.218 vs register 119626.999 | 4 migrated lines not in latest doc | 15 qty mismatches) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 50;
    if v_k is null then raise notice 'WO 50 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 77 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/77 missing'; end if;
    update qm_kashef_lines set qty = 2000
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 2000) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/77', '7000', '2000', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 78 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/78 missing'; end if;
    update qm_kashef_lines set qty = 2000
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 2000) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/78', '5160', '2000', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 79 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/79 missing'; end if;
    update qm_kashef_lines set qty = 300
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 300) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/79', '358', '300', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 2 and band = 94 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 2/94 missing'; end if;
    update qm_kashef_lines set qty = 60
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 60) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '2/94', '120', '60', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 29 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/29 missing'; end if;
    update qm_kashef_lines set qty = 110
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 110) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '4/29', '10', '110', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 1 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/1 missing'; end if;
    update qm_kashef_lines set qty = 120
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 120) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/1', '170', '120', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 2 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/2 missing'; end if;
    update qm_kashef_lines set qty = 400
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 400) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/2', '200', '400', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/25 missing'; end if;
    update qm_kashef_lines set qty = 2000
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 2000) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/25', '7000', '2000', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 41 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/41 missing'; end if;
    update qm_kashef_lines set qty = 3000
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 3000) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/41', '0', '3000', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 56 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/56 missing'; end if;
    update qm_kashef_lines set qty = 400
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 400) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/56', '0', '400', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 87 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/87 missing'; end if;
    update qm_kashef_lines set qty = 1500
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 1500) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/87', '2270', '1500', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 5 and band = 88 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 5/88 missing'; end if;
    update qm_kashef_lines set qty = 4000
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 4000) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '5/88', '6500', '4000', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/24 missing'; end if;
    update qm_kashef_lines set qty = 60
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 60) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '6/24', '108', '60', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 100 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/100 missing'; end if;
    update qm_kashef_lines set qty = 100
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 100) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '6/100', '10', '100', 'ocr-heal');
    end if;
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 6 and band = 103 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 6/103 missing'; end if;
    update qm_kashef_lines set qty = 50
      where kashef_id = v_k and bop_item_id = v_item and abs(qty - 50) > 0.001;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', '6/103', '5', '50', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 140 where id = v_k and duration_days is distinct from 140;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '90', '140', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 52 — متفرقات وطوارىء (7 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 52;
    if v_k is null then raise notice 'WO 52 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/15 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15', '', '35', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '2000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 18 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/18 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/18', '', '35', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 35);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '35', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 24 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ب';
    if v_item is null then raise exception 'bop 4/24ب missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/24ب', '', '500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 25 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/25ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/25ا', '', '500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 53 — شارع خالد بن عبد العزيز - أعمال أسفلت (duration: doc 212 vs migrated 120 | 3 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 53;
    if v_k is null then raise notice 'WO 53 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 56000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15ا', '', '56000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 14000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '14000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 2000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '2000', 'ocr-heal');
    end if;
    update qm_kashefs set duration_days = 212 where id = v_k and duration_days is distinct from 212;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '212', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 54 — أمر عمل سلوى قطعة5 - أعمال مدنية (duration: doc 182 vs migrated 120) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 54;
    if v_k is null then raise notice 'WO 54 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    update qm_kashefs set duration_days = 182 where id = v_k and duration_days is distinct from 182;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '182', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 55 — أمر عمل سلوى قطعة 6 - أعمال مدنية (duration: doc 212 vs migrated 120) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 55;
    if v_k is null then raise notice 'WO 55 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    update qm_kashefs set duration_days = 212 where id = v_k and duration_days is distinct from 212;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'duration_days', '', '120', '212', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 64 — سلوى قطعة (9) - أعمال الاسفلت (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 64;
    if v_k is null then raise notice 'WO 64 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 17000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '17000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 10000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '10000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 3000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '3000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 67 — بيان قطعه(11) - أعمال أسفلت (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 67;
    if v_k is null then raise notice 'WO 67 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 52000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '52000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 28500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '28500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 19500);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '19500', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 68 — بيان قطعة 10 أعمال أسفلت (4 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 68;
    if v_k is null then raise notice 'WO 68 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 50000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '50000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 25000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '25000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 17000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '17000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 69 — مشرف شارع 59- اعمال اسفلت (5 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 69;
    if v_k is null then raise notice 'WO 69 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15ا', '', '16000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 5000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '5000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '16000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 16000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '16000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    end if;
  -- ══ WO 72 — مشرف شارع(57) - أعمال اسفلت (5 doc lines missing from migration) ══
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 72;
    if v_k is null then raise notice 'WO 72 absent — skipped'; goto_skip := true; else goto_skip := false; end if;
    if not goto_skip then
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 15 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/15ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 25000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/15ا', '', '25000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 16 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/16ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 4200);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/16ا', '', '4200', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 17 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/17 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/17', '', '20000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 19 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = '';
    if v_item is null then raise exception 'bop 4/19 missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 20000);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/19', '', '20000', 'ocr-heal');
    end if;
    -- line in official doc, absent from migration
    select id into v_item from qm_bop_items where contract_id = v_contract and bab = 4 and band = 33 and translate(coalesce(suffix,''), 'أإآ', 'ااا') = 'ا';
    if v_item is null then raise exception 'bop 4/33ا missing'; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, 150);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', '4/33ا', '', '150', 'ocr-heal');
    end if;
    end if;

  -- ── F. re-evaluate out_of_kashef + seed allocations on healed WOs ────
  update qm_tadqiq_lines tl set out_of_kashef = false
  from qm_tadqiq t
  where t.id = tl.tadqiq_id and tl.out_of_kashef
    and exists (select 1 from qm_kashef_lines kl
                where kl.kashef_id = t.kashef_id and kl.bop_item_id = tl.bop_item_id);

  insert into qm_allocations (kashef_line_id, vendor_id, qty)
  select kl.id, t.vendor_id, sum(tl.qty)
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_kashef_lines kl on kl.kashef_id = t.kashef_id and kl.bop_item_id = tl.bop_item_id
  where not exists (select 1 from qm_allocations a
                    where a.kashef_line_id = kl.id and a.vendor_id = t.vendor_id)
  group by kl.id, t.vendor_id;

end $qmheal$;
