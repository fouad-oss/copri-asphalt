-- ════════════════════════════════════════════════════════════════════
-- 0033 — QUANTITIES MANAGEMENT module, phase 1 (كشف التكلفة / أوامر
-- العمل / طلبات التدقيق). Brief: QUANTITIES_MODULE_BRIEF.md.
--
-- The QA's Excel workflow, restructured around ONE live kashef record
-- with three quantity tiers per line:
--   kashef qty   (ministry-facing, editable, every change logged)
--   allocated    (split across subcontractors; Σ > kashef qty ⇒ WARN)
--   executed     (sum of طلب تدقيق lines per sub; > allocated ⇒ WARN)
-- Warnings never block — work runs ahead of paper. History is an
-- append-only changelog (entity, field/line, old → new, actor, time);
-- no version forks.
--
-- Access posture (unlike the v1 anon-read tables): the module is
-- Supabase-Auth-only. Every qm_* table is RLS `to authenticated` for
-- select; ALL writes go through SECURITY DEFINER qm_* RPCs that refuse
-- without auth.uid(). Anon/PIN sessions see nothing.
--
-- Historical backfill is designed in NOW (brief §6): kashef_date /
-- wo_date are explicit business dates distinct from created_at; kashefs
-- can be created directly in 'wo' status with their numbers; a طلب
-- تدقيق can be marked `opening` (opening executed balance); numbering
-- is client-suggested, DB-unique, tolerant of imported values.
--
-- Companion: 0034_qm_bop_seed.sql seeds the Hawalli contract-9 BOP
-- (1,309 items parsed from جدول الاسعار - حولي). Paste 0033 then 0034.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Contracts ─────────────────────────────────────────────────────
-- `code` is the stable machine key (seed references it); contract_no is
-- the display number as the ministry writes it.
create table qm_contracts (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  contract_no  text not null,
  name         text not null,
  contractor   text not null default '',
  pct          numeric not null default 0 check (pct >= 0 and pct <= 100),
  created_at   timestamptz not null default now()
);

insert into qm_contracts (code, contract_no, name, contractor, pct) values
  ('HAW9', 'ق ص / ط ش /  9',
   'اعمال الصيانة الجذرية لاعمال الطرق في محافظة حولي - النطاق الأول',
   'شركة كوبري للمشاريع الإنشائية', 9.00);

-- ── 2. Bill of Prices ────────────────────────────────────────────────
-- bab and band are SEPARATE integers — the composite id string is never
-- a key (the source files are bidi-inconsistent about segment order).
-- suffix = the Arabic sub-item letter (ا/ب/ج/د/ه…), nullable.
-- source_note carries the importer's positional-correction note where a
-- source typo was resolved (surfaced in the validation report).
create table qm_bop_items (
  id           bigint generated always as identity primary key,
  contract_id  bigint not null references qm_contracts(id),
  bab          int  not null check (bab >= 1),
  band         int  not null check (band >= 1),
  suffix       text,
  description  text not null,
  unit         text not null default '',
  rate         numeric not null check (rate >= 0),
  source_note  text,
  created_at   timestamptz not null default now()
);
create unique index qm_bop_items_key
  on qm_bop_items (contract_id, bab, band, coalesce(suffix, ''));
create index qm_bop_items_by_bab on qm_bop_items (contract_id, bab, band);

-- ── 3. Subcontractors = pipeline vendor master + a module flag ───────
-- The active set is 8–9 vendors; pickers show ONLY flagged rows. Staff
-- manage the flag in the Supabase Table Editor (vendors is already the
-- staff-editable master).
alter table vendors add column if not exists qm_subcontractor boolean not null default false;

