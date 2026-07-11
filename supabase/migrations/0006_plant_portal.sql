-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0006: plant-manager portal (interim PIN auth)
-- ═══════════════════════════════════════════════════════════════════
-- ?plantRole=manager portal: plant dashboard + planned asphalt programs
-- (the WhatsApp texts the site engineers send, structured) + recipient
-- requests (plant manager asks the main office to add a client — a
-- project under a company — as an asphalt recipient).
-- Interim dropdown+PIN like the other portals; replaced by Supabase Auth
-- in the auth phase. Writes go through SECURITY DEFINER RPCs; anon reads.

-- ── Who can log in (edit names/PINs in the Table Editor) ─────────────
create table plant_managers (
  id     bigint generated always as identity primary key,
  name   text not null unique,
  pin    text not null default '',
  active boolean not null default true
);
insert into plant_managers (name, pin) values ('صلاح الخطيب', '1064');

-- Finance approves recipient requests (?financeRole=manager portal).
create table finance_managers (
  id     bigint generated always as identity primary key,
  name   text not null unique,
  pin    text not null default '',
  phone  text not null default '',   -- WhatsApp, digits with country code
  active boolean not null default true
);
insert into finance_managers (name, pin, phone) values ('جيمي بالاكال', '6644', '96566445179');

-- ── Planned asphalt work days (source: engineers' WhatsApp programs) ─
create table asphalt_programs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  work_date  date not null,
  company    text not null default '',   -- receiving company (كوبري or external)
  project    text not null default '',   -- receiving project — matched by the dispatch form's quick-pick
  site       text not null default '',   -- bare site name (مشرف / سلوى…) so it matches the site dropdown
  block      text not null default '',   -- قطعة (may be empty)
  street     text not null default '',   -- شارع / street name
  mix        text not null default '',   -- summary, e.g. Type I (60/70) or "A + B"
  loads      int,                        -- عدد السيارات (total across mixes)
  mixes      jsonb not null default '[]'::jsonb,  -- [{mix, loads}] when multi-mix
  plant      text not null default '',   -- AP01 / AP02
  load_time  text not null default '',   -- موعد التحميل (HH:MM)
  pave_time  text not null default '',   -- موعد الفرش (HH:MM)
  notes      text not null default '',
  status     text not null default 'مخطط' check (status in ('مخطط','منفذ','ملغي')),
  created_by text not null default ''
);
create index asphalt_programs_date on asphalt_programs (work_date desc);

create or replace function asphalt_program_submit(
  p_work_date date, p_company text, p_project text, p_site text,
  p_block text, p_street text, p_mix text, p_loads int, p_plant text,
  p_load_time text, p_pave_time text, p_notes text, p_by text,
  p_mixes jsonb default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_mix text := coalesce(p_mix, '');
  v_loads int := p_loads;
  v_mixes jsonb := coalesce(p_mixes, '[]'::jsonb);
begin
  if p_work_date is null or coalesce(p_site, '') = '' then
    return json_build_object('success', false, 'error', 'work_date and site are required');
  end if;
  -- Multi-mix programs: the mixes array is authoritative; the legacy mix /
  -- loads columns become the display summary and total.
  if jsonb_array_length(v_mixes) > 0 then
    select string_agg(x->>'mix', ' + '), sum((x->>'loads')::int)
      into v_mix, v_loads from jsonb_array_elements(v_mixes) x;
  end if;
  insert into asphalt_programs (work_date, company, project, site, block, street,
                                mix, loads, mixes, plant, load_time, pave_time, notes, created_by)
  values (p_work_date, coalesce(p_company, ''), coalesce(p_project, ''), p_site,
          coalesce(p_block, ''), coalesce(p_street, ''), coalesce(v_mix, ''), v_loads, v_mixes,
          coalesce(p_plant, ''), coalesce(p_load_time, ''), coalesce(p_pave_time, ''),
          coalesce(p_notes, ''), coalesce(p_by, ''))
  returning id into v_id;
  return json_build_object('success', true, 'id', v_id);
end $$;

create or replace function asphalt_program_set_status(
  p_id bigint, p_status text, p_by text
) returns json
language plpgsql security definer set search_path = public as $$
begin
  update asphalt_programs set status = p_status where id = p_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true);
