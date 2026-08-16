-- ════════════════════════════════════════════════════════════════════
-- 0049 — QUANTITIES: a 'chainage' location type for highway work orders
--        (Fouad, 2026-08-16, for the Expressway backfill)
--
-- Hawalli work orders are located by قطعة/شارع inside an area, which the
-- block/street/misc model covers. Expressway work orders are located
-- along two highways by station, e.g.
--     «طريق الملك فهد من محطة 000+7 الى محطة 000+12 بالاتجاهين»
-- Forcing those into `misc` would throw away the road, the range and the
-- direction, and would make every Expressway WO look unlocated.
--
--   A. loc_type gains 'chainage'.
--   B. qm_kashefs gains km_from / km_to / direction / location_text.
--   C. qm_kashef_create: +4 params, accepts 'chainage' (old overload
--      DROPPED, as 0035 did).
--   D. qm_kashef_update: learns the 4 new fields and 'chainage'.
--   E. qm_kashef_overview: the 4 columns APPENDED (see note).
--
-- ── how the fields are meant to be used ─────────────────────────────
--   area           the road — طريق الملك فهد / طريق الفحيحيل / …
--                  (same role it plays for block/street rows)
--   location_text  the ministry's own wording of the location, verbatim.
--                  REQUIRED for chainage rows: it is what is printed on
--                  the كشف and it is the work order's identity. Only 22
--                  of the Expressway's 59 issued WOs carry a parseable
--                  محطة range at all — the rest are junctions (تقاطع 78),
--                  entrances (مدخل ومخرج سلوى) or named areas — so the
--                  text is the reliable field and km_from/km_to are the
--                  optional structured extract, never the other way round.
--   km_from/km_to  station in kilometres (محطة 000+7 -> 7.000). Both
--                  optional. NOT ordered: «من محطة 000+11 الى محطة 000+5»
--                  runs descending, which is legitimate.
--   direction      بالاتجاهين / اتجاه الشمال / اتجاه الجنوب / باتجاه الكويت …
--
-- ── qm_tadqiq_create deliberately untouched ─────────────────────────
-- It only branches on 'block' (street_no required) and 'misc' (street_no
-- refused); 'chainage' falls through both, so a طلب تدقيق against a
-- chainage WO needs no street_no and stores '' — the same behaviour
-- 'street' already gets. No change needed.
--
-- NOTE (42P16): `create or replace view` cannot rename or reorder
-- columns, so the 4 new columns are APPENDED to qm_kashef_overview.
-- Idempotent; safe to re-run. Paste after 0047/0048.
-- ════════════════════════════════════════════════════════════════════

-- ── A. loc_type constraint ───────────────────────────────────────────
-- Dropped by lookup rather than by name: it was created inline in 0033
-- as a column constraint, so the generated name is an implementation
-- detail we should not hard-code.
do $qmch$
declare
  v_name text;
begin
  for v_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'qm_kashefs'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%loc_type%'
  loop
    execute format('alter table qm_kashefs drop constraint %I', v_name);
  end loop;

  alter table qm_kashefs
    add constraint qm_kashefs_loc_type_check
    check (loc_type in ('block', 'street', 'misc', 'chainage'));
end $qmch$;

-- ── B. columns ───────────────────────────────────────────────────────
alter table qm_kashefs add column if not exists km_from       numeric;
alter table qm_kashefs add column if not exists km_to         numeric;
alter table qm_kashefs add column if not exists direction     text not null default '';
alter table qm_kashefs add column if not exists location_text text not null default '';

do $qmch$
begin
  if not exists (
    select 1 from pg_constraint con join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'qm_kashefs' and con.conname = 'qm_kashefs_km_nonneg') then
    alter table qm_kashefs add constraint qm_kashefs_km_nonneg
      check ((km_from is null or km_from >= 0) and (km_to is null or km_to >= 0));
  end if;
end $qmch$;

-- ── C. qm_kashef_create ──────────────────────────────────────────────
drop function if exists qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date,int);