-- ── 4. Kashefs (كشف تكلفة تقديري → أمر عمل) ──────────────────────────
-- ONE live record per kashef; status flip kashef→wo is the ministry
-- approval (wo_no manual). Location model drives the طلب تدقيق location
-- field: block ⇒ street_no required on entries; street ⇒ inherited
-- read-only; misc (متفرقات) ⇒ none.
create table qm_kashefs (
  id           bigint generated always as identity primary key,
  contract_id  bigint not null references qm_contracts(id),
  kashef_no    int  not null check (kashef_no >= 1),
  area         text not null default '',            -- سلوى / بيان / مشرف…
  loc_type     text not null check (loc_type in ('block','street','misc')),
  block_no     text not null default '',            -- block: قطعة رقم
  street_name  text not null default '',            -- street: الشارع الرئيسي
  work_type    text not null default '',            -- أمطار / أعمال مدنية…
  status       text not null default 'kashef' check (status in ('kashef','wo')),
  wo_no        text not null default '',
  wo_date      date,                                -- ministry approval date (historical ok)
  kashef_date  date not null default (now() at time zone 'Asia/Kuwait')::date,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  unique (contract_id, kashef_no),
  constraint wo_needs_number check (status = 'kashef' or wo_no <> '')
);

create table qm_kashef_lines (
  id           bigint generated always as identity primary key,
  kashef_id    bigint not null references qm_kashefs(id),
  bop_item_id  bigint not null references qm_bop_items(id),
  qty          numeric not null check (qty >= 0),
  unique (kashef_id, bop_item_id)
);
create index qm_kashef_lines_by_kashef on qm_kashef_lines (kashef_id);

-- ── 5. Allocations (the color-sheet replacement) ─────────────────────
create table qm_allocations (
  id              bigint generated always as identity primary key,
  kashef_line_id  bigint not null references qm_kashef_lines(id),
  vendor_id       bigint not null references vendors(id),
  qty             numeric not null check (qty > 0),
  unique (kashef_line_id, vendor_id)
);
create index qm_allocations_by_vendor on qm_allocations (vendor_id);

-- ── 6. طلبات التدقيق ─────────────────────────────────────────────────
-- One subcontractor + one date per document; multiple lines. Lines may
-- reference bop items OUTSIDE the kashef's lines (allowed + flagged).
-- `opening` marks a bulk-loaded opening executed balance (backfill).
create table qm_tadqiq (
  id           bigint generated always as identity primary key,
  kashef_id    bigint not null references qm_kashefs(id),
  vendor_id    bigint not null references vendors(id),
  tadqiq_date  date not null,
  street_no    text not null default '',   -- required when kashef loc_type='block'
  note         text not null default '',
  opening      boolean not null default false,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index qm_tadqiq_by_kashef on qm_tadqiq (kashef_id, vendor_id);

create table qm_tadqiq_lines (
  id               bigint generated always as identity primary key,
  tadqiq_id        bigint not null references qm_tadqiq(id) on delete cascade,
  bop_item_id      bigint not null references qm_bop_items(id),
  qty              numeric not null check (qty > 0),
  out_of_kashef    boolean not null default false,  -- item not among the kashef's lines at entry time
  over_allocation  boolean not null default false   -- pushed executed past this sub's allocation at entry time
);
create index qm_tadqiq_lines_by_tadqiq on qm_tadqiq_lines (tadqiq_id);
create index qm_tadqiq_lines_by_item   on qm_tadqiq_lines (bop_item_id);

-- ── 7. Changelog (append-only; the ONLY history mechanism) ───────────
create table qm_changelog (
  id           bigint generated always as identity primary key,
  entity       text not null,       -- 'kashef' | 'kashef_line' | 'allocation' | 'tadqiq'
  entity_id    bigint not null,     -- the kashef id for line/alloc entries (line_ref carries the detail)
  action       text not null,       -- create | update | approve | line_add | line_qty | line_remove | alloc_set | tadqiq_create | tadqiq_delete | delete | warning
  field        text not null default '',
  line_ref     text not null default '',   -- display id 'bab/band[suffix]' (+ vendor for allocs)
  old_value    text not null default '',
  new_value    text not null default '',
  actor_id     uuid,
  actor_email  text not null default '',
  created_at   timestamptz not null default now()
);
create index qm_changelog_by_entity on qm_changelog (entity, entity_id, id);

-- ── 8. RLS: authenticated-only, reads via policy, writes via RPCs ────
do $$
declare t text;
begin
  foreach t in array array['qm_contracts','qm_bop_items','qm_kashefs','qm_kashef_lines',
                           'qm_allocations','qm_tadqiq','qm_tadqiq_lines','qm_changelog'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "auth read" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ── 9. Helpers ───────────────────────────────────────────────────────
create or replace function qm_actor_email() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select au.email from auth.users au where au.id = auth.uid()), '')
$$;