exception when check_violation then
  return json_build_object('success', false, 'error', 'invalid status');
end $$;

-- ── Recipient requests: plant manager → main office approval ─────────
create table recipient_requests (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  company      text not null default '',  -- existing or proposed company
  client       text not null,             -- the client/project to add under it
  contract     text not null default '',
  payment      text not null default ''   -- نقدي / آجل
               check (payment in ('نقدي','آجل','')),
  details      text not null default '',
  requested_by text not null default '',
  status       text not null default 'قيد المراجعة'
               check (status in ('قيد المراجعة','موافَق عليه','مرفوض')),
  decided_by   text not null default '',
  decided_at   timestamptz,
  office_note  text not null default ''
);
create index recipient_requests_ts on recipient_requests (created_at desc);

create or replace function recipient_request_submit(
  p_company text, p_client text, p_contract text, p_payment text, p_details text, p_by text
) returns json
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if coalesce(p_client, '') = '' then
    return json_build_object('success', false, 'error', 'client is required');
  end if;
  insert into recipient_requests (company, client, contract, payment, details, requested_by)
  values (coalesce(p_company, ''), p_client, coalesce(p_contract, ''), coalesce(p_payment, ''),
          coalesce(p_details, ''), coalesce(p_by, ''))
  returning id into v_id;
  return json_build_object('success', true, 'id', v_id);
exception when check_violation then
  return json_build_object('success', false, 'error', 'invalid payment value');
end $$;

-- Office decision (used by the office UI next phase; until then the office
-- can decide from the Table Editor or the SQL editor).
create or replace function recipient_request_decide(
  p_id bigint, p_decision text, p_by text, p_note text
) returns json
language plpgsql security definer set search_path = public as $$
begin
  update recipient_requests
     set status = p_decision, decided_by = coalesce(p_by, ''),
         decided_at = now(), office_note = coalesce(p_note, '')
   where id = p_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true);
exception when check_violation then
  return json_build_object('success', false, 'error', 'invalid decision');
end $$;

-- ── Seed: real programs from Eng. Tawfik's WhatsApp (2026-07-10 evening),
--    for Saturday 2026-07-11 — Hawalli contract ق ص/ط ش/9 ────────────────
insert into asphalt_programs (work_date, company, project, site, block, street, mix, loads, plant, load_time, pave_time, notes, created_by) values
('2026-07-11', 'كوبري', 'كوبري — صيانة حولي', 'مشرف', '', '57', 'Type I (60/70)', 9, 'AP01', '19:00', '21:00',
 'المهندس المشرف: حسين مراد · مهندس المتعهد: مجدي الحسيني · للتنسيق: م. احمد الدريويش 98052257', 'م. توفيق'),
('2026-07-11', 'كوبري', 'كوبري — صيانة حولي', 'سلوى', '9', '1', 'Type II (60/70)', 6, 'AP01', '20:00', '22:00',
 'المهندس المشرف: حسين مراد · مهندس المتعهد: مجدي الحسيني · للتنسيق: م. محمد الزيد 99917627', 'م. توفيق'),
('2026-07-11', 'كوبري', 'كوبري — صيانة حولي', 'بيان', '10', '1', 'Type II + Type I (60/70)', 8, 'AP01', '15:00', '20:00',
 'المهندس المشرف: حسين مراد · مهندس المتعهد: مجدي الحسيني · للتنسيق: م. فالح حمود 99012990', 'م. توفيق');
update asphalt_programs
   set mixes = '[{"mix":"Type II (60/70)","loads":6},{"mix":"Type I (60/70)","loads":2}]'::jsonb
 where site = 'بيان' and work_date = '2026-07-11';

-- ── RLS: anon read; all writes via the definer RPCs above ────────────
do $$
declare t text;
begin
  foreach t in array array['plant_managers','finance_managers','asphalt_programs','recipient_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "anon read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

grant execute on function asphalt_program_submit to anon, authenticated;
grant execute on function asphalt_program_set_status to anon, authenticated;
grant execute on function recipient_request_submit to anon, authenticated;
grant execute on function recipient_request_decide to anon, authenticated;
