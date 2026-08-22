-- ✅ APPLIED LIVE 2026-08-22 via the service-role API (row-for-row equivalent; all 29
--    operations confirmed 1 row each; post-check query returns the expected table
--    exactly). Kept as the record — re-pasting is a harmless no-op.
--
-- 0072_qm_expw_wo_pdf_sync — syncs Expressway WOs 63–68 to the official ministry
-- work-order PDFs (امر عمل رقم 63..68.pdf, Desktop\ExpresswaysQMbackfill, read
-- 2026-08-22). Background: these six WOs' workbooks have #REF! in every نهائي cell,
-- so the 0050 import fell back to the sibling «1» sheet — which turned out to be the
-- PARTIAL EXECUTED snapshot, not the ordered scope. The PDFs carry the true scope:
--
--   WO 63  4 lines / KD 25,871.410  →  16 lines / KD 1,334,871.800  (+ penalty 1589)
--          (صيانة أسفلت طريق الملك فهد 0+000→3+500 جنوب — 120 يوم 2026-07-26→2026-11-23)
--   WO 64  same 7 items, scope up      KD 50,345.973 → 74,210.688   (+ penalty 88)
--   WO 65  same 2 items, scope up      KD  2,385.000 → 18,900.800   (+ penalty 23)
--   WO 66  lines IDENTICAL to the PDF (KD 13,805.150)               (+ penalty 17)
--   WO 67  lines IDENTICAL to the PDF (KD 28,608.000)               (+ penalty 35)
--   WO 68  lines IDENTICAL to the PDF (KD 229,136.445)              (+ penalty 273)
--
-- All values pre-pct; ×1.19 ties each PDF's «التكلفة التقديرية بعد نسبة العقد» to the
-- fils (the PDFs' own line totals show ≤1-fils print rounding, e.g. 7/43 prints
-- 3,769.999 for 13,000 × 0.290). Suffixed bab-4 items resolved by rate against the
-- BOP: 4/17د (2.62) · 4/24د (4.80) · 4/29د (6.09) — unique matches.
-- WOs 69 and 70 are deliberately NOT touched (QA is entering them as a live test).
-- Existing تدقيق/allocations/certificates untouched — the enlarged scope simply
-- reopens remaining quantities on these open WOs.
--
-- Idempotent: qty updates guard on the current value, inserts on not-exists,
-- penalties on is-distinct-from. Actor 'wo-pdf-sync'.

