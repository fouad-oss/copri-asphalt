-- ════════════════════════════════════════════════════════════════════
-- 0037 — QUANTITIES: vendor canonicalization + hard-deletable WOs
--        (QA feedback round 2, 2026-08-13)
--
-- A. Fouad created clean Arabic-named subcontractor rows (vendors 9–16,
--    plus the كوبري unit rows 17–19) in the Table Editor; the 0036
--    backfill had attributed history to the ERP-named rows. Remap every
--    allocation + طلب تدقيق to the Arabic rows and unflag the ERP ones:
--      490→9 المثنى (فتيح history rides along), 498→10 بحر الابداع,
--      525→11 بوبيان, 500→12 الكندية, 494→13 الجارحي,
--      468→14 وايت بروجكت, 536→15 الوفرة, 538→16 اليمامة.
--    Stay canonical (no Arabic twin): 54 المد الاخضر, 371 عبيد,
--    493 دالكو, 495 الجود — and 591 كوبري — تنفيذ ذاتي keeps the
--    self-performed history as ONE bucket beside the unit rows 17–19
--    (fold it into a unit later with a one-line remap if wanted).
--
-- B. Work orders are now fully deletable: qm_kashef_delete cascades
--    طلبات التدقيق + allocations + lines, leaving a summary changelog
--    row. Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── A. Remap backfill data to the canonical Arabic vendor rows ───────
do $qm$
declare
  pairs int[] := array[490,9, 498,10, 525,11, 500,12, 494,13, 468,14, 536,15, 538,16];
  i int;
  v_old int;
  v_new int;
begin
  i := 1;
  while i < array_length(pairs, 1) loop
    v_old := pairs[i];
    v_new := pairs[i + 1];

    -- allocations: move the non-colliding, merge the colliding
    update qm_allocations al set vendor_id = v_new
      where al.vendor_id = v_old
        and not exists (select 1 from qm_allocations x
                        where x.kashef_line_id = al.kashef_line_id and x.vendor_id = v_new);
    update qm_allocations x set qty = x.qty + o.qty
      from qm_allocations o
      where o.vendor_id = v_old and x.vendor_id = v_new
        and x.kashef_line_id = o.kashef_line_id;
    delete from qm_allocations where vendor_id = v_old;

    update qm_tadqiq set vendor_id = v_new where vendor_id = v_old;

    update vendors set qm_subcontractor = false where id = v_old and qm_subcontractor;
    i := i + 2;
  end loop;
end $qm$;

-- ── B. Hard-deletable work orders ────────────────────────────────────
create or replace function qm_kashef_delete(p_kashef_id bigint)
returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_k qm_kashefs;
  v_tadqiq int;
  v_lines int;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;

  select count(*) into v_tadqiq from qm_tadqiq where kashef_id = p_kashef_id;
  select count(*) into v_lines from qm_kashef_lines where kashef_id = p_kashef_id;

  -- summary goes into the append-only changelog BEFORE the rows vanish
  perform qm_log('kashef', p_kashef_id, 'delete', '', '',
                 'أمر عمل ' || coalesce(nullif(v_k.wo_no,''), v_k.kashef_no::text)
                 || ' — ' || v_lines || ' بند، ' || v_tadqiq || ' طلب تدقيق',
                 '');

  delete from qm_tadqiq where kashef_id = p_kashef_id;   -- tadqiq lines cascade
  delete from qm_allocations where kashef_line_id in
    (select id from qm_kashef_lines where kashef_id = p_kashef_id);
  delete from qm_kashef_lines where kashef_id = p_kashef_id;
  delete from qm_kashefs where id = p_kashef_id;
  return json_build_object('success', true, 'tadqiqRemoved', v_tadqiq, 'linesRemoved', v_lines);
end $qm$;

do $qm$
begin
  execute 'revoke all on function qm_kashef_delete(bigint) from public, anon';
  execute 'grant execute on function qm_kashef_delete(bigint) to authenticated';
end $qm$;
