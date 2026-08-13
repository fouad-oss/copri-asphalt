-- ════════════════════════════════════════════════════════════════════
-- 0035 — QUANTITIES: QA feedback round 1 (2026-08-12, before backfill)
--
--   1. DIRECT WORK-ORDER MODEL. The kashef→WO approval step is
--      abandoned: the QA uploads/creates a work order directly. The
--      status column stays for schema compatibility but the app now
--      always writes status='wo' (qm_kashef_approve becomes unused —
--      kept in the DB, removed from the UI).
--   2. duration_days on the WO header (المدة بالأيام — part of every
--      ministry work order; backfilled from the register by 0036).
--   3. qm_tadqiq.serial_no — free-entry طلب تدقيق id/serial.
--   4. FULLY-EDITABLE WO, always: removing a line now cascades its
--      allocations (each removal logged) instead of refusing; header
--      fields incl. wo_no/wo_date/duration are editable at any time.
--      Quantity edits were always allowed — unchanged.
--
-- Paste order: 0035 then 0036 (the regenerated backfill).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Columns ───────────────────────────────────────────────────────
alter table qm_kashefs add column if not exists duration_days int
  check (duration_days is null or duration_days > 0);
alter table qm_tadqiq add column if not exists serial_no text not null default '';

-- ── 2. Overview view: duration appended (same leading columns) ───────
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
       k.duration_days
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
revoke all on qm_kashef_overview from anon;
grant select on qm_kashef_overview to authenticated;

-- ── 3. qm_kashef_create: +p_duration_days (old overload DROPPED) ─────
drop function if exists qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date);

create or replace function qm_kashef_create(
  p_contract_code text, p_kashef_no int, p_area text, p_loc_type text,
  p_block_no text, p_street_name text, p_work_type text,
  p_lines jsonb,
  p_kashef_date date default null,
  p_status text default 'wo', p_wo_no text default '', p_wo_date date default null,
  p_duration_days int default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_contract qm_contracts;
  v_id bigint;
  v_line jsonb;
  v_item qm_bop_items;
  v_qty numeric;
  v_count int := 0;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_contract from qm_contracts where code = p_contract_code;
  if v_contract.id is null then return json_build_object('success', false, 'error', 'unknown contract'); end if;
  if p_loc_type not in ('block','street','misc') then
    return json_build_object('success', false, 'error', 'bad loc_type');
  end if;
  if p_loc_type = 'block' and coalesce(p_block_no, '') = '' then
    return json_build_object('success', false, 'error', 'block_no required');
  end if;
  if p_loc_type = 'street' and coalesce(p_street_name, '') = '' then
    return json_build_object('success', false, 'error', 'street_name required');
  end if;
  if p_status not in ('kashef','wo') then
    return json_build_object('success', false, 'error', 'bad status');
  end if;
  if p_status = 'wo' and coalesce(p_wo_no, '') = '' then
    return json_build_object('success', false, 'error', 'wo_no required for wo status');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return json_build_object('success', false, 'error', 'no lines');
  end if;

  insert into qm_kashefs (contract_id, kashef_no, area, loc_type, block_no, street_name,
                          work_type, status, wo_no, wo_date, kashef_date, duration_days, created_by)
  values (v_contract.id, p_kashef_no, coalesce(p_area,''), p_loc_type,
          case when p_loc_type = 'block'  then coalesce(p_block_no,'')    else '' end,
          case when p_loc_type = 'street' then coalesce(p_street_name,'') else '' end,
          coalesce(p_work_type,''), p_status, coalesce(p_wo_no,''), p_wo_date,
          coalesce(p_kashef_date, p_wo_date, (now() at time zone 'Asia/Kuwait')::date),
          p_duration_days, auth.uid())
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from qm_bop_items
      where id = (v_line->>'bop_item_id')::bigint and contract_id = v_contract.id;
    if v_item.id is null then
      raise exception 'bop item % not found in contract', v_line->>'bop_item_id';
    end if;
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'bad qty for item %', qm_item_ref(v_item.id);
    end if;
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (v_id, v_item.id, v_qty);
    v_count := v_count + 1;
  end loop;

  perform qm_log('kashef', v_id, 'create', '', '',
                 '', 'أمر عمل ' || coalesce(nullif(p_wo_no,''), p_kashef_no::text) || ' — ' || v_count || ' بند');
  return json_build_object('success', true, 'id', v_id, 'lines', v_count);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'kashef_no already exists');
