-- ════════════════════════════════════════════════════════════════════
-- 0061 — QUANTITIES: canonical road names for the Expressway highway rows
--        (Fouad, 2026-08-17, site-model rework in the front-end)
--
-- The Expressway location model is now  road (level 1) → km range /
-- intersection (level 2)  with two preset roads:
--     «طريق الفحيحيل»  (30)      «طريق الملك فهد»  (40)
-- and «أخرى» for anything else. 0050 stored `area` as whatever the road
-- phrase in the ministry text was, so the register's area filter today
-- splits one road into several values («طريق الفحيحيل», «طريق الفحيحل»,
-- «طريق الفحيحيل مخرج صباح السالم», «طريق الفحيحيل ازالة الحارة …»).
--
-- This DATA-ONLY migration rewrites `area` to the canonical name for
-- chainage rows that name exactly ONE preset road. Nothing is lost:
-- location_text still carries the ministry's full wording (guarded: the
-- row's text must itself mention the road). Rows naming both roads
-- («طريق الملك فهد + الفحيحيل + النويصيب») and misc rows (whose `area`
-- IS the description) are untouched. Same rule as site.ts roadOf().
-- Every change is logged to qm_changelog. Idempotent.
-- ════════════════════════════════════════════════════════════════════
do $qmcanon$
declare
  v_contract bigint;
  r record;
  v_new text;
  v_n int := 0;
begin
  select id into v_contract from qm_contracts where code = 'EXPW';
  if v_contract is null then raise notice '0061: no EXPW contract, nothing to do'; return; end if;

  for r in
    select k.id, k.kashef_no, k.area,
           -- normalise hamza + trailing-ya spelling before matching
           translate(k.area, 'أإآى', 'اااي') as n_area,
           translate(k.location_text, 'أإآى', 'اااي') as n_text
      from qm_kashefs k
     where k.contract_id = v_contract
       and k.loc_type = 'chainage'
       and k.area not like '%+%'          -- «A + B» rows span more than one road
  loop
    v_new := null;
    if (r.n_area like '%الفحيحيل%' or r.n_area like '%الفحيحل%')
       and r.n_area not like '%الملك فهد%' then
      v_new := 'طريق الفحيحيل';
      if r.n_text not like '%الفحيح%' then continue; end if;   -- text must name the road
    elsif r.n_area like '%الملك فهد%'
       and r.n_area not like '%الفحيحيل%' and r.n_area not like '%الفحيحل%' then
      v_new := 'طريق الملك فهد';
      if r.n_text not like '%الملك فهد%' then continue; end if;
    end if;

    if v_new is not null and r.area is distinct from v_new then
      update qm_kashefs set area = v_new where id = r.id;
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', r.id, 'update', 'area', '', r.area, v_new, 'expw-area-canon');
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '0061: % Expressway work orders re-keyed to a canonical road', v_n;
end $qmcanon$;