create or replace function qm_kashef_create(
  p_contract_code text, p_kashef_no int, p_area text, p_loc_type text,
  p_block_no text, p_street_name text, p_work_type text,
  p_lines jsonb,
  p_kashef_date date default null,
  p_status text default 'wo', p_wo_no text default '', p_wo_date date default null,
  p_duration_days int default null,
  p_location_text text default '', p_km_from numeric default null,
  p_km_to numeric default null, p_direction text default ''
) returns json language plpgsql security definer set search_path = public as $qm$
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
  if p_loc_type not in ('block','street','misc','chainage') then
    return json_build_object('success', false, 'error', 'bad loc_type');
  end if;
  if p_loc_type = 'block' and coalesce(p_block_no, '') = '' then
    return json_build_object('success', false, 'error', 'block_no required');
  end if;
  if p_loc_type = 'street' and coalesce(p_street_name, '') = '' then
    return json_build_object('success', false, 'error', 'street_name required');
  end if;
  if p_loc_type = 'chainage' and coalesce(p_location_text, '') = '' then
    return json_build_object('success', false, 'error', 'location_text required');
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
                          work_type, status, wo_no, wo_date, kashef_date, duration_days,
                          location_text, km_from, km_to, direction, created_by)
  values (v_contract.id, p_kashef_no, coalesce(p_area,''), p_loc_type,
          case when p_loc_type = 'block'  then coalesce(p_block_no,'')    else '' end,
          case when p_loc_type = 'street' then coalesce(p_street_name,'') else '' end,
          coalesce(p_work_type,''), p_status, coalesce(p_wo_no,''), p_wo_date,
          coalesce(p_kashef_date, p_wo_date, (now() at time zone 'Asia/Kuwait')::date),
          p_duration_days,
          case when p_loc_type = 'chainage' then coalesce(p_location_text,'') else '' end,
          case when p_loc_type = 'chainage' then p_km_from else null end,
          case when p_loc_type = 'chainage' then p_km_to   else null end,
          case when p_loc_type = 'chainage' then coalesce(p_direction,'')   else '' end,
          auth.uid())
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
end $qm$;

-- ── D. qm_kashef_update ──────────────────────────────────────────────
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
                     'kashef_date','wo_no','wo_date','duration_days','closed','daily_penalty',
                     'location_text','km_from','km_to','direction') then
      return json_build_object('success', false, 'error', 'field not editable: ' || v_key);
    end if;
  end loop;
  if p_fields ? 'loc_type' and p_fields->>'loc_type' not in ('block','street','misc','chainage') then
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
      when 'location_text' then v_k.location_text
      when 'km_from' then coalesce(v_k.km_from::text,'')
      when 'km_to' then coalesce(v_k.km_to::text,'')
      when 'direction' then v_k.direction
    end;
    if coalesce(v_old,'') is distinct from coalesce(v_new,'') then
      execute format('update qm_kashefs set %I = $1::%s where id = $2', v_key,
                     case when v_key in ('kashef_no','duration_days') then 'int'
                          when v_key in ('kashef_date','wo_date') then 'date'
                          when v_key = 'closed' then 'boolean'
                          when v_key in ('daily_penalty','km_from','km_to') then 'numeric'
                          else 'text' end)
        using (case when v_key in ('wo_date','duration_days','daily_penalty','km_from','km_to')
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

-- ── E. qm_kashef_overview (+4 columns, APPENDED) ─────────────────────
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
       c.contract_value,
       k.location_text,                                  -- appended (42P16)
       k.km_from,                                        -- appended
       k.km_to,                                          -- appended
       k.direction                                       -- appended
from qm_kashefs k
join qm_contracts c on c.id = k.contract_id
left join (
  select kl.kashef_id, count(*) as n, sum(kl.qty * bi.rate) as subtotal
  from qm_kashef_lines kl join qm_bop_items bi on bi.id = kl.bop_item_id
  group by kl.kashef_id
) l on l.kashef_id = k.id
left join (
  select kl.kashef_id, sum(al.qty * bi.rate) as alloc_value
  from qm_allocations al
  join qm_kashef_lines kl on kl.id = al.kashef_line_id
  join qm_bop_items bi on bi.id = kl.bop_item_id
  group by kl.kashef_id
) a on a.kashef_id = k.id
left join (
  select t.kashef_id, sum(tl.qty * bi.rate) as exec_value,
         count(distinct t.id) as tadqiq_count
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  group by t.kashef_id
) e on e.kashef_id = k.id;

-- ── F. grants for the new qm_kashef_create signature ─────────────────
do $qmch$
declare f text;
begin
  foreach f in array array[
    'qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date,int,text,numeric,numeric,text)',
    'qm_kashef_update(bigint,jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $qmch$;