end $$;

-- ── 4. qm_kashef_update: +duration_days, WO fields editable always ───
create or replace function qm_kashef_update(p_kashef_id bigint, p_fields jsonb)
returns json language plpgsql security definer set search_path = public as $$
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
                     'kashef_date','wo_no','wo_date','duration_days') then
      return json_build_object('success', false, 'error', 'field not editable: ' || v_key);
    end if;
  end loop;
  if p_fields ? 'loc_type' and p_fields->>'loc_type' not in ('block','street','misc') then
    return json_build_object('success', false, 'error', 'bad loc_type');
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
    end;
    if coalesce(v_old,'') is distinct from coalesce(v_new,'') then
      execute format('update qm_kashefs set %I = $1::%s where id = $2', v_key,
                     case when v_key in ('kashef_no','duration_days') then 'int'
                          when v_key in ('kashef_date','wo_date') then 'date'
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
end $$;

-- ── 5. qm_kashef_line_set: line removal cascades allocations ─────────
create or replace function qm_kashef_line_set(p_kashef_id bigint, p_bop_item_id bigint, p_qty numeric)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_k qm_kashefs;
  v_line qm_kashef_lines;
  v_ref text;
  v_alloc numeric;
  v_a record;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  v_ref := qm_item_ref(p_bop_item_id);
  if v_ref is null then return json_build_object('success', false, 'error', 'bad item'); end if;
  select * into v_line from qm_kashef_lines where kashef_id = p_kashef_id and bop_item_id = p_bop_item_id;

  if p_qty is null then                                   -- remove (allocations cascade, logged)
    if v_line.id is null then return json_build_object('success', false, 'error', 'line not found'); end if;
    for v_a in select al.qty, v2.name as vendor_name
               from qm_allocations al join vendors v2 on v2.id = al.vendor_id
               where al.kashef_line_id = v_line.id loop
      perform qm_log('allocation', p_kashef_id, 'alloc_set', '',
                     v_ref || ' ← ' || v_a.vendor_name, qm_num(v_a.qty), '');
    end loop;
    delete from qm_allocations where kashef_line_id = v_line.id;
    delete from qm_kashef_lines where id = v_line.id;
    perform qm_log('kashef', p_kashef_id, 'line_remove', '', v_ref, qm_num(v_line.qty), '');
    return json_build_object('success', true, 'removed', true);
  end if;

  if p_qty < 0 then return json_build_object('success', false, 'error', 'bad qty'); end if;

  if v_line.id is null then                               -- add
    insert into qm_kashef_lines (kashef_id, bop_item_id, qty) values (p_kashef_id, p_bop_item_id, p_qty)
      returning * into v_line;
    perform qm_log('kashef', p_kashef_id, 'line_add', '', v_ref, '', qm_num(p_qty));
    return json_build_object('success', true, 'lineId', v_line.id);
  end if;

  if v_line.qty is distinct from p_qty then               -- qty change
    update qm_kashef_lines set qty = p_qty where id = v_line.id;
    perform qm_log('kashef', p_kashef_id, 'line_qty', '', v_ref, qm_num(v_line.qty), qm_num(p_qty));
  end if;
  select coalesce(sum(qty),0) into v_alloc from qm_allocations where kashef_line_id = v_line.id;
  return json_build_object('success', true, 'lineId', v_line.id,
    'warnOverAllocated', v_alloc > p_qty, 'allocated', v_alloc);
end $$;

-- ── 6. qm_tadqiq_create: +p_serial (old overload DROPPED) ────────────
drop function if exists qm_tadqiq_create(bigint,bigint,date,text,text,jsonb,boolean);

create or replace function qm_tadqiq_create(
  p_kashef_id bigint, p_vendor_id bigint, p_date date,
  p_street_no text, p_note text, p_lines jsonb,
  p_opening boolean default false, p_serial text default ''
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_k qm_kashefs;
  v_vendor_name text;
  v_id bigint;
  v_line jsonb;
  v_item qm_bop_items;
  v_qty numeric;
  v_kl qm_kashef_lines;
  v_alloc numeric;
  v_exec numeric;
  v_out boolean;
  v_over boolean;
  v_ref text;
  v_warnings jsonb := '[]'::jsonb;
  v_count int := 0;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'kashef not found'); end if;
  select name into v_vendor_name from vendors where id = p_vendor_id and qm_subcontractor;
  if v_vendor_name is null then return json_build_object('success', false, 'error', 'not an active subcontractor'); end if;
  if p_date is null then return json_build_object('success', false, 'error', 'date required'); end if;
  if v_k.loc_type = 'block' and coalesce(p_street_no,'') = '' then
    return json_build_object('success', false, 'error', 'street_no required');
  end if;
  if v_k.loc_type = 'misc' and coalesce(p_street_no,'') <> '' then
    return json_build_object('success', false, 'error', 'street_no not applicable');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return json_build_object('success', false, 'error', 'no lines');
  end if;

  insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, street_no, note, opening, serial_no, created_by)
  values (p_kashef_id, p_vendor_id, p_date,
          case when v_k.loc_type = 'block' then p_street_no else '' end,
          coalesce(p_note,''), coalesce(p_opening,false), coalesce(p_serial,''), auth.uid())
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from qm_bop_items
      where id = (v_line->>'bop_item_id')::bigint and contract_id = v_k.contract_id;
    if v_item.id is null then
      raise exception 'bop item % not found', v_line->>'bop_item_id';
    end if;
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'bad qty for %', qm_item_ref(v_item.id);
    end if;
    v_ref := qm_item_ref(v_item.id);

    select * into v_kl from qm_kashef_lines where kashef_id = p_kashef_id and bop_item_id = v_item.id;
    v_out := v_kl.id is null;
    v_over := false;
    if not v_out then
      select coalesce(sum(qty),0) into v_alloc from qm_allocations
        where kashef_line_id = v_kl.id and vendor_id = p_vendor_id;
      select coalesce(sum(tl.qty),0) into v_exec
        from qm_tadqiq_lines tl join qm_tadqiq t on t.id = tl.tadqiq_id
        where t.kashef_id = p_kashef_id and t.vendor_id = p_vendor_id and tl.bop_item_id = v_item.id;
      v_over := (v_exec + v_qty) > v_alloc;
    end if;

    insert into qm_tadqiq_lines (tadqiq_id, bop_item_id, qty, out_of_kashef, over_allocation)
    values (v_id, v_item.id, v_qty, v_out, v_over);
    v_count := v_count + 1;

    if v_out then
      v_warnings := v_warnings || jsonb_build_object('ref', v_ref, 'kind', 'out_of_kashef');
      perform qm_log('tadqiq', p_kashef_id, 'warning', 'out_of_kashef',
                     v_ref || ' ← ' || v_vendor_name, '', qm_num(v_qty));
    elsif v_over then
      v_warnings := v_warnings || jsonb_build_object('ref', v_ref, 'kind', 'over_allocation',
                                                     'allocated', v_alloc, 'executed', v_exec + v_qty);
      perform qm_log('tadqiq', p_kashef_id, 'warning', 'over_allocation',
                     v_ref || ' ← ' || v_vendor_name, qm_num(v_alloc), qm_num(v_exec + v_qty));
    end if;
  end loop;

  perform qm_log('tadqiq', p_kashef_id, 'tadqiq_create', '',
                 v_vendor_name || ' — ' || p_date ||
                 case when coalesce(p_serial,'') <> '' then ' — ' || p_serial else '' end,
                 '', v_count || ' بند' || case when coalesce(p_opening,false) then ' (رصيد افتتاحي)' else '' end);
  return json_build_object('success', true, 'id', v_id, 'lines', v_count, 'warnings', v_warnings);
end $$;

-- ── 7. Grants for the new signatures ─────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date,int)',
    'qm_kashef_update(bigint,jsonb)',
    'qm_kashef_line_set(bigint,bigint,numeric)',
    'qm_tadqiq_create(bigint,bigint,date,text,text,jsonb,boolean,text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
