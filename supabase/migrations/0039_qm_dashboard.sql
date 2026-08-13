-- ════════════════════════════════════════════════════════════════════
-- 0039 — QUANTITIES: home dashboard support
--        (Fouad's dashboard answers, 2026-08-14)
--   A. qm_contracts.contract_value — Hawalli 9 = KD 19,000,000 (pre-pct;
--      the app displays everything after نسبة العقد, +9%).
--   B. qm_kashefs.closed — manual completion flag (Fouad ticks WOs off);
--      the dashboard's delay/nearing-end lists only watch open WOs.
--      qm_kashef_update learns the 'closed' field (logged like the rest).
--   C. qm_kashef_overview += closed, contract_value (columns appended).
--   D. New authenticated-only views: qm_sub_totals (per-sub allocated/
--      executed/last activity), qm_monthly_exec (executed by month,
--      opening entries separated), qm_wo_flags (per-WO warning counts).
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── A + B. columns ───────────────────────────────────────────────────
alter table qm_contracts add column if not exists contract_value numeric;
update qm_contracts set contract_value = 19000000 where code = 'HAW9'
  and contract_value is distinct from 19000000;

alter table qm_kashefs add column if not exists closed boolean not null default false;

-- ── B. qm_kashef_update: allow 'closed' ──────────────────────────────
create or replace function qm_kashef_update(p_kashef_id bigint, p_fields jsonb)
returns json language plpgsql security definer set search_path = public as $qm$
declare
  v_k qm_kashefs;
  v_key text;
  v_new text;
  v_old text;
  v_changed int := 0;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;

  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('area','loc_type','block_no','street_name','work_type','kashef_no',
                     'kashef_date','wo_no','wo_date','duration_days','closed') then
      return json_build_object('success', false, 'error', 'field not editable: ' || v_key);
    end if;
  end loop;
  if p_fields ? 'loc_type' and p_fields->>'loc_type' not in ('block','street','misc') then
    return json_build_object('success', false, 'error', 'bad loc_type');
  end if;
  if p_fields ? 'closed' and p_fields->>'closed' not in ('true','false') then
    return json_build_object('success', false, 'error', 'bad closed');
  end if;

  for v_key in select jsonb_object_keys(p_fields) loop
    v_new := p_fields->>v_key;
    v_old := case v_key
      when 'area' then v_k.area           when 'loc_type' then v_k.loc_type
      when 'block_no' then v_k.block_no   when 'street_name' then v_k.street_name
      when 'work_type' then v_k.work_type when 'kashef_no' then v_k.kashef_no::text
      when 'kashef_date' then v_k.kashef_date::text
      when 'wo_no' then v_k.wo_no         when 'wo_date' then coalesce(v_k.wo_date::text,'')
      when 'duration_days' then coalesce(v_k.duration_days::text,'')
      when 'closed' then v_k.closed::text
    end;
    if coalesce(v_old,'') is distinct from coalesce(v_new,'') then
      execute format('update qm_kashefs set %I = $1::%s where id = $2', v_key,
                     case when v_key in ('kashef_no','duration_days') then 'int'
                          when v_key in ('kashef_date','wo_date') then 'date'
                          when v_key = 'closed' then 'boolean'
                          else 'text' end)
        using (case when v_key in ('wo_date','duration_days') then nullif(v_new, '') else v_new end),
              p_kashef_id;
      perform qm_log('kashef', p_kashef_id, 'update', v_key, '', coalesce(v_old,''), coalesce(v_new,''));
      v_changed := v_changed + 1;
    end if;
  end loop;
  return json_build_object('success', true, 'changed', v_changed);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'kashef_no already exists');
when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $qm$;

-- ── C. overview += closed, contract_value (appended columns only) ────
create or replace view qm_kashef_overview
with (security_invoker = true) as
select k.id, k.contract_id, c.code as contract_code, c.pct,
       k.kashef_no, k.area, k.loc_type, k.block_no, k.street_name, k.work_type,
       k.status, k.wo_no, k.wo_date, k.kashef_date, k.created_at,
       coalesce(l.n, 0)                       as line_count,
       coalesce(l.subtotal, 0)                as subtotal,
       round(coalesce(l.subtotal, 0) * (1 + c.pct / 100), 3) as total_after_pct,
       coalesce(a.alloc_value, 0)             as allocated_value,
       coalesce(e.exec_value, 0)              as executed_value,
       coalesce(e.tadqiq_count, 0)            as tadqiq_count,
       k.duration_days,
       k.closed,
       c.contract_value
