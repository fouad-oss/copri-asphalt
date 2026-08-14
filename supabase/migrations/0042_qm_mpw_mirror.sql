-- ════════════════════════════════════════════════════════════════════
-- 0042 — QUANTITIES: mirror the MPW structures
--        (Fouad, 2026-08-14: "everything should mirror the structure
--         that the MPW already has")
--
--   A. Contract header fields taken from the ministry-facing tracking
--      report (متابعة أوامـر العمــل …-الجديد.xlsx, sheet 5-08-2026):
--        قيمة العقد 19,300,000 · أوامر تغييرية 0 · المباشرة 2024-11-05 ·
--        مدة العقد 1,095 يوم.
--      NOTE: contract_value was 19,000,000 (as stated on 2026-08-14);
--      the ministry report says 19,300,000 and computes نسبة الإنجاز
--      المالي against it, so it wins here. One-line revert if wrong.
--   B. qm_kashefs.daily_penalty — الغرامة اليومية, printed on every
--      كشف تنفيذي جزئي.
--   C. qm_paycert_line_detail — per certificate line: this payment's
--      quantity, the previous cumulative, the running cumulative and
--      اجمالي الكمية المتبقية (WO qty − cumulative), i.e. exactly the
--      columns of the ministry's كشف تنفيذي جزئي.
--   D. qm_contract_progress — the tracking report's header figures:
--      financial vs time completion, elapsed days, WO counts by state.
-- Idempotent; safe to re-run. Paste after 0040/0041.
-- ════════════════════════════════════════════════════════════════════

-- ── A. contract header ───────────────────────────────────────────────
alter table qm_contracts add column if not exists change_orders_value numeric not null default 0;
alter table qm_contracts add column if not exists start_date date;
alter table qm_contracts add column if not exists duration_days int;

update qm_contracts
   set contract_value = 19300000,
       change_orders_value = 0,
       start_date = date '2024-11-05',
       duration_days = 1095
 where code = 'HAW9';

-- ── B. daily delay penalty per work order ────────────────────────────
alter table qm_kashefs add column if not exists daily_penalty numeric;

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
                     'kashef_date','wo_no','wo_date','duration_days','closed','daily_penalty') then
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
      when 'daily_penalty' then coalesce(v_k.daily_penalty::text,'')
    end;
    if coalesce(v_old,'') is distinct from coalesce(v_new,'') then
      execute format('update qm_kashefs set %I = $1::%s where id = $2', v_key,
                     case when v_key in ('kashef_no','duration_days') then 'int'
                          when v_key in ('kashef_date','wo_date') then 'date'
                          when v_key = 'closed' then 'boolean'
                          when v_key = 'daily_penalty' then 'numeric'
                          else 'text' end)
        using (case when v_key in ('wo_date','duration_days','daily_penalty')
                    then nullif(v_new, '') else v_new end),
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

-- ── C. كشف تنفيذي جزئي line detail ───────────────────────────────────
create or replace view qm_paycert_line_detail
with (security_invoker = true) as
select cl.id, cl.cert_id, pc.cert_no, pc.period_end,
       cl.kashef_id, k.kashef_no, k.wo_no, k.area, k.loc_type, k.block_no,
       k.street_name, k.work_type, k.wo_date, k.duration_days, k.daily_penalty,
       cl.bop_item_id, bi.bab, bi.band, bi.suffix, bi.description, bi.unit, bi.rate,
       cl.qty                                   as qty_current,
       coalesce(pv.qty, 0)                      as qty_previous,
       cl.qty + coalesce(pv.qty, 0)             as qty_cumulative,
       kl.qty                                   as wo_qty,
       coalesce(kl.qty, 0) - (cl.qty + coalesce(pv.qty, 0)) as qty_remaining,
       round(cl.qty * bi.rate, 3)               as amount_current
from qm_pay_cert_lines cl
join qm_pay_certs pc on pc.id = cl.cert_id
join qm_bop_items bi on bi.id = cl.bop_item_id
left join qm_kashefs k on k.id = cl.kashef_id
left join qm_kashef_lines kl on kl.kashef_id = cl.kashef_id and kl.bop_item_id = cl.bop_item_id
left join lateral (
  select sum(p.qty) as qty
  from qm_pay_cert_lines p
  join qm_pay_certs pp on pp.id = p.cert_id
  where p.kashef_id is not distinct from cl.kashef_id
    and p.bop_item_id = cl.bop_item_id
    and pp.contract_id = pc.contract_id
    and pp.cert_no < pc.cert_no
) pv on true;

-- ── D. contract progress (mirrors the tracking report header) ────────
create or replace view qm_contract_progress
with (security_invoker = true) as
select c.id as contract_id, c.code, c.pct,
       c.contract_value, c.change_orders_value,
       c.contract_value + c.change_orders_value          as total_value,
       c.start_date, c.duration_days,
       greatest(0, (current_date - c.start_date))        as elapsed_days,
       case when c.duration_days > 0
            then round((current_date - c.start_date)::numeric / c.duration_days, 6)
       end                                               as time_pct,
       coalesce(e.executed_after_pct, 0)                 as executed_after_pct,
       case when (c.contract_value + c.change_orders_value) > 0
            then round(coalesce(e.executed_after_pct, 0)
                       / (c.contract_value + c.change_orders_value), 6)
       end                                               as financial_pct,
       coalesce(w.n_total, 0)   as wo_count,
       coalesce(w.n_closed, 0)  as wo_closed,
       coalesce(w.n_open, 0)    as wo_open
from qm_contracts c
left join (
  select k.contract_id,
         round(sum(tl.qty * bi.rate) * (1 + max(c2.pct) / 100), 3) as executed_after_pct
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  join qm_kashefs k on k.id = t.kashef_id
  join qm_contracts c2 on c2.id = k.contract_id
  group by 1
) e on e.contract_id = c.id
left join (
  select contract_id, count(*) as n_total,
         count(*) filter (where closed) as n_closed,
         count(*) filter (where not closed) as n_open
  from qm_kashefs group by 1
) w on w.contract_id = c.id;

revoke all on qm_paycert_line_detail, qm_contract_progress from anon;
grant select on qm_paycert_line_detail, qm_contract_progress to authenticated;
