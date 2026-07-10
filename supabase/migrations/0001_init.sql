-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — Supabase schema v1 (migrated from Google Sheets)
-- ═══════════════════════════════════════════════════════════════════
-- Reference tables replace the 5 staff-editable Google Sheet files
-- (Plant / per-project / Materials / Milling). Log tables replace the
-- register tabs (Dispatch Log / Receipt Log / Materials Log / Milling
-- Programs). Log rows keep names as text (historical event records),
-- reference tables carry unique natural keys.
--
-- Access model v1 = same posture as the public Apps Script URL:
-- anon read everywhere, anon insert/update on logs only. Reference
-- edits go through the Supabase dashboard (or service_role) until the
-- per-user-type front-end lands; RLS tightens then.

-- ── Reference: plant hub ─────────────────────────────────────────────
create table app_settings (
  key   text primary key,
  value text not null default ''
);

create table clients (
  id        bigint generated always as identity primary key,
  company   text not null unique,
  is_copri  boolean not null default false
);

create table client_projects (
  id                 bigint generated always as identity primary key,
  company            text not null,
  project            text not null,
  contract           text not null default '',
  location_type      text not null default 'block_street'
                     check (location_type in ('block_street','km_range')),
  allow_named_street boolean not null default false,
  unique (company, project)
);

create table clerks (
  id   bigint generated always as identity primary key,
  name text not null unique,
  pin  text not null
);

create table drivers (
  id       bigint generated always as identity primary key,
  name     text not null,
  phone    text not null default '',
  plate    text not null default '',
  company  text not null default '',
  is_copri boolean not null default false
);

-- simple value lists (mix types, plants, transporters, rejection
-- reasons, milling priorities) — one table with a kind discriminator
create table list_options (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in
             ('mix_type','plant','transporter','rejection_reason','milling_priority')),
  value      text not null,
  sort_order int  not null default 0,
  unique (kind, value)
);

-- ── Reference: Copri projects ────────────────────────────────────────
create table projects (
  id                 bigint generated always as identity primary key,
  name               text not null unique,
  company            text not null default 'كوبري',
  contract           text not null default '',
  location_type      text not null default 'block_street'
                     check (location_type in ('block_street','km_range')),
  allow_named_street boolean not null default false
);

create table staff (
  id        bigint generated always as identity primary key,
  project   text not null,
  name      text not null,
  pin       text not null,
  phone     text not null default '',
  function  text not null default 'asphalt'
            check (function in ('asphalt','civil','both')),
  milling   boolean not null default false,
  unique (project, name)
);

create table sites (
  id      bigint generated always as identity primary key,
  project text not null,
  site    text not null,
  unique (project, site)
);

create table streets (
  id      bigint generated always as identity primary key,
  project text not null,
  site    text not null,
  street  text not null,
  unique (project, site, street)
);

create table work_orders (
  id          bigint generated always as identity primary key,
  project     text not null,
  site        text not null default '',
  block       text not null default '',
  street      text not null default '',
  discipline  text not null default ''
              check (discipline in ('','asphalt','civil','both')),
  wo          text not null,
  status      text not null default 'جاري',
  description text not null default ''
);
create index work_orders_lookup on work_orders (project, site);

