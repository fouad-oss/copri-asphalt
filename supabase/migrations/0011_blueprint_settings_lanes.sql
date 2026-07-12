-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0011: Blueprint settings store + lane-width reports
-- ═══════════════════════════════════════════════════════════════════
-- 1) blueprint_settings: small key→jsonb store so the office can adjust
--    the paving factors (layer thicknesses, density, laying width) from
--    the app instead of a deploy. Writes go through the same PIN gate
--    as work reports (blueprint_reporters).
-- 2) blueprint_worklog.width_frac: fraction of the street width a report
--    covers (1 = full width, 0.5 = one of two lanes, …) — for streets
--    worked one lane at a time. blueprint_report_submit gains an optional
--    p_width_frac (old clients keep working via the default).
-- Safe to run before the frontend deploys (pure addition).

create table if not exists blueprint_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table blueprint_settings enable row level security;
drop policy if exists blueprint_settings_read on blueprint_settings;
create policy blueprint_settings_read on blueprint_settings
  for select to anon, authenticated using (true);
-- writes only via the SECURITY DEFINER RPC below

create or replace function blueprint_settings_set(p_pin text, p_key text, p_value jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from blueprint_reporters where pin = p_pin and active limit 1;
  if v_name is null then
    return json_build_object('success', false, 'error', 'bad pin');
  end if;
  if p_key is null or p_key = '' or p_value is null then
    return json_build_object('success', false, 'error', 'bad args');
  end if;
  insert into blueprint_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, v_name, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return json_build_object('success', true, 'by', v_name);
end $$;
grant execute on function blueprint_settings_set(text, text, jsonb) to anon, authenticated;

-- ── lane-width fraction on segment reports ──────────────────────────
alter table blueprint_worklog
  add column if not exists width_frac numeric not null default 1
  check (width_frac > 0 and width_frac <= 1);

-- Recreate with the extra defaulted arg (same name + new signature would
-- otherwise leave an ambiguous overload for PostgREST).
drop function if exists blueprint_report_submit(text, text, date, text, text[], text);
create or replace function blueprint_report_submit(
  p_pin text, p_stage text, p_date date, p_unit text,
  p_segment_ids text[], p_note text default '', p_width_frac numeric default 1
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
  if p_width_frac is null or p_width_frac <= 0 or p_width_frac > 1 then
    return json_build_object('success', false, 'error', 'bad width fraction');
  end if;
  v_report := 'BLR-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into blueprint_worklog (report_id, segment_id, unit, stage, work_date, by_name, note, width_frac)
  select v_report, s, p_unit, p_stage, p_date, v_name, coalesce(p_note, ''), p_width_frac
  from unnest(p_segment_ids) as s;
  get diagnostics v_rows = row_count;
  return json_build_object('success', true, 'report_id', v_report, 'rows', v_rows);
end $$;
grant execute on function blueprint_report_submit(text, text, date, text, text[], text, numeric) to anon, authenticated;
