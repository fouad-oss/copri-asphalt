-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0002: structural hardening (post-audit, 2026-07-11)
-- ═══════════════════════════════════════════════════════════════════
-- Fixes from the database audit:
--   • companies/projects unified with surrogate ids (was 3 name-joined
--     tables mirroring the old Sheet files)
--   • staff/sites/streets/work_orders reference projects/sites by id +
--     FK — renames now cascade through ref_payload() automatically
--   • log hygiene: Green Line historical spelling, orphan receipts,
--     double-tap receipt dupes; receipts.note unique + FK to dispatch
--   • vocabulary CHECK constraints on status/decision/loc_type
--   • atomic SECURITY DEFINER write RPCs (confirm_receipt, milling_*)
--     replacing client-side read-modify-write; 0003 revokes the broad
--     anon policies once the frontend uses these
--   • created_at/updated_at on all reference tables
--   • storage bucket size/mime limits
-- Non-breaking: ref_payload() output shape is unchanged and the old
-- write policies stay until 0003, so the live frontend keeps working.

-- ── 1. Companies + unified projects ──────────────────────────────────
create table companies (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  is_copri boolean not null default false
);
insert into companies (name, is_copri)
  select company, is_copri from clients order by id;

alter table projects add column company_id bigint references companies(id);
update projects p set company_id = c.id from companies c where c.name = p.company;

-- Fold client projects into the one projects table
insert into projects (name, company_id, contract, location_type, allow_named_street)
  select cp.project, c.id, cp.contract, cp.location_type, cp.allow_named_street
  from client_projects cp join companies c on c.name = cp.company
  order by cp.id;

alter table projects alter column company_id set not null;
alter table projects drop column company;
drop table client_projects;
drop table clients;

alter table companies enable row level security;
create policy "anon read" on companies for select to anon, authenticated using (true);

-- ── 2. Reference tables reference projects/sites by id ───────────────
alter table staff add column project_id bigint references projects(id);
update staff s set project_id = p.id from projects p where p.name = s.project;
alter table staff alter column project_id set not null;

alter table sites add column project_id bigint references projects(id);
update sites s set project_id = p.id from projects p where p.name = s.project;
alter table sites alter column project_id set not null;

alter table streets add column site_id bigint references sites(id);
update streets st set site_id = si.id from sites si
  where si.project = st.project and si.site = st.site;
alter table streets alter column site_id set not null;

alter table work_orders add column project_id bigint references projects(id),
                        add column site_id bigint references sites(id);
update work_orders w set project_id = p.id from projects p where p.name = w.project;
update work_orders w set site_id = si.id from sites si
  where si.project = w.project and si.site = w.site and w.site <> '';
alter table work_orders alter column project_id set not null;
-- site_id stays NULL for site-less/general orders

-- Drop the name-text columns (their old unique constraints go with them)
alter table staff drop column project;
alter table sites drop column project;
alter table streets drop column project, drop column site;
alter table work_orders drop column project, drop column site;

alter table staff   add constraint staff_project_name_key unique (project_id, name);
alter table sites   add constraint sites_project_site_key unique (project_id, site);
alter table streets add constraint streets_site_street_key unique (site_id, street);
create index work_orders_by_project on work_orders (project_id, site_id);
create unique index work_orders_row_key on work_orders
  (project_id, wo, discipline, coalesce(site_id, 0), block, street);

-- ── 3. created_at / updated_at on every reference table ──────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','app_settings','clerks','drivers','list_options','projects',
    'staff','sites','streets','work_orders','suppliers','subcontractors',
    'material_catalog','milling_managers','milling_machines'
  ] loop
    execute format('alter table %I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists trg_updated on %I', t);
    execute format('create trigger trg_updated before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ── 4. ref_payload(): same output shape, id-joined names ─────────────
create or replace function ref_payload() returns json
language sql stable as $$
select json_build_object(
  'version', '2',
  'settings', (select coalesce(json_object_agg(key, value), '{}'::json) from app_settings),
  'clients', (select coalesce(json_agg(json_build_object(
      'company', name, 'isCopri', is_copri) order by id), '[]'::json) from companies),
  'clientProjects', (select coalesce(json_agg(json_build_object(
      'company', c.name, 'project', p.name, 'contract', p.contract,
      'locationType', p.location_type, 'allowNamedStreet', p.allow_named_street) order by p.id), '[]'::json)
    from projects p join companies c on c.id = p.company_id where not c.is_copri),
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
      'project', p.name, 'company', c.name, 'contract', p.contract,
      'locationType', p.location_type, 'allowNamedStreet', p.allow_named_street) order by p.id), '[]'::json)
    from projects p join companies c on c.id = p.company_id where c.is_copri),
  'staff', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'name', s.name, 'pin', s.pin, 'phone', s.phone,
      'function', s.function, 'milling', s.milling) order by s.id), '[]'::json)
    from staff s join projects p on p.id = s.project_id),
  'sites', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'site', s.site) order by s.id), '[]'::json)
    from sites s join projects p on p.id = s.project_id),
  'streets', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'site', si.site, 'street', st.street) order by st.id), '[]'::json)
    from streets st join sites si on si.id = st.site_id join projects p on p.id = si.project_id),
  'workOrders', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'site', coalesce(si.site, ''), 'block', w.block,
      'street', w.street, 'discipline', w.discipline, 'wo', w.wo,
      'status', w.status, 'description', w.description) order by w.id), '[]'::json)
    from work_orders w join projects p on p.id = w.project_id
    left join sites si on si.id = w.site_id),
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

