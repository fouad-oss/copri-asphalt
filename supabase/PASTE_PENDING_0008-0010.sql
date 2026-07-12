-- ═══════════════════════════════════════════════════════════════════
-- ONE-PASTE BUNDLE: pending migrations 0008 + 0009 + 0010 (2026-07-12)
-- Paste this whole file into the Supabase SQL editor and Run once.
-- ═══════════════════════════════════════════════════════════════════
-- 0008: work_order_add RPC — the WO portal's "إضافة أمر عمل" + '*' remap
-- 0009: blueprint_worklog + blueprint_reporters (seed: فؤاد الزغبي,
--       PIN 5729 — change in Table Editor) + report RPCs
-- 0010: reassign the 9 mis-entered 2026-07-06 loads from ش59 to ش57
-- All three are independent and idempotent-safe to run once.
-- The canonical copies live in supabase/migrations/.

-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0008: add work orders from the WO portal (?wo)
-- ═══════════════════════════════════════════════════════════════════
-- work_order_add(): SECURITY DEFINER insert into the locked work_orders
-- reference table, plus an optional remap of dispatch/materials rows
-- logged under the placeholder work order '*' ("no order issued yet")
-- at the same location. Discipline decides which log gets remapped:
-- asphalt → dispatch_loads, civil → material_receipts, both → both.
-- Safe to run BEFORE the new frontend deploys (pure addition).