do $qmpdf$
declare
  v_contract bigint;
  v_k    bigint;
  v_item bigint;
  v_n    int;
  r      record;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise exception 'EXPW contract missing'; end if;

  -- ── 1. daily penalties from the PDF headers ───────────────────────────────
  for r in
    select * from (values (63, 1589.0), (64, 88.0), (65, 23.0), (66, 17.0), (67, 35.0), (68, 273.0))
      t(wo, penalty)
  loop
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = r.wo;
    if v_k is null then raise exception 'work order % missing', r.wo; end if;
    update qm_kashefs set daily_penalty = r.penalty
    where id = v_k and daily_penalty is distinct from r.penalty;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'daily_penalty', '', '',
              r.penalty || ' — من أمر العمل الرسمي (PDF) 2026-08-22', 'wo-pdf-sync');
    end if;
  end loop;

  -- ── 2. quantity corrections on existing lines ─────────────────────────────
  for r in
    select * from (values
      -- WO 63
      (63, 2,  17, '', 2108.25,  7725.0),
      (63, 2,  61, '', 1206.45,  7725.0),
      (63, 4,   4, '', 8705.0,  81000.0),
      (63, 4,   7, '', 8705.0,  81000.0),
      -- WO 64
      (64, 2,  42, '', 2000.0,   3000.0),
      (64, 2,  70, '', 184.2,     264.0),
      (64, 2,  82, '', 184.2,     264.0),
      (64, 2,  96, '', 1978.0,   3076.0),
      (64, 5,  60, '', 6015.21,  9025.15),
      (64, 13,  2, '', 1700.0,   1800.0),
      -- WO 65
      (65, 5,  98, '', 500.0,    4320.0),
      (65, 12, 104, '', 500.0,   3500.0)
    ) t(wo, bab, band, suffix, old_qty, new_qty)
  loop
    select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = r.wo;
    select id into v_item from qm_bop_items
    where contract_id = v_contract and bab = r.bab and band = r.band and coalesce(suffix,'') = r.suffix;
    if v_item is null then raise exception 'bop %/% missing', r.bab, r.band || r.suffix; end if;
    update qm_kashef_lines set qty = r.new_qty
    where kashef_id = v_k and bop_item_id = v_item and qty = r.old_qty;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_qty', '', r.bab || '/' || r.band || r.suffix, r.old_qty::text,
              r.new_qty || ' — من أمر العمل الرسمي (PDF) 2026-08-22', 'wo-pdf-sync');
    end if;
  end loop;

  -- ── 3. WO 63 — the 12 scope lines the «1» sheet never carried ─────────────
  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 63;
  for r in
    select * from (values
      (4,   9, '',  62000.0),
      (4,  10, '', 162000.0),
      (4,  11, '',  62000.0),
      (4,  17, 'د', 81000.0),
      (4,  24, 'د', 81000.0),
      (4,  29, 'د', 81000.0),
      (7,  25, '',    300.0),
      (7,  28, '',      5.0),
      (7,  30, '',      5.0),
      (7,  43, '',  13000.0),
      (7,  59, '',   2700.0),
      (7,  63, '',    400.0)
    ) t(bab, band, suffix, qty)
  loop
    select id into v_item from qm_bop_items
    where contract_id = v_contract and bab = r.bab and band = r.band and coalesce(suffix,'') = r.suffix;
    if v_item is null then raise exception 'bop %/% missing', r.bab, r.band || r.suffix; end if;
    if not exists (select 1 from qm_kashef_lines where kashef_id = v_k and bop_item_id = v_item) then
      insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_k, v_item, r.qty);
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'line_add', '', r.bab || '/' || r.band || r.suffix, '',
              r.qty || ' — من أمر العمل الرسمي (PDF) 2026-08-22', 'wo-pdf-sync');
    end if;
  end loop;

  raise notice 'WOs 63-68 synced to the official PDFs';
end $qmpdf$;

-- ── post-paste check (read-only) ────────────────────────────────────────────
-- select k.kashef_no, count(*) lines, k.daily_penalty,
--        round(sum(kl.qty * bi.rate)::numeric, 3)        as value_pre_pct,
--        round((sum(kl.qty * bi.rate) * 1.19)::numeric, 3) as value_after_pct
-- from qm_kashefs k
-- join qm_kashef_lines kl on kl.kashef_id = k.id
-- join qm_bop_items bi on bi.id = kl.bop_item_id
-- where k.contract_id = (select id from qm_contracts where code = 'EXPW')
--   and k.kashef_no between 63 and 68
-- group by k.kashef_no, k.daily_penalty order by 1;
-- expected (pre-pct → after-pct, = each PDF's التكلفة التقديرية):
--   63: 16 lines, penalty 1589 → 1,334,871.800 → 1,588,497.442
--   64:  7 lines, penalty   88 →    74,210.688 →    88,310.719
--   65:  2 lines, penalty   23 →    18,900.800 →    22,491.952
--   66: 11 lines, penalty   17 →    13,805.150 →    16,428.129
--   67:  3 lines, penalty   35 →    28,608.000 →    34,043.520
--   68: 38 lines, penalty  273 →   229,136.445 →   272,672.370
-- (64 and 66 differ from the PDF-printed after-pct total by 1 fils — the PDFs
--  truncate/round their own prints: 88,310.720 / 16,428.128.)