-- ── 5. Log hygiene + integrity ───────────────────────────────────────
-- Green Line historical spelling → canonical (matches companies row)
update dispatch_loads set company = 'المد الأخضر — Green Line'
  where company = 'المدى الأخضر — Green Line';

-- Orphan receipts (artifacts of the June 00-suffix note cleanup)
delete from receipts where note in ('12598300', '12611600');

-- Double-tap duplicates: keep the latest receipt per note
delete from receipts a using receipts b
  where a.note = b.note and a.ts < b.ts;

-- One receipt per note, and every receipt belongs to a real dispatch
drop index if exists receipts_note;
create unique index receipts_note_key on receipts (note);
alter table receipts add constraint receipts_note_fkey
  foreign key (note) references dispatch_loads(note);

-- Vocabulary locks (free text → constrained values)
alter table dispatch_loads add constraint dispatch_status_chk
  check (status in ('في الطريق', 'مقبول', 'مرفوض', 'لا ينطبق'));
alter table dispatch_loads add constraint dispatch_loc_type_chk
  check (loc_type in ('قطعة / شارع', 'نطاق كيلومتر', 'اسم الشارع'));
alter table receipts add constraint receipts_decision_chk
  check (decision in ('مقبول', 'مرفوض'));
alter table milling_programs add constraint milling_status_chk
  check (status in ('بانتظار الموافقة', 'مرفوض', 'مراجعة', 'معتمد', 'مجدول', 'قيد التنفيذ', 'مكتمل'));

-- Engineer-screen indexes
create index receipts_by_engineer on receipts (engineer, ts desc);
create index dispatch_by_notify on dispatch_loads (notify_engineer)
  where notify_engineer <> '';

-- ── 6. Atomic write RPCs (SECURITY DEFINER) ──────────────────────────
-- These replace the frontend's insert-then-patch and read-modify-write
-- sequences. 0003 drops the broad anon write policies they supersede.

-- Receipt confirmation: insert + dispatch status update, atomic.
create or replace function confirm_receipt(
  p_note text, p_engineer text, p_work_order text, p_decision text,
  p_weight_arrival numeric, p_temp_arrival numeric, p_remarks text
) returns json
language plpgsql security definer set search_path = public as $$
begin
  insert into receipts (note, work_order, engineer, decision, weight_arrival, temp_arrival, remarks)
  values (p_note, coalesce(p_work_order, ''), coalesce(p_engineer, ''), p_decision,
          p_weight_arrival, p_temp_arrival, coalesce(p_remarks, ''));
  update dispatch_loads set status = p_decision where note = p_note;
  return json_build_object('success', true);
exception
  when unique_violation then
    return json_build_object('success', false, 'duplicate', true);
  when foreign_key_violation then
    return json_build_object('success', false, 'error', 'no dispatch with this note');
  when check_violation then
    return json_build_object('success', false, 'error', 'invalid decision value');
end $$;