create or replace function work_order_add(
  p_project text, p_site text, p_block text, p_street text,
  p_discipline text, p_wo text, p_description text,
  p_map_star boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_project_id bigint;
  v_site_id    bigint;
  v_wo     text := trim(coalesce(p_wo, ''));
  v_block  text := trim(coalesce(p_block, ''));
  v_street text := trim(coalesce(p_street, ''));
  v_disp int := 0;
  v_mat  int := 0;
begin
  if v_wo = '' then
    return json_build_object('success', false, 'error', 'wo required');
  end if;
  if p_discipline not in ('asphalt', 'civil', 'both') then
    return json_build_object('success', false, 'error', 'bad discipline');
  end if;
  select id into v_project_id from projects where name = p_project;
  if v_project_id is null then
    return json_build_object('success', false, 'error', 'unknown project');
  end if;
  if coalesce(p_site, '') <> '' then
    select id into v_site_id from sites where project_id = v_project_id and site = p_site;
    if v_site_id is null then
      return json_build_object('success', false, 'error', 'unknown site');
    end if;
  end if;

  begin
    insert into work_orders (project_id, site_id, wo, discipline, block, street, status, description)
    values (v_project_id, v_site_id, v_wo, p_discipline, v_block, v_street, 'جاري',
            trim(coalesce(p_description, '')));
  exception when unique_violation then
    return json_build_object('success', false, 'error', 'duplicate');
  end;

  -- Remap the '*' placeholder rows this new order now covers.
  if p_map_star and coalesce(p_site, '') <> '' and (v_block <> '' or v_street <> '') then
    -- Dispatch (asphalt log): block rows keep the block in `block`;
    -- named-street rows store the street NAME in `block` (loc_type 'اسم الشارع').
    if p_discipline in ('asphalt', 'both') then
      update dispatch_loads set work_order = v_wo
       where work_order = '*' and project = p_project and site = p_site
         and ((v_block  <> '' and block = v_block  and loc_type <> 'اسم الشارع')
           or (v_street <> '' and block = v_street and loc_type =  'اسم الشارع'));
      get diagnostics v_disp = row_count;
    end if;
    -- Materials (civil log): named street lives in `street`, block in `block`.
    if p_discipline in ('civil', 'both') then
      update material_receipts set work_order = v_wo
       where work_order = '*' and project = p_project and site = p_site
         and ((v_block  <> '' and block  = v_block)
           or (v_street <> '' and street = v_street));
      get diagnostics v_mat = row_count;
    end if;
  end if;

  return json_build_object('success', true, 'mapped_dispatch', v_disp, 'mapped_materials', v_mat);
end $$;

grant execute on function work_order_add(text, text, text, text, text, text, text, boolean) to anon, authenticated;
-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0009: Blueprint segment work reports
-- ═══════════════════════════════════════════════════════════════════
-- The Blueprint map's segment-level worklog: WHERE along a street the
-- asphalt went down (dispatch tonnage already says how much and when).
-- Reporting is gated by blueprint_reporters — seeded with Fouad only;
-- adding engineers later = inserting rows, nothing else changes.
-- Safe to run before the frontend deploys (pure addition).

create table if not exists blueprint_worklog (
  id         bigserial primary key,
  report_id  text not null,            -- groups one save action
  segment_id text not null,            -- blueprint segment id (100 m piece)
  unit       text not null,            -- street unit key (site|block|street)
  stage      text not null check (stage in ('type_i', 'type_ii', 'type_iii')),
  work_date  date not null,
  by_name    text not null,
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists blueprint_worklog_by_unit on blueprint_worklog (unit, work_date);

alter table blueprint_worklog enable row level security;
drop policy if exists blueprint_worklog_read on blueprint_worklog;
create policy blueprint_worklog_read on blueprint_worklog
  for select to anon, authenticated using (true);
-- writes only via the SECURITY DEFINER RPC below

create table if not exists blueprint_reporters (
  id     bigserial primary key,
  name   text not null,
  pin    text not null,
  active boolean not null default true
);
alter table blueprint_reporters enable row level security;
-- no policies: PINs are never readable from the client

-- Seed: Fouad only for now. PIN 5729 — change it in the Table Editor.
insert into blueprint_reporters (name, pin)
select 'فؤاد الزغبي', '5729'
where not exists (select 1 from blueprint_reporters);

-- PIN check → reporter name (the client never sees the PIN list).
create or replace function blueprint_reporter_check(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from blueprint_reporters where pin = p_pin and active limit 1;
  if v_name is null then
    return json_build_object('success', false);
  end if;
  return json_build_object('success', true, 'name', v_name);
end $$;
grant execute on function blueprint_reporter_check(text) to anon, authenticated;

-- One report = one stage + one date + N adjacent segments of one street.
create or replace function blueprint_report_submit(
  p_pin text, p_stage text, p_date date, p_unit text,
  p_segment_ids text[], p_note text default ''
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_report text;
  v_rows int;
begin
  select name into v_name from blueprint_reporters where pin = p_pin and active limit 1;
  if v_name is null then
    return json_build_object('success', false, 'error', 'bad pin');
  end if;
  if p_stage not in ('type_i', 'type_ii', 'type_iii') then
    return json_build_object('success', false, 'error', 'bad stage');
  end if;
  if p_segment_ids is null or array_length(p_segment_ids, 1) is null then
    return json_build_object('success', false, 'error', 'no segments');
  end if;
  if p_date > current_date then
    return json_build_object('success', false, 'error', 'future date');
  end if;
  v_report := 'BLR-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into blueprint_worklog (report_id, segment_id, unit, stage, work_date, by_name, note)
  select v_report, s, p_unit, p_stage, p_date, v_name, coalesce(p_note, '')
  from unnest(p_segment_ids) as s;
  get diagnostics v_rows = row_count;
  return json_build_object('success', true, 'report_id', v_report, 'rows', v_rows);
end $$;
grant execute on function blueprint_report_submit(text, text, date, text, text[], text) to anon, authenticated;
-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0010: reassign 9 mis-entered loads from ش59 to ش57
-- ═══════════════════════════════════════════════════════════════════
-- User-confirmed (2026-07-12): the 2026-07-06 Type I loads recorded on
-- مشرف شارع 59 actually went to شارع 57 — the plant clerks picked 59
-- because 57 was not yet a dropdown option. These are exactly the rows
-- Blueprint flagged as out-of-sequence (Type I after 59 reached Type II).
-- Named-street rows keep the street name in `block`.

update dispatch_loads
set block = '57',
    remarks = trim(both ' | ' from coalesce(remarks, '') || ' | تصحيح الموقع: شارع 57 (سُجل 59 خطأً عند الإدخال)')
where site = 'مشرف'
  and loc_type = 'اسم الشارع'
  and block = '59'
  and note in ('126106', '126108', '126111', '126114', '126117',
               '126119', '126122', '126126', '126127');
-- expected: UPDATE 9