from qm_kashefs k
join qm_contracts c on c.id = k.contract_id
left join (
  select kl.kashef_id, count(*) as n, sum(kl.qty * bi.rate) as subtotal
  from qm_kashef_lines kl join qm_bop_items bi on bi.id = kl.bop_item_id
  group by 1
) l on l.kashef_id = k.id
left join (
  select kl.kashef_id, sum(al.qty * bi.rate) as alloc_value
  from qm_allocations al
  join qm_kashef_lines kl on kl.id = al.kashef_line_id
  join qm_bop_items bi on bi.id = kl.bop_item_id
  group by 1
) a on a.kashef_id = k.id
left join (
  select t.kashef_id, sum(tl.qty * bi.rate) as exec_value,
         count(distinct t.id) as tadqiq_count
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  group by 1
) e on e.kashef_id = k.id;

-- ── D. dashboard views ───────────────────────────────────────────────
create or replace view qm_sub_totals
with (security_invoker = true) as
select v.id as vendor_id, v.name as vendor_name,
       coalesce(a.alloc_value, 0)  as allocated_value,
       coalesce(e.exec_value, 0)   as executed_value,
       e.last_tadqiq_date,
       coalesce(e.n, 0)            as tadqiq_count,
       coalesce(a.wo_count, 0)     as allocated_wos
from vendors v
left join (
  select al.vendor_id, sum(al.qty * bi.rate) as alloc_value,
         count(distinct kl.kashef_id) as wo_count
  from qm_allocations al
  join qm_kashef_lines kl on kl.id = al.kashef_line_id
  join qm_bop_items bi on bi.id = kl.bop_item_id
  group by 1
) a on a.vendor_id = v.id
left join (
  select t.vendor_id, sum(tl.qty * bi.rate) as exec_value,
         max(t.tadqiq_date) filter (where not t.opening) as last_tadqiq_date,
         count(distinct t.id) as n
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  group by 1
) e on e.vendor_id = v.id
where v.qm_subcontractor;

create or replace view qm_monthly_exec
with (security_invoker = true) as
select date_trunc('month', t.tadqiq_date)::date as month,
       t.opening,
       sum(tl.qty * bi.rate) as exec_value,
       count(distinct t.id)  as tadqiq_count
from qm_tadqiq t
join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
join qm_bop_items bi on bi.id = tl.bop_item_id
group by 1, 2;

create or replace view qm_wo_flags
with (security_invoker = true) as
select k.id as kashef_id,
       coalesce(la.over_alloc_lines, 0)     as over_alloc_lines,
       coalesce(la.exec_over_alloc_lines, 0) as exec_over_alloc_lines,
       coalesce(oo.out_of_wo_lines, 0)      as out_of_wo_lines
from qm_kashefs k
left join (
  select kl.kashef_id,
         count(*) filter (where coalesce(al.total, 0) > kl.qty + 0.0005) as over_alloc_lines,
         count(*) filter (where coalesce(ex.total, 0) > coalesce(al.total, 0) + 0.0005) as exec_over_alloc_lines
  from qm_kashef_lines kl
  left join (select kashef_line_id, sum(qty) as total from qm_allocations group by 1) al
    on al.kashef_line_id = kl.id
  left join (
    select t.kashef_id, tl.bop_item_id, sum(tl.qty) as total
    from qm_tadqiq t join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
    group by 1, 2
  ) ex on ex.kashef_id = kl.kashef_id and ex.bop_item_id = kl.bop_item_id
  group by 1
) la on la.kashef_id = k.id
left join (
  select t.kashef_id, count(*) as out_of_wo_lines
  from qm_tadqiq t join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  where tl.out_of_kashef
  group by 1
) oo on oo.kashef_id = k.id;

-- ── grants: same posture as the rest of qm_* ─────────────────────────
revoke all on qm_sub_totals, qm_monthly_exec, qm_wo_flags from anon;
grant select on qm_sub_totals, qm_monthly_exec, qm_wo_flags to authenticated;