create or replace function qm_log(
  p_entity text, p_entity_id bigint, p_action text,
  p_field text default '', p_line_ref text default '',
  p_old text default '', p_new text default ''
) returns void language sql security definer set search_path = public as $$
  insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_id, actor_email)
  values (p_entity, p_entity_id, p_action, p_field, p_line_ref, p_old, p_new, auth.uid(), qm_actor_email())
$$;

-- display id: bab/band+suffix, e.g. 6/100 or 4/17ا
create or replace function qm_item_ref(p_item_id bigint) returns text
language sql stable security definer set search_path = public as $$
  select bab || '/' || band || coalesce(suffix, '') from qm_bop_items where id = p_item_id
$$;

create or replace function qm_num(p numeric) returns text
language sql immutable as $$ select trim(trailing '.' from trim(trailing '0' from p::text)) $$;

-- ── 10. RPCs ─────────────────────────────────────────────────────────

-- Create a kashef (manual entry, Excel import, or historical backfill —
-- backfill passes status='wo' + wo_no/wo_date + a historical kashef_date).
-- p_lines: [{ "bop_item_id": n, "qty": n }, …]
create or replace function qm_kashef_create(
  p_contract_code text, p_kashef_no int, p_area text, p_loc_type text,
  p_block_no text, p_street_name text, p_work_type text,
  p_lines jsonb,
  p_kashef_date date default null,
  p_status text default 'kashef', p_wo_no text default '', p_wo_date date default null
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
                          work_type, status, wo_no, wo_date, kashef_date, created_by)
  values (v_contract.id, p_kashef_no, coalesce(p_area,''), p_loc_type,
          case when p_loc_type = 'block'  then coalesce(p_block_no,'')    else '' end,
          case when p_loc_type = 'street' then coalesce(p_street_name,'') else '' end,
          coalesce(p_work_type,''), p_status, coalesce(p_wo_no,''), p_wo_date,
          coalesce(p_kashef_date, (now() at time zone 'Asia/Kuwait')::date), auth.uid())
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
                 '', 'كشف ' || p_kashef_no || ' — ' || v_count || ' بند');
  if p_status = 'wo' then
    perform qm_log('kashef', v_id, 'approve', 'wo_no', '', '', coalesce(p_wo_no,''));
  end if;
  return json_build_object('success', true, 'id', v_id, 'lines', v_count);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'kashef_no already exists');
end $$;

-- Header edits (whitelisted fields), each change logged old → new.
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
    if v_key not in ('area','loc_type','block_no','street_name','work_type','kashef_no','kashef_date','wo_no','wo_date') then
      return json_build_object('success', false, 'error', 'field not editable: ' || v_key);
    end if;
  end loop;
  if p_fields ? 'loc_type' and p_fields->>'loc_type' not in ('block','street','misc') then
    return json_build_object('success', false, 'error', 'bad loc_type');
  end if;
  if (p_fields ? 'wo_no' or p_fields ? 'wo_date') and v_k.status <> 'wo' then
    return json_build_object('success', false, 'error', 'not a wo yet');
  end if;

  for v_key in select jsonb_object_keys(p_fields) loop
    v_new := p_fields->>v_key;
    v_old := case v_key
      when 'area' then v_k.area           when 'loc_type' then v_k.loc_type
      when 'block_no' then v_k.block_no   when 'street_name' then v_k.street_name
      when 'work_type' then v_k.work_type when 'kashef_no' then v_k.kashef_no::text
      when 'kashef_date' then v_k.kashef_date::text
      when 'wo_no' then v_k.wo_no         when 'wo_date' then coalesce(v_k.wo_date::text,'')
    end;
    if coalesce(v_old,'') is distinct from coalesce(v_new,'') then
      execute format('update qm_kashefs set %I = $1::%s where id = $2', v_key,
                     case when v_key = 'kashef_no' then 'int'
                          when v_key in ('kashef_date','wo_date') then 'date'
                          else 'text' end)
        using v_new, p_kashef_id;
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

