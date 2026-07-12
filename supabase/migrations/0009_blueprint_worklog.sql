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