-- ── Reference: materials + milling ───────────────────────────────────
create table suppliers (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table subcontractors (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table material_catalog (
  id       bigint generated always as identity primary key,
  category text not null,
  item     text not null,
  unit     text not null default '',
  unique (category, item)
);

create table milling_managers (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  pin      text not null,
  role     text not null check (role in ('pm','marco')),
  projects text not null default ''   -- comma-separated, '' = all
);

create table milling_machines (
  id    bigint generated always as identity primary key,
  code  text not null unique,
  name  text not null default '',
  width text not null default ''
);

-- ── Logs: asphalt dispatch + receipt ─────────────────────────────────
create table dispatch_loads (
  id              bigint generated always as identity primary key,
  ts              timestamptz not null default now(),
  project         text not null default '',
  contract        text not null default '',
  work_order      text not null default '',
  note            text not null unique,          -- delivery-note number
  plant           text not null default '',
  truck           text not null default '',
  driver          text not null default '',
  mix             text not null default '',
  weight          numeric,                       -- tons
  temp_dispatch   numeric,                       -- °C
  site            text not null default '',
  block           text not null default '',      -- block / from-km / street name
  street          text not null default '',      -- street / to-km
  loc_type        text not null default '',      -- Arabic label as stored today
  clerk           text not null default '',
  remarks         text not null default '',
  status          text not null default '',      -- في الطريق / decision / لا ينطبق
  company         text not null default '',
  naqel           text not null default '',      -- transporter
  driver_phone    text not null default '',
  load_number     int,
  notify_engineer text not null default ''
);
create index dispatch_ts on dispatch_loads (ts desc);
create index dispatch_project_ts on dispatch_loads (project, ts desc);

create table receipts (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  note           text not null,                  -- links to dispatch_loads.note
  work_order     text not null default '',
  engineer       text not null default '',
  decision       text not null default '',
  weight_arrival numeric,
  temp_arrival   numeric,
  remarks        text not null default ''
);
create index receipts_note on receipts (note);
create index receipts_ts on receipts (ts desc);

-- ── Logs: materials + milling ────────────────────────────────────────
create table material_receipts (
  id            bigint generated always as identity primary key,
  receipt_id    text not null unique,            -- e.g. MR-xxxxx (app-generated)
  ts            timestamptz not null default now(),
  receiver      text not null default '',
  project       text not null default '',
  site          text not null default '',
  work_order    text not null default '',
  block         text not null default '',
  street        text not null default '',
  category      text not null default '',
  material      text not null default '',
  quantity      numeric,
  unit          text not null default '',
  rate          numeric,
  amount        numeric,
  supplier      text not null default '',
  subcontractor text not null default '',
  photo_url     text not null default '',
  remarks       text not null default ''
);
create index material_receipts_ts on material_receipts (ts desc);

create table milling_programs (
  program_id         text primary key,           -- e.g. MP-xxxxx (app-generated)
  project            text not null default '',
  work_order         text not null default '',
  site               text not null default '',
  block              text not null default '',
  street             text not null default '',
  depth              text not null default '',
  item_code          text not null default '',
  area               numeric,
  machines           int,
  requested_date     date,
  priority           text not null default '',
  engineer           text not null default '',
  submitted_at       timestamptz not null default now(),
  status             text not null default '',   -- Arabic MILL.* values
  pm_name            text not null default '',
  pm_decision        text not null default '',
  pm_note            text not null default '',
  pm_decided_at      timestamptz,
  audit              jsonb not null default '[]'::jsonb,
  marco_scheduled_at timestamptz,
  marco_note         text not null default '',
  eng_notes          text not null default ''
);

-- ── RLS ──────────────────────────────────────────────────────────────
-- v1: anon read on everything (mirrors the public Apps Script API),
-- anon write only on the four log tables. Reference tables are edited
-- via the Supabase dashboard / service_role until real auth lands.
do $$
declare t text;
begin
  foreach t in array array[
    'app_settings','clients','client_projects','clerks','drivers','list_options',
    'projects','staff','sites','streets','work_orders',
    'suppliers','subcontractors','material_catalog','milling_managers','milling_machines',
    'dispatch_loads','receipts','material_receipts','milling_programs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "anon read" on %I for select to anon, authenticated using (true)', t);
  end loop;

  foreach t in array array['dispatch_loads','receipts','material_receipts','milling_programs'] loop
    execute format('create policy "anon insert" on %I for insert to anon, authenticated with check (true)', t);
  end loop;

  -- receipt confirmation updates the dispatch row status;
  -- PM/Marco decisions update milling programs
  foreach t in array array['dispatch_loads','milling_programs'] loop
    execute format('create policy "anon update" on %I for update to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── Storage: materials receipt photos ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('material-receipts', 'material-receipts', true)
on conflict (id) do nothing;

create policy "anon upload receipts" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'material-receipts');

create policy "public read receipts" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'material-receipts');

-- ── RPC: ref_payload() ───────────────────────────────────────────────
-- One-call reference payload in the exact shape the frontend's
-- applyReferenceData() has always consumed (formerly Apps Script ?ref=1).
create or replace function ref_payload() returns json
language sql stable as $$
select json_build_object(
  'version', '1',
  'settings', (select coalesce(json_object_agg(key, value), '{}'::json) from app_settings),
  'clients', (select coalesce(json_agg(json_build_object(
      'company', company, 'isCopri', is_copri) order by id), '[]'::json) from clients),
  'clientProjects', (select coalesce(json_agg(json_build_object(
      'company', company, 'project', project, 'contract', contract,
      'locationType', location_type, 'allowNamedStreet', allow_named_street) order by id), '[]'::json) from client_projects),
  'clerks', (select coalesce(json_agg(json_build_object(
      'name', name, 'pin', pin) order by id), '[]'::json) from clerks),
  'drivers', (select coalesce(json_agg(json_build_object(
      'name', name, 'phone', phone, 'plate', plate, 'company', company,
      'copri', is_copri) order by id), '[]'::json) from drivers),
  'mixTypes', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'mix_type'),
  'plants', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'plant'),
  'transporters', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'transporter'),
  'rejectionReasons', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'rejection_reason'),
  'priorities', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'milling_priority'),
  'projectInfo', (select coalesce(json_agg(json_build_object(
      'project', name, 'company', company, 'contract', contract,
      'locationType', location_type, 'allowNamedStreet', allow_named_street) order by id), '[]'::json) from projects),
  'staff', (select coalesce(json_agg(json_build_object(
      'project', project, 'name', name, 'pin', pin, 'phone', phone,
      'function', function, 'milling', milling) order by id), '[]'::json) from staff),
  'sites', (select coalesce(json_agg(json_build_object(
      'project', project, 'site', site) order by id), '[]'::json) from sites),
  'streets', (select coalesce(json_agg(json_build_object(
      'project', project, 'site', site, 'street', street) order by id), '[]'::json) from streets),
  'workOrders', (select coalesce(json_agg(json_build_object(
      'project', project, 'site', site, 'block', block, 'street', street,
      'discipline', discipline, 'wo', wo, 'status', status,
      'description', description) order by id), '[]'::json) from work_orders),
  'suppliers', (select coalesce(json_agg(name order by id), '[]'::json) from suppliers),
  'subcontractors', (select coalesce(json_agg(name order by id), '[]'::json) from subcontractors),
  'catalog', (select coalesce(json_agg(json_build_object(
      'category', category, 'item', item, 'unit', unit) order by id), '[]'::json) from material_catalog),
  'managers', (select coalesce(json_agg(json_build_object(
      'name', name, 'pin', pin, 'role', role, 'projects', projects) order by id), '[]'::json) from milling_managers),
  'machines', (select coalesce(json_agg(json_build_object(
      'id', code, 'name', name, 'width', width) order by id), '[]'::json) from milling_machines)
);
$$;