-- Ministry approval: kashef → wo. Just a status flip + the manual WO
-- number; existing طلبات تدقيق "inherit" the number automatically
-- because it lives here, not on the entries.
create or replace function qm_kashef_approve(p_kashef_id bigint, p_wo_no text, p_wo_date date default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_k qm_kashefs;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_k.status = 'wo' then return json_build_object('success', false, 'error', 'already a wo'); end if;
  if coalesce(p_wo_no,'') = '' then return json_build_object('success', false, 'error', 'wo_no required'); end if;
  update qm_kashefs set status = 'wo', wo_no = p_wo_no, wo_date = coalesce(p_wo_date, (now() at time zone 'Asia/Kuwait')::date)
    where id = p_kashef_id;
  perform qm_log('kashef', p_kashef_id, 'approve', 'wo_no', '', '', p_wo_no);
  return json_build_object('success', true);
end $$;

-- Kashef line add / qty change / remove. p_qty null ⇒ remove (refused
-- while allocations exist — clear them first; that refusal is a data-
-- integrity rule, not a quantity warning). Qty changes always allowed,
-- warnings surfaced when the new qty drops below what's already
-- allocated.
create or replace function qm_kashef_line_set(p_kashef_id bigint, p_bop_item_id bigint, p_qty numeric)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_k qm_kashefs;
  v_line qm_kashef_lines;
  v_ref text;
  v_alloc numeric;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  v_ref := qm_item_ref(p_bop_item_id);
  if v_ref is null then return json_build_object('success', false, 'error', 'bad item'); end if;
  select * into v_line from qm_kashef_lines where kashef_id = p_kashef_id and bop_item_id = p_bop_item_id;

  if p_qty is null then                                   -- remove
    if v_line.id is null then return json_build_object('success', false, 'error', 'line not found'); end if;
    select coalesce(sum(qty),0) into v_alloc from qm_allocations where kashef_line_id = v_line.id;
    if v_alloc > 0 then
      return json_build_object('success', false, 'error', 'line has allocations');
    end if;
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

-- Allocation upsert (qty null/0 ⇒ remove). Over-allocation and
-- executed-past-allocation WARN, never block; every set is logged and
-- warnings get their own changelog entries so the paper trail shows
-- when the QA proceeded past a warning.
create or replace function qm_alloc_set(p_kashef_line_id bigint, p_vendor_id bigint, p_qty numeric)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_line qm_kashef_lines;
  v_vendor_name text;
  v_old numeric := 0;
  v_ref text;
  v_total numeric;
  v_exec numeric;
  v_warn_over boolean := false;
  v_warn_exec boolean := false;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_line from qm_kashef_lines where id = p_kashef_line_id;
  if v_line.id is null then return json_build_object('success', false, 'error', 'line not found'); end if;
  select name into v_vendor_name from vendors where id = p_vendor_id and qm_subcontractor;
  if v_vendor_name is null then return json_build_object('success', false, 'error', 'not an active subcontractor'); end if;
  v_ref := qm_item_ref(v_line.bop_item_id) || ' ← ' || v_vendor_name;
  select qty into v_old from qm_allocations where kashef_line_id = p_kashef_line_id and vendor_id = p_vendor_id;

  if p_qty is null or p_qty = 0 then
    if v_old is null then return json_build_object('success', false, 'error', 'no allocation'); end if;
    delete from qm_allocations where kashef_line_id = p_kashef_line_id and vendor_id = p_vendor_id;
    perform qm_log('allocation', v_line.kashef_id, 'alloc_set', '', v_ref, qm_num(v_old), '');
    return json_build_object('success', true, 'removed', true);
  end if;
  if p_qty < 0 then return json_build_object('success', false, 'error', 'bad qty'); end if;

  insert into qm_allocations (kashef_line_id, vendor_id, qty) values (p_kashef_line_id, p_vendor_id, p_qty)
    on conflict (kashef_line_id, vendor_id) do update set qty = excluded.qty;
  if v_old is distinct from p_qty then
    perform qm_log('allocation', v_line.kashef_id, 'alloc_set', '', v_ref,
                   coalesce(qm_num(v_old),''), qm_num(p_qty));
  end if;

  select coalesce(sum(qty),0) into v_total from qm_allocations where kashef_line_id = p_kashef_line_id;
  if v_total > v_line.qty then
    v_warn_over := true;
    perform qm_log('allocation', v_line.kashef_id, 'warning', 'over_allocation', v_ref,
                   qm_num(v_line.qty), qm_num(v_total));
  end if;
  select coalesce(sum(tl.qty),0) into v_exec
    from qm_tadqiq_lines tl join qm_tadqiq t on t.id = tl.tadqiq_id
    where t.kashef_id = v_line.kashef_id and t.vendor_id = p_vendor_id
      and tl.bop_item_id = v_line.bop_item_id;
  if v_exec > p_qty then v_warn_exec := true; end if;

  return json_build_object('success', true,
    'warnOverAllocated', v_warn_over, 'totalAllocated', v_total, 'kashefQty', v_line.qty,
    'warnExecutedOver', v_warn_exec, 'executed', v_exec);
end $$;

-- طلب تدقيق entry. One sub + one date, many lines. Lines outside the
-- kashef (or the sub's allocation) are ALLOWED with stored flags +
-- changelog warnings. street_no is required for block kashefs, ignored
-- for street kashefs (location inherited), refused for متفرقات.
-- p_lines: [{ "bop_item_id": n, "qty": n }, …]
create or replace function qm_tadqiq_create(
  p_kashef_id bigint, p_vendor_id bigint, p_date date,
  p_street_no text, p_note text, p_lines jsonb, p_opening boolean default false
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

  insert into qm_tadqiq (kashef_id, vendor_id, tadqiq_date, street_no, note, opening, created_by)
  values (p_kashef_id, p_vendor_id, p_date,
          case when v_k.loc_type = 'block' then p_street_no else '' end,
          coalesce(p_note,''), coalesce(p_opening,false), auth.uid())
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

  perform qm_log('tadqiq', p_kashef_id, 'tadqiq_create', '', v_vendor_name || ' — ' || p_date,
                 '', v_count || ' بند' || case when coalesce(p_opening,false) then ' (رصيد افتتاحي)' else '' end);
  return json_build_object('success', true, 'id', v_id, 'lines', v_count, 'warnings', v_warnings);
end $$;

-- Delete a طلب تدقيق (corrections). Snapshot goes into the changelog.
create or replace function qm_tadqiq_delete(p_tadqiq_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_t qm_tadqiq;
  v_snapshot text;
  v_vendor_name text;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_t from qm_tadqiq where id = p_tadqiq_id;
  if v_t.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  select name into v_vendor_name from vendors where id = v_t.vendor_id;
  select string_agg(qm_item_ref(bop_item_id) || '×' || qm_num(qty), '، ') into v_snapshot
    from qm_tadqiq_lines where tadqiq_id = p_tadqiq_id;
  delete from qm_tadqiq where id = p_tadqiq_id;   -- lines cascade
  perform qm_log('tadqiq', v_t.kashef_id, 'tadqiq_delete', '',
                 coalesce(v_vendor_name,'') || ' — ' || v_t.tadqiq_date,
                 coalesce(v_snapshot,''), '');
  return json_build_object('success', true);
end $$;

-- Delete a kashef — only while nothing executed against it.
create or replace function qm_kashef_delete(p_kashef_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare v_k qm_kashefs;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_k from qm_kashefs where id = p_kashef_id;
  if v_k.id is null then return json_build_object('success', false, 'error', 'not found'); end if;
  if exists (select 1 from qm_tadqiq where kashef_id = p_kashef_id) then
    return json_build_object('success', false, 'error', 'kashef has tadqiq entries');
  end if;
  delete from qm_allocations where kashef_line_id in (select id from qm_kashef_lines where kashef_id = p_kashef_id);
  delete from qm_kashef_lines where kashef_id = p_kashef_id;
  delete from qm_kashefs where id = p_kashef_id;
  perform qm_log('kashef', p_kashef_id, 'delete', '', '', 'كشف ' || v_k.kashef_no, '');
  return json_build_object('success', true);
end $$;

-- ── 11. Views (security_invoker ⇒ RLS of the caller applies) ─────────
-- List screen: totals + progress in one query.
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
       coalesce(e.tadqiq_count, 0)            as tadqiq_count
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

-- Detail screen: per-line tiers (kashef / allocated / executed).
create or replace view qm_line_status
with (security_invoker = true) as
select kl.id as kashef_line_id, kl.kashef_id, kl.bop_item_id, kl.qty,
       bi.bab, bi.band, bi.suffix, bi.description, bi.unit, bi.rate,
       round(kl.qty * bi.rate, 3) as line_total,
       coalesce(al.total, 0) as allocated_total,
       coalesce(ex.total, 0) as executed_total
from qm_kashef_lines kl
join qm_bop_items bi on bi.id = kl.bop_item_id
left join (
  select kashef_line_id, sum(qty) as total from qm_allocations group by 1
) al on al.kashef_line_id = kl.id
left join (
  select t.kashef_id, tl.bop_item_id, sum(tl.qty) as total
  from qm_tadqiq_lines tl join qm_tadqiq t on t.id = tl.tadqiq_id
  group by 1, 2
) ex on ex.kashef_id = kl.kashef_id and ex.bop_item_id = kl.bop_item_id;

-- Per-line per-sub breakdown (the التوزيع expander + the tadqiq balance
-- box + the per-sub WO printout all read this).
create or replace view qm_sub_line_status
with (security_invoker = true) as
select kl.kashef_id, kl.id as kashef_line_id, kl.bop_item_id,
       v.id as vendor_id, v.name as vendor_name,
       bi.bab, bi.band, bi.suffix, bi.description, bi.unit, bi.rate,
       kl.qty as kashef_qty,
       coalesce(al.qty, 0) as allocated,
       coalesce(ex.total, 0) as executed
from qm_kashef_lines kl
join qm_bop_items bi on bi.id = kl.bop_item_id
cross join (select id, name from vendors where qm_subcontractor) v
left join qm_allocations al on al.kashef_line_id = kl.id and al.vendor_id = v.id
left join (
  select t.kashef_id, t.vendor_id, tl.bop_item_id, sum(tl.qty) as total
  from qm_tadqiq_lines tl join qm_tadqiq t on t.id = tl.tadqiq_id
  group by 1, 2, 3
) ex on ex.kashef_id = kl.kashef_id and ex.vendor_id = v.id and ex.bop_item_id = kl.bop_item_id
where al.qty is not null or coalesce(ex.total, 0) > 0;

-- Views are authenticated-only (same posture as the tables).
revoke all on qm_kashef_overview, qm_line_status, qm_sub_line_status from anon;
grant select on qm_kashef_overview, qm_line_status, qm_sub_line_status to authenticated;

-- ── 12. Function grants: authenticated only ──────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'qm_kashef_create(text,int,text,text,text,text,text,jsonb,date,text,text,date)',
    'qm_kashef_update(bigint,jsonb)',
    'qm_kashef_approve(bigint,text,date)',
    'qm_kashef_line_set(bigint,bigint,numeric)',
    'qm_alloc_set(bigint,bigint,numeric)',
    'qm_tadqiq_create(bigint,bigint,date,text,text,jsonb,boolean)',
    'qm_tadqiq_delete(bigint)',
    'qm_kashef_delete(bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- helpers stay internal
  revoke all on function qm_actor_email() from public, anon, authenticated;
  revoke all on function qm_log(text,bigint,text,text,text,text,text) from public, anon, authenticated;
  revoke all on function qm_item_ref(bigint) from public, anon, authenticated;
end $$;