-- Milling: submit / decide / revise with a server-side audit trail.
create or replace function milling_submit(
  p_program_id text, p_project text, p_work_order text, p_site text,
  p_block text, p_street text, p_depth text, p_item_code text,
  p_area numeric, p_machines int, p_requested_date date,
  p_priority text, p_engineer text, p_notes text
) returns json
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into milling_programs (program_id, project, work_order, site, block, street,
      depth, item_code, area, machines, requested_date, priority, engineer,
      submitted_at, status, eng_notes, audit)
  values (p_program_id, coalesce(p_project, ''), coalesce(p_work_order, ''),
      coalesce(p_site, ''), coalesce(p_block, ''), coalesce(p_street, ''),
      coalesce(p_depth, ''), coalesce(p_item_code, ''), p_area, p_machines,
      p_requested_date, coalesce(p_priority, ''), coalesce(p_engineer, ''),
      now(), 'بانتظار الموافقة', coalesce(p_notes, ''),
      jsonb_build_array(jsonb_build_object(
        'action', 'submitted', 'by', coalesce(p_engineer, ''), 'role', 'engineer', 'ts', now())))
  on conflict (program_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('success', false, 'duplicate', true); end if;
  return json_build_object('success', true, 'programId', p_program_id);
end $$;

create or replace function milling_decide(
  p_program_id text, p_decision text, p_by text, p_note text, p_role text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  cur milling_programs%rowtype;
  v_status text; v_action text; v_role text := coalesce(p_role, '');
  ev jsonb;
begin
  select * into cur from milling_programs where program_id = p_program_id for update;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;

  if p_decision = 'approve' then
    v_status := 'معتمد'; v_action := 'approved'; v_role := 'pm';
    update milling_programs set status = v_status, pm_name = coalesce(p_by, ''),
      pm_decision = v_status, pm_note = coalesce(p_note, ''), pm_decided_at = now()
      where program_id = p_program_id;
  elsif p_decision = 'reject' then
    if coalesce(p_note, '') = '' then return json_build_object('success', false, 'error', 'note required'); end if;
    v_status := 'مرفوض'; v_action := 'rejected'; v_role := 'pm';
    update milling_programs set status = v_status, pm_name = coalesce(p_by, ''),
      pm_decision = v_status, pm_note = p_note, pm_decided_at = now()
      where program_id = p_program_id;
  elsif p_decision = 'schedule' then
    v_status := 'مجدول'; v_action := 'scheduled'; v_role := 'marco';
    update milling_programs set status = v_status, marco_scheduled_at = now(),
      marco_note = coalesce(p_note, '') where program_id = p_program_id;
  elsif p_decision = 'start' then
    v_status := 'قيد التنفيذ'; v_action := 'started'; v_role := 'marco';
    update milling_programs set status = v_status where program_id = p_program_id;
  elsif p_decision = 'complete' then
    v_status := 'مكتمل'; v_action := 'completed';
    update milling_programs set status = v_status where program_id = p_program_id;
  else
    return json_build_object('success', false, 'error', 'unknown decision');
  end if;

  ev := jsonb_build_object('action', v_action, 'by', coalesce(p_by, ''), 'role', v_role, 'ts', now());
  if coalesce(p_note, '') <> '' then ev := ev || jsonb_build_object('note', p_note); end if;
  update milling_programs set audit = audit || ev where program_id = p_program_id;
  return json_build_object('success', true, 'status', v_status);
end $$;

create or replace function milling_revise(
  p_program_id text, p_project text, p_work_order text, p_site text,
  p_block text, p_street text, p_depth text, p_item_code text,
  p_area numeric, p_machines int, p_requested_date date,
  p_priority text, p_engineer text, p_notes text
) returns json
language plpgsql security definer set search_path = public as $$
declare cur milling_programs%rowtype;
begin
  select * into cur from milling_programs where program_id = p_program_id for update;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if cur.status <> 'مرفوض' then return json_build_object('success', false, 'error', 'not revisable'); end if;
  update milling_programs set
    project = coalesce(p_project, ''), work_order = coalesce(p_work_order, ''),
    site = coalesce(p_site, ''), block = coalesce(p_block, ''), street = coalesce(p_street, ''),
    depth = coalesce(p_depth, ''), item_code = coalesce(p_item_code, ''),
    area = p_area, machines = p_machines, requested_date = p_requested_date,
    priority = coalesce(p_priority, ''), eng_notes = coalesce(p_notes, ''),
    status = 'مراجعة',
    audit = audit || jsonb_build_object('action', 'revised',
      'by', coalesce(nullif(p_engineer, ''), cur.engineer), 'role', 'engineer', 'ts', now())
    where program_id = p_program_id;
  return json_build_object('success', true);
end $$;

grant execute on function confirm_receipt(text, text, text, text, numeric, numeric, text) to anon, authenticated;
grant execute on function milling_submit(text, text, text, text, text, text, text, text, numeric, int, date, text, text, text) to anon, authenticated;
grant execute on function milling_decide(text, text, text, text, text) to anon, authenticated;
grant execute on function milling_revise(text, text, text, text, text, text, text, text, numeric, int, date, text, text, text) to anon, authenticated;

-- ── 7. Storage bucket limits (5 MB, images only) ─────────────────────
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'material-receipts';