-- ── RPC: dash_payload() ──────────────────────────────────────────────
-- Slim per-row dashboard payload, same shape as Apps Script dashData_():
-- dispatch {d,c,p,s,w,m,pl,n,t,st,tr,dw,dt} + materials rows. The client
-- filters/aggregates locally, so time-filter clicks never re-fetch.
create or replace function dash_payload() returns json
language sql stable as $$
with rec as (
  select distinct on (note) note, decision, weight_arrival, temp_arrival
  from receipts order by note, ts desc          -- last receipt per note wins
),
disp as (
  select
    to_char(d.ts at time zone 'Asia/Kuwait', 'YYYY-MM-DD') as dte,
    trim(d.company) as c, d.project as p, d.site as s, d.work_order as w,
    d.mix as m, d.plant as pl, d.naqel as n,
    round(coalesce(d.weight, 0), 2) as t,
    case when r.note is null then 0
         when position('رفض' in coalesce(r.decision, '')) > 0 then 2
         else 1 end as st,
    case when coalesce(r.weight_arrival, 0) > 0 then round(r.weight_arrival, 2) else 0 end as tr,
    case when coalesce(r.weight_arrival, 0) > 0
         then round(r.weight_arrival - coalesce(d.weight, 0), 2) end as dw,
    case when coalesce(r.temp_arrival, 0) > 0 and coalesce(d.temp_dispatch, 0) > 0
         then round(r.temp_arrival - d.temp_dispatch, 1) end as dt,
    d.ts
  from dispatch_loads d left join rec r using (note)
)
select json_build_object(
  'generatedAt', now(),
  'copri', 'كوبري',
  'dispatch', (select coalesce(json_agg(json_build_object(
      'd', dte, 'c', c, 'p', p, 's', s, 'w', w, 'm', m, 'pl', pl, 'n', n,
      't', t, 'st', st, 'tr', tr, 'dw', dw, 'dt', dt) order by ts), '[]'::json) from disp),
  'materials', (select coalesce(json_agg(json_build_object(
      'd', to_char(ts at time zone 'Asia/Kuwait', 'YYYY-MM-DD'),
      'p', project, 's', site, 'rec', receiver, 'cat', category,
      'item', material, 'qty', coalesce(quantity, 0), 'unit', unit,
      'amt', coalesce(amount, 0), 'sup', supplier, 'sub', subcontractor) order by ts), '[]'::json)
    from material_receipts)
);
$$;
