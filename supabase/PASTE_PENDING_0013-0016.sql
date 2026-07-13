-- ONE-PASTE BUNDLE: pending migrations 0013 + 0014 + 0015 + 0016
-- (commitment pipeline: masters/requests -> capture -> recharge -> export)
-- Identical to the four numbered files, concatenated in order.
-- Run once in the Supabase SQL editor. Delete this file after applying.


-- >>>>>>>> 0013_commitment_pipeline.sql >>>>>>>>

-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0013: commitment-control pipeline (phase 1: masters,
-- requests, numbering, approval RPCs)
-- ═══════════════════════════════════════════════════════════════════
-- New system of engagement for spend commitments (brief: CLAUDE_CODE_
-- BRIEF_commitment_pipeline.md). Every commitment (work order to a
-- subcontractor, LPO to a supplier, contract) is born here as a numbered
-- RF-* request, approved into a WO-/LPO-/CON- commitment, and later
-- exported to SpectroNova as coded batches.
--
-- NAMING: the existing work_orders table is the MINISTRY's orders
-- (client-side revenue, feeds the dispatch auto-fill). The pipeline's
-- WO- series is COST commitments to subcontractors — deliberately kept
-- in separate tables (commitment_requests / commitments), never joined
-- with work_orders.
--
-- Open inputs (14 July finance meeting / SpectroNova docs) are CONFIG,
-- not constants: approval_rules rows, pipeline_settings keys, blanket
-- ceilings, division cost-center names — all editable in the Table
-- Editor without a deploy.
--
-- Safe to run before the frontend deploys (pure addition).

-- ── 1. Canonical cost centers ────────────────────────────────────────
-- Data rule #1: cost center is a foreign key, never text. Division
-- codes from the July 2026 ERP audit; names are left blank pending the
-- 14 July meeting — fill them in the Table Editor (the UI shows the
-- code while the name is empty). Projects get no spectronova_code until
-- finance creates them in the ERP (nullable by design).
create table cost_centers (
  id               bigint generated always as identity primary key,
  code             text not null unique,          -- canonical internal code
  name_ar          text not null default '',
  name_en          text not null default '',
  kind             text not null check (kind in ('division','project')),
  project_id       bigint references projects(id),-- app project, when kind='project'
  spectronova_code text,                          -- null until finance creates it
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_updated before update on cost_centers
  for each row execute function set_updated_at();

insert into cost_centers (code, name_ar, name_en, kind) values
  ('5105', '', '', 'division'),
  ('5205', '', '', 'division'),
  ('5305', '', '', 'division'),
  ('5405', '', '', 'division'),
  ('5505', '', '', 'division');

insert into cost_centers (code, name_ar, name_en, kind, project_id) values
  ('363', 'طريق 30 و40 السريع', '30 & 40 Expressway', 'project',
   (select id from projects where name = 'كوبري — الطرق السريعة')),
  ('364', 'صيانة محافظة حولي', 'Hawalli Governorate', 'project',
   (select id from projects where name = 'كوبري — صيانة حولي'));

-- ── 2. Canonical vendors ─────────────────────────────────────────────
-- Data rule #2: one vendor table, normalized-name unique. Seeded from
-- the app's live suppliers/subcontractors reference tables plus the
-- internal profit centers (plant/milling/garage sell to projects via
-- RF-WO). The 1,979-row SpectroNova contact export is cleaned and
-- imported later — the mapping table below tolerates one-to-many
-- contact ids during that cleanup (each extra id is a flagged dupe).
create or replace function vendor_norm(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]؀-ۿ]+', ' ', 'g'))
$$;

create table vendors (
  id         bigint generated always as identity primary key,
  name       text not null,
  kind       text not null check (kind in ('supplier','subcontractor','internal','other')),
  internal   boolean not null default false,     -- plant / milling / garage
  active     boolean not null default true,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendors_norm_key on vendors (vendor_norm(name));
create trigger trg_updated before update on vendors
  for each row execute function set_updated_at();

-- SpectroNova contact mapping (one-to-many tolerated during cleanup)
create table vendor_spectronova_ids (
  vendor_id  bigint not null references vendors(id),
  contact_id text not null,
  flagged    boolean not null default false,     -- true = probable ERP duplicate
  primary key (vendor_id, contact_id)
);

insert into vendors (name, kind)
  select name, 'supplier' from suppliers order by id
  on conflict do nothing;
insert into vendors (name, kind)
  select name, 'subcontractor' from subcontractors order by id
  on conflict do nothing;
insert into vendors (name, kind, internal) values
  ('كوبري — مصنع الأسفلت', 'internal', true),
  ('كوبري — القشط',        'internal', true),
  ('كوبري — الكراج',       'internal', true)
  on conflict do nothing;

-- ── 3. Pipeline users (interim PIN auth, blueprint_reporters pattern) ─
-- NO read policy: PINs are never readable from the client; login goes
-- through pipeline_user_check(). Roles: requester raises RF-*; approver
-- works the head-office queue. cost_center_id = the requester's default.
create table pipeline_users (
  id             bigint generated always as identity primary key,
  name           text not null unique,
  pin            text not null,
  requester      boolean not null default true,
  approver       boolean not null default false,
  cost_center_id bigint references cost_centers(id),
  active         boolean not null default true
);
-- Seed: Fouad as requester + approver. PIN = his engineer PIN — change
-- both in the Table Editor when the real approver list lands (14 July).
insert into pipeline_users (name, pin, requester, approver)
  values ('فؤاد الزغبي', '7764', true, true);

-- ── 4. Config: routing rules + settings ──────────────────────────────
-- Thresholds are TBD at the 14 July meeting → threshold stays null
-- (rule matches nothing) until finance fills it in.
create table approval_rules (
  id        bigint generated always as identity primary key,
  rule      text not null unique check (rule in
            ('new_vendor','new_subcontract','value_threshold','call_off_within_blanket')),
  route     text not null check (route in ('head_office','auto')),
  threshold numeric,                              -- value_threshold only
  active    boolean not null default true,
  notes     text not null default ''
);
insert into approval_rules (rule, route, threshold, notes) values
  ('new_vendor',              'head_office', null, 'مورد بلا التزامات سابقة'),
  ('new_subcontract',         'head_office', null, 'أمر عمل RF-WO جديد'),
  ('value_threshold',         'head_office', null, 'الحد يُعتمد في اجتماع 14 يوليو'),
  ('call_off_within_blanket', 'auto',        null, 'سحب ضمن سقف وصلاحية LPO مظلة');

create table pipeline_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

-- Blanket categories join the shared pick-list table
alter table list_options drop constraint list_options_kind_check;
alter table list_options add constraint list_options_kind_check check (kind in
  ('mix_type','plant','transporter','rejection_reason','milling_priority','blanket_category'));
insert into list_options (kind, value, sort_order) values
  ('blanket_category', 'ديزل', 1),
  ('blanket_category', 'بيتومين', 2),
  ('blanket_category', 'ركام', 3)
  on conflict do nothing;

-- ── 5. Numbering: one counters table for every series ────────────────
-- RF-{TYPE}-{YYYY}-{seq} for requests, {WO|LPO|CON}-{YYYY}-{seq} for
-- commitments. Row-locked upsert → gapless within a year, race-safe.
create table pipeline_counters (
  series text not null,
  year   int  not null,
  last   int  not null default 0,
  primary key (series, year)
);

create or replace function next_pipeline_no(p_series text, p_prefix text) returns text
language plpgsql as $$
declare
  v_year int := extract(year from now() at time zone 'Asia/Kuwait')::int;
  v_seq  int;
begin
  insert into pipeline_counters (series, year, last) values (p_series, v_year, 1)
  on conflict (series, year) do update set last = pipeline_counters.last + 1
  returning last into v_seq;
  return p_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0');
end $$;

-- ── 6. Requests → commitments → blankets ─────────────────────────────
create table commitment_requests (
  id             bigint generated always as identity primary key,
  req_no         text not null unique,            -- RF-WO-2026-001
  req_type       text not null check (req_type in ('WO','LPO','CON')),
  cost_center_id bigint not null references cost_centers(id),
  vendor_id      bigint not null references vendors(id),
  description    text not null check (description <> ''),
  estimated_value numeric not null check (estimated_value > 0),
  blanket_id     bigint,                          -- FK added below (call-off)
  -- blanket terms, when this LPO request creates a blanket
  is_blanket          boolean not null default false,
  blanket_category    text not null default '',
  blanket_rate_ref    text not null default '',
  blanket_valid_from  date,
  blanket_valid_to    date,
  requested_by   text not null default '',
  client_ref     text,                            -- idempotent retries (dispatch_submit pattern)
  status         text not null default 'قيد المراجعة'
                 check (status in ('قيد المراجعة','معتمد','مرفوض','ملغي')),
  decided_by     text not null default '',
  decided_at     timestamptz,
  office_note    text not null default '',
  commitment_id  bigint,                          -- FK added below (set on approval)
  created_at     timestamptz not null default now(),
  constraint blanket_terms_chk check (
    not is_blanket or (req_type = 'LPO' and blanket_category <> ''
                       and blanket_valid_from is not null and blanket_valid_to is not null
                       and blanket_valid_to >= blanket_valid_from)
  )
);
create unique index commitment_requests_client_ref on commitment_requests (client_ref)
  where client_ref is not null and client_ref <> '';
create index commitment_requests_queue on commitment_requests (status, created_at desc);

create table commitments (
  id             bigint generated always as identity primary key,
  number         text not null unique,            -- WO-2026-001 / LPO- / CON-
  ctype          text not null check (ctype in ('WO','LPO','CON')),
  request_id     bigint not null unique references commitment_requests(id),
  cost_center_id bigint not null references cost_centers(id),
  vendor_id      bigint not null references vendors(id),
  description    text not null,
  value          numeric not null check (value > 0),
  blanket_id     bigint,                          -- FK added below (call-off parent)
  status         text not null default 'نشط'
                 check (status in ('نشط','مغلق','ملغي')),
  revision       int not null default 0,
  created_by     text not null default '',
  created_at     timestamptz not null default now()
);
create index commitments_by_cc on commitments (cost_center_id, created_at desc);

create table blanket_lpos (
  id              bigint generated always as identity primary key,
  commitment_id   bigint not null unique references commitments(id),
  vendor_id       bigint not null references vendors(id),
  category        text not null,                  -- ديزل / بيتومين / ركام / …
  rate_ref        text not null default '',
  ceiling         numeric not null check (ceiling > 0),
  valid_from      date not null,
  valid_to        date not null,
  breach_behavior text not null default 'block' check (breach_behavior in ('block','warn')),
  status          text not null default 'نشط' check (status in ('نشط','مغلق')),
  created_at      timestamptz not null default now()
);

alter table commitment_requests
  add constraint commitment_requests_blanket_fkey foreign key (blanket_id) references blanket_lpos(id),
  add constraint commitment_requests_commitment_fkey foreign key (commitment_id) references commitments(id);
alter table commitments
  add constraint commitments_blanket_fkey foreign key (blanket_id) references blanket_lpos(id);

-- Cumulative drawdown = active call-off commitments against the blanket
create or replace view blanket_drawdown as
select b.id as blanket_id,
       b.ceiling,
       coalesce(sum(c.value) filter (where c.status <> 'ملغي'), 0) as drawn,
       b.ceiling - coalesce(sum(c.value) filter (where c.status <> 'ملغي'), 0) as remaining
from blanket_lpos b
left join commitments c on c.blanket_id = b.id
group by b.id, b.ceiling;

-- Data rule #3: duplicate invoice guard. The capture UI comes in a later
-- phase, but the constraint exists from day one — plus data rule #4: an
-- invoice must reference a commitment (no orphan money).
create table supplier_invoices (
  id                  bigint generated always as identity primary key,
  vendor_id           bigint not null references vendors(id),
  supplier_invoice_no text not null,
  invoice_date        date not null,
  amount              numeric not null check (amount > 0),
  commitment_id       bigint not null references commitments(id),
  created_by          text not null default '',
  created_at          timestamptz not null default now(),
  unique (vendor_id, supplier_invoice_no)
);
-- near-duplicate probe (same vendor + amount within 30 days) used by the
-- capture RPC in the GRN phase
create index supplier_invoices_near_dup on supplier_invoices (vendor_id, amount, invoice_date);

-- ── 7. Audit trail: append-only, who/when/before/after (data rule #5) ─
create table pipeline_audit (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     bigint not null,
  action     text not null,                       -- INSERT / UPDATE / DELETE
  actor      text not null default '',
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index pipeline_audit_by_row on pipeline_audit (table_name, row_id, at);

-- Generic row-audit trigger. Actor comes from the RPC via
-- set_config('app.pipeline_actor', …); Table-Editor edits log '(dashboard)'.
create or replace function pipeline_audit_row() returns trigger
language plpgsql as $$
declare v_actor text := coalesce(nullif(current_setting('app.pipeline_actor', true), ''), '(dashboard)');
begin
  insert into pipeline_audit (table_name, row_id, action, actor, before, after)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '0')::bigint,
          tg_op, v_actor,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'cost_centers','vendors','approval_rules','commitment_requests',
    'commitments','blanket_lpos','supplier_invoices'
  ] loop
    execute format('create trigger trg_pipeline_audit after insert or update or delete on %I
                    for each row execute function pipeline_audit_row()', t);
  end loop;
end $$;

-- Approved commitments are immutable except status transitions; anything
-- else needs the revision flow (a later phase sets app.pipeline_allow_rev).
create or replace function commitments_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('app.pipeline_allow_rev', true) = '1' then return new; end if;
  if new.number <> old.number or new.ctype <> old.ctype
     or new.request_id <> old.request_id or new.cost_center_id <> old.cost_center_id
     or new.vendor_id <> old.vendor_id or new.description <> old.description
     or new.value <> old.value or coalesce(new.blanket_id, 0) <> coalesce(old.blanket_id, 0) then
    raise exception 'commitments are immutable — use the revision flow';
  end if;
  return new;
end $$;
create trigger trg_commitments_guard before update on commitments
  for each row execute function commitments_guard();

-- ── 8. RPCs ──────────────────────────────────────────────────────────
-- Login: PIN → identity + roles (PINs never leave the database).
create or replace function pipeline_user_check(p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare u pipeline_users%rowtype;
begin
  select * into u from pipeline_users where pin = p_pin and active limit 1;
  if not found then return json_build_object('success', false); end if;
  return json_build_object('success', true, 'name', u.name,
    'requester', u.requester, 'approver', u.approver,
    'costCenterId', u.cost_center_id);
end $$;
grant execute on function pipeline_user_check(text) to anon, authenticated;

-- Submit a request. Numbering is DB-allocated; client_ref makes retries
-- idempotent (dispatch_submit pattern). Call-offs against a live blanket
-- auto-approve per the call_off_within_blanket rule and mint their LPO-
-- commitment atomically; everything else lands in the head-office queue.
create or replace function request_submit(
  p_pin text, p_client_ref text, p_type text,
  p_cost_center_id bigint, p_vendor_id bigint,
  p_description text, p_value numeric,
  p_blanket_id bigint default null,
  p_is_blanket boolean default false,
  p_blanket_category text default '',
  p_blanket_rate_ref text default '',
  p_blanket_valid_from date default null,
  p_blanket_valid_to date default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_req  commitment_requests%rowtype;
  v_bl   blanket_lpos%rowtype;
  v_remaining numeric;
  v_auto boolean := false;
  v_warn text := '';
  v_req_no text;
  v_cmt_no text;
  v_cmt_id bigint;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and requester limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);

  -- Idempotent retry: this submission already landed → same answer back.
  if coalesce(p_client_ref, '') <> '' then
    select * into v_req from commitment_requests where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'reqNo', v_req.req_no,
        'status', v_req.status, 'resumed', true);
    end if;
  end if;

  if p_type not in ('WO','LPO','CON') then
    return json_build_object('success', false, 'error', 'bad type');
  end if;
  if coalesce(trim(p_description), '') = '' or coalesce(p_value, 0) <= 0 then
    return json_build_object('success', false, 'error', 'description and value required');
  end if;
  perform 1 from cost_centers where id = p_cost_center_id and active;
  if not found then return json_build_object('success', false, 'error', 'unknown cost center'); end if;
  perform 1 from vendors where id = p_vendor_id and active;
  if not found then return json_build_object('success', false, 'error', 'unknown vendor'); end if;

  -- Call-off: must reference a live blanket of the same vendor (rule #4:
  -- no orphan call-offs), and fit inside ceiling + validity to auto-approve.
  if p_blanket_id is not null then
    if p_type <> 'LPO' or p_is_blanket then
      return json_build_object('success', false, 'error', 'call-off must be a plain LPO request');
    end if;
    select * into v_bl from blanket_lpos where id = p_blanket_id for update;
    if not found or v_bl.status <> 'نشط' then
      return json_build_object('success', false, 'error', 'blanket not active');
    end if;
    if v_bl.vendor_id <> p_vendor_id then
      return json_build_object('success', false, 'error', 'vendor does not match blanket');
    end if;
    if current_date < v_bl.valid_from or current_date > v_bl.valid_to then
      return json_build_object('success', false, 'error', 'blanket outside validity window');
    end if;
    select remaining into v_remaining from blanket_drawdown where blanket_id = v_bl.id;
    if p_value > v_remaining then
      if v_bl.breach_behavior = 'block' then
        return json_build_object('success', false, 'error', 'ceiling exceeded',
          'remaining', v_remaining);
      end if;
      v_warn := 'تجاوز سقف المظلة — حُوّل للمكتب الرئيسي';
    else
      select route = 'auto' into v_auto from approval_rules
        where rule = 'call_off_within_blanket' and active;
      v_auto := coalesce(v_auto, false);
    end if;
  end if;

  v_req_no := next_pipeline_no('RF-' || p_type, 'RF-' || p_type);
  insert into commitment_requests (req_no, req_type, cost_center_id, vendor_id,
      description, estimated_value, blanket_id, is_blanket, blanket_category,
      blanket_rate_ref, blanket_valid_from, blanket_valid_to,
      requested_by, client_ref, office_note)
  values (v_req_no, p_type, p_cost_center_id, p_vendor_id,
      trim(p_description), p_value, p_blanket_id, coalesce(p_is_blanket, false),
      coalesce(p_blanket_category, ''), coalesce(p_blanket_rate_ref, ''),
      p_blanket_valid_from, p_blanket_valid_to,
      v_user.name, nullif(p_client_ref, ''), v_warn)
  returning * into v_req;

  if v_auto then
    v_cmt_no := next_pipeline_no(p_type, p_type);
    insert into commitments (number, ctype, request_id, cost_center_id, vendor_id,
        description, value, blanket_id, created_by)
    values (v_cmt_no, p_type, v_req.id, p_cost_center_id, p_vendor_id,
        trim(p_description), p_value, p_blanket_id, 'تلقائي')
    returning id into v_cmt_id;
    update commitment_requests set status = 'معتمد', decided_by = 'تلقائي',
      decided_at = now(), commitment_id = v_cmt_id,
      office_note = 'اعتماد تلقائي — سحب ضمن مظلة سارية'
      where id = v_req.id;
    return json_build_object('success', true, 'reqNo', v_req_no,
      'status', 'معتمد', 'commitmentNo', v_cmt_no, 'auto', true);
  end if;

  return json_build_object('success', true, 'reqNo', v_req_no, 'status', v_req.status);
exception when unique_violation then
  -- concurrent retry with the same client_ref won the race → its answer
  if coalesce(p_client_ref, '') <> '' then
    select * into v_req from commitment_requests where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'reqNo', v_req.req_no,
        'status', v_req.status, 'resumed', true);
    end if;
  end if;
  return json_build_object('success', false, 'error', 'duplicate');
end $$;
grant execute on function request_submit(text, text, text, bigint, bigint, text, numeric,
  bigint, boolean, text, text, date, date) to anon, authenticated;

-- Head-office decision. Approval mints the numbered commitment (and the
-- blanket entity when the request carries blanket terms) atomically.
create or replace function request_decide(
  p_pin text, p_id bigint, p_decision text, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_req  commitment_requests%rowtype;
  v_cmt_no text;
  v_cmt_id bigint;
  v_bl_id  bigint;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);

  select * into v_req from commitment_requests where id = p_id for update;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_req.status <> 'قيد المراجعة' then
    return json_build_object('success', false, 'error', 'already decided');
  end if;

  if p_decision = 'reject' then
    if coalesce(trim(p_note), '') = '' then
      return json_build_object('success', false, 'error', 'note required');
    end if;
    update commitment_requests set status = 'مرفوض', decided_by = v_user.name,
      decided_at = now(), office_note = trim(p_note) where id = p_id;
    return json_build_object('success', true, 'status', 'مرفوض');
  end if;
  if p_decision <> 'approve' then
    return json_build_object('success', false, 'error', 'unknown decision');
  end if;

  v_cmt_no := next_pipeline_no(v_req.req_type, v_req.req_type);
  insert into commitments (number, ctype, request_id, cost_center_id, vendor_id,
      description, value, blanket_id, created_by)
  values (v_cmt_no, v_req.req_type, v_req.id, v_req.cost_center_id, v_req.vendor_id,
      v_req.description, v_req.estimated_value, v_req.blanket_id, v_user.name)
  returning id into v_cmt_id;

  if v_req.is_blanket then
    insert into blanket_lpos (commitment_id, vendor_id, category, rate_ref,
        ceiling, valid_from, valid_to)
    values (v_cmt_id, v_req.vendor_id, v_req.blanket_category, v_req.blanket_rate_ref,
        v_req.estimated_value, v_req.blanket_valid_from, v_req.blanket_valid_to)
    returning id into v_bl_id;
  end if;

  update commitment_requests set status = 'معتمد', decided_by = v_user.name,
    decided_at = now(), office_note = coalesce(trim(p_note), ''),
    commitment_id = v_cmt_id where id = p_id;
  return json_build_object('success', true, 'status', 'معتمد',
    'commitmentNo', v_cmt_no, 'blanketId', v_bl_id);
end $$;
grant execute on function request_decide(text, bigint, text, text) to anon, authenticated;

-- ── 9. RLS ───────────────────────────────────────────────────────────
-- Same v1 posture as the rest of the app: anon reads (no PINs in these
-- tables), every write flows through the SECURITY DEFINER RPCs above.
-- pipeline_users gets RLS with NO policies — PINs are server-side only.
do $$
declare t text;
begin
  foreach t in array array[
    'cost_centers','vendors','vendor_spectronova_ids','approval_rules',
    'pipeline_settings','pipeline_counters','commitment_requests',
    'commitments','blanket_lpos','supplier_invoices','pipeline_audit'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "anon read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
alter table pipeline_users enable row level security;  -- no policies: PINs stay server-side

-- >>>>>>>> 0014_execution_capture.sql >>>>>>>>

-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0014: commitment pipeline — execution capture
-- ═══════════════════════════════════════════════════════════════════
-- Brief module 3: every capture references its commitment.
--   • dispatch_loads / milling_programs gain a commitment_id that the
--     existing submit RPCs stamp AUTOMATICALLY (resolve the active
--     internal WO for the project's cost center) — clerks and engineers
--     see nothing new; dispatch is integrated, not rebuilt.
--   • Orphan enforcement is CONFIG, not code: pipeline_settings key
--     'enforce_capture_commitment' {"dispatch":bool,"milling":bool} —
--     off at cutover (no WO commitments exist yet), flip per-module in
--     the Table Editor once the internal WOs are raised.
--   • GRN capture against LPO commitments (grn_submit), wired to the
--     duplicate-invoice guard: exact dupes are blocked by the 0013
--     unique constraint; a same-vendor same-amount invoice within 30
--     days raises a BLOCKING warning that needs an explicit force.
-- Safe to run before the frontend deploys: dispatch_submit /
-- milling_submit keep their exact signatures and client behavior.

-- ── 1. Internal vendors get a stable handle for resolution ───────────
alter table vendors add column if not exists handle text unique;
update vendors set handle = 'plant'   where name = 'كوبري — مصنع الأسفلت';
update vendors set handle = 'milling' where name = 'كوبري — القشط';
update vendors set handle = 'garage'  where name = 'كوبري — الكراج';

-- ── 2. Capture rows point at their commitment ────────────────────────
alter table dispatch_loads   add column if not exists commitment_id bigint references commitments(id);
alter table milling_programs add column if not exists commitment_id bigint references commitments(id);
create index if not exists dispatch_by_commitment on dispatch_loads (commitment_id) where commitment_id is not null;

insert into pipeline_settings (key, value) values
  ('enforce_capture_commitment', '{"dispatch": false, "milling": false}'::jsonb)
on conflict (key) do nothing;

-- The single resolver: latest active internal WO commitment sold by the
-- given internal vendor (plant/milling/garage) to the project's cost
-- center. Null when the project has no cost center (external clients)
-- or no WO has been raised yet.
create or replace function resolve_internal_wo(p_handle text, p_project text) returns bigint
language sql stable as $$
  select c.id
  from commitments c
  join vendors v       on v.id = c.vendor_id and v.handle = p_handle
  join cost_centers cc on cc.id = c.cost_center_id and cc.active
  join projects p      on p.id = cc.project_id and p.name = p_project
  where c.ctype = 'WO' and c.status = 'نشط'
  order by c.created_at desc
  limit 1
$$;

create or replace function capture_enforced(p_module text) returns boolean
language sql stable as $$
  select coalesce((select (value->>p_module)::boolean
                   from pipeline_settings
                   where key = 'enforce_capture_commitment'), false)
$$;

-- ── 3. dispatch_submit: same signature + behavior, now stamps the WO ─
create or replace function dispatch_submit(
  p_client_ref text,
  p_project text, p_contract text, p_work_order text,
  p_plant text, p_truck text, p_driver text, p_mix text,
  p_weight numeric, p_temp_dispatch numeric,
  p_site text, p_block text, p_street text, p_loc_type text,
  p_clerk text, p_remarks text, p_company text, p_naqel text,
  p_driver_phone text, p_load_number int, p_notify_engineer text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_note text;
  v_existing_note text;
  v_commitment bigint;
begin
  -- Idempotent retry: this submission already landed → same note back.
  if coalesce(p_client_ref, '') <> '' then
    select note into v_existing_note from dispatch_loads where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'note', v_existing_note, 'resumed', true);
    end if;
  end if;

  -- Commitment link (0014): Copri loads are internal plant→project sales
  -- and carry the active WO commitment; external clients have no cost
  -- center, so theirs stays null. Enforcement is the config flag.
  v_commitment := resolve_internal_wo('plant', p_project);
  if v_commitment is null and trim(coalesce(p_company, '')) = 'كوبري' and capture_enforced('dispatch') then
    return json_build_object('success', false,
      'error', 'no active WO commitment for this project');
  end if;

  for i in 1..20 loop
    v_note := nextval('delivery_note_serial')::text;
    begin
      insert into dispatch_loads (
        note, client_ref, project, contract, work_order, plant, truck, driver,
        mix, weight, temp_dispatch, site, block, street, loc_type, clerk,
        remarks, status, company, naqel, driver_phone, load_number, notify_engineer,
        commitment_id
      ) values (
        v_note, nullif(p_client_ref, ''), coalesce(p_project, ''), coalesce(p_contract, ''),
        coalesce(p_work_order, ''), coalesce(p_plant, ''), coalesce(p_truck, ''),
        coalesce(p_driver, ''), coalesce(p_mix, ''), p_weight, p_temp_dispatch,
        coalesce(p_site, ''), coalesce(p_block, ''), coalesce(p_street, ''),
        coalesce(p_loc_type, ''), coalesce(p_clerk, ''), coalesce(p_remarks, ''),
        'في الطريق',
        coalesce(p_company, ''), coalesce(p_naqel, ''), coalesce(p_driver_phone, ''),
        p_load_number, coalesce(p_notify_engineer, ''),
        v_commitment
      );
      return json_build_object('success', true, 'note', v_note);
    exception when unique_violation then
      -- Either the serial was already used by a manual insert (skip to the
      -- next one), or a concurrent retry with the same client_ref won the
      -- race (return its note).
      if coalesce(p_client_ref, '') <> '' then
        select note into v_existing_note from dispatch_loads where client_ref = p_client_ref;
        if found then
          return json_build_object('success', true, 'note', v_existing_note, 'resumed', true);
        end if;
      end if;
    end;
  end loop;
  return json_build_object('success', false, 'error', 'could not allocate a note number');
end $$;

-- ── 4. milling_submit: same signature, stamps the milling WO ─────────
create or replace function milling_submit(
  p_program_id text, p_project text, p_work_order text, p_site text,
  p_block text, p_street text, p_depth text, p_item_code text,
  p_area numeric, p_machines int, p_requested_date date,
  p_priority text, p_engineer text, p_notes text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  n int;
  v_commitment bigint;
begin
  v_commitment := resolve_internal_wo('milling', p_project);
  if v_commitment is null and capture_enforced('milling') then
    return json_build_object('success', false,
      'error', 'no active WO commitment for this project');
  end if;
  insert into milling_programs (program_id, project, work_order, site, block, street,
      depth, item_code, area, machines, requested_date, priority, engineer,
      submitted_at, status, eng_notes, commitment_id, audit)
  values (p_program_id, coalesce(p_project, ''), coalesce(p_work_order, ''),
      coalesce(p_site, ''), coalesce(p_block, ''), coalesce(p_street, ''),
      coalesce(p_depth, ''), coalesce(p_item_code, ''), p_area, p_machines,
      p_requested_date, coalesce(p_priority, ''), coalesce(p_engineer, ''),
      now(), 'بانتظار الموافقة', coalesce(p_notes, ''), v_commitment,
      jsonb_build_array(jsonb_build_object(
        'action', 'submitted', 'by', coalesce(p_engineer, ''), 'role', 'engineer', 'ts', now())))
  on conflict (program_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('success', false, 'duplicate', true); end if;
  return json_build_object('success', true, 'programId', p_program_id);
end $$;

-- ── 5. GRN against LPO commitments ───────────────────────────────────
create table grns (
  id                  bigint generated always as identity primary key,
  grn_no              text not null unique,            -- GRN-2026-001
  commitment_id       bigint not null references commitments(id),
  description         text not null check (description <> ''),
  quantity            numeric,
  unit                text not null default '',
  amount              numeric not null check (amount > 0),
  supplier_invoice_id bigint references supplier_invoices(id),
  received_by         text not null default '',
  note                text not null default '',
  client_ref          text,
  created_at          timestamptz not null default now()
);
create unique index grns_client_ref on grns (client_ref)
  where client_ref is not null and client_ref <> '';
create index grns_by_commitment on grns (commitment_id, created_at desc);

create trigger trg_pipeline_audit after insert or update or delete on grns
  for each row execute function pipeline_audit_row();

alter table grns enable row level security;
create policy "anon read" on grns for select to anon, authenticated using (true);

-- Receipt + optional supplier invoice, atomic. The invoice path closes
-- the audit's 15-duplicate finding: exact (vendor, invoice no) dupes hit
-- the 0013 unique constraint; a same-vendor SAME-AMOUNT invoice within
-- 30 days returns nearDuplicate and only proceeds with p_force = true.
create or replace function grn_submit(
  p_pin text, p_client_ref text, p_commitment_id bigint,
  p_description text, p_quantity numeric, p_unit text, p_amount numeric,
  p_invoice_no text default '', p_invoice_date date default null,
  p_force boolean default false, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_cmt  commitments%rowtype;
  v_grn  grns%rowtype;
  v_grn_no text;
  v_inv_id bigint;
  v_near record;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and requester limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);

  if coalesce(p_client_ref, '') <> '' then
    select * into v_grn from grns where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'grnNo', v_grn.grn_no, 'resumed', true);
    end if;
  end if;

  select * into v_cmt from commitments where id = p_commitment_id;
  if not found then return json_build_object('success', false, 'error', 'unknown commitment'); end if;
  if v_cmt.ctype <> 'LPO' then return json_build_object('success', false, 'error', 'not an LPO'); end if;
  if v_cmt.status <> 'نشط' then return json_build_object('success', false, 'error', 'commitment not active'); end if;
  if coalesce(trim(p_description), '') = '' or coalesce(p_amount, 0) <= 0 then
    return json_build_object('success', false, 'error', 'description and amount required');
  end if;

  if coalesce(trim(p_invoice_no), '') <> '' then
    if p_invoice_date is null then
      return json_build_object('success', false, 'error', 'invoice date required');
    end if;
    -- Near-duplicate guard (blocking warning, forceable)
    if not coalesce(p_force, false) then
      select si.supplier_invoice_no, si.invoice_date into v_near
      from supplier_invoices si
      where si.vendor_id = v_cmt.vendor_id
        and si.amount = p_amount
        and abs(si.invoice_date - p_invoice_date) <= 30
      limit 1;
      if found then
        return json_build_object('success', false, 'nearDuplicate', true,
          'error', 'near-duplicate invoice',
          'existingNo', v_near.supplier_invoice_no, 'existingDate', v_near.invoice_date);
      end if;
    end if;
    begin
      insert into supplier_invoices (vendor_id, supplier_invoice_no, invoice_date,
          amount, commitment_id, created_by)
      values (v_cmt.vendor_id, trim(p_invoice_no), p_invoice_date,
          p_amount, v_cmt.id, v_user.name)
      returning id into v_inv_id;
    exception when unique_violation then
      return json_build_object('success', false, 'duplicate', true,
        'error', 'invoice already recorded for this vendor');
    end;
  end if;

  v_grn_no := next_pipeline_no('GRN', 'GRN');
  insert into grns (grn_no, commitment_id, description, quantity, unit, amount,
      supplier_invoice_id, received_by, note, client_ref)
  values (v_grn_no, v_cmt.id, trim(p_description), p_quantity, coalesce(p_unit, ''),
      p_amount, v_inv_id, v_user.name, coalesce(p_note, ''), nullif(p_client_ref, ''));
  return json_build_object('success', true, 'grnNo', v_grn_no,
    'invoiceId', v_inv_id);
exception when unique_violation then
  if coalesce(p_client_ref, '') <> '' then
    select * into v_grn from grns where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'grnNo', v_grn.grn_no, 'resumed', true);
    end if;
  end if;
  return json_build_object('success', false, 'error', 'duplicate');
end $$;
grant execute on function grn_submit(text, text, bigint, text, numeric, text, numeric,
  text, date, boolean, text) to anon, authenticated;

-- >>>>>>>> 0015_internal_recharge.sql >>>>>>>>

-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0015: commitment pipeline — internal recharge run
-- ═══════════════════════════════════════════════════════════════════
-- Monthly internal invoices from the profit centers to the consuming
-- cost centers, at POLICY RATES kept in a config table (rates are TBD
-- Phase 0 — the run refuses to generate until every item it needs has
-- an active rate, and returns the exact missing item strings to add).
--   • Plant  → per project: dispatched Copri tonnage, grouped by mix,
--     bucketed by Kuwait wall-clock month.
--   • Milling → per project: completed programs' area (completion ts
--     taken from the program's own audit trail), item = 'قشط <depth>'.
--   • Garage → no capture source in the app yet; joins the run when
--     one exists (rates table already accepts vendor handle 'garage').
-- Re-running a period REPLACES its drafts; issued invoices are never
-- touched (rerun skips them and reports the skip).

-- ── 1. Policy rates (config — office edits in the Table Editor) ──────
create table recharge_rates (
  id         bigint generated always as identity primary key,
  vendor_id  bigint not null references vendors(id),   -- internal: plant/milling/garage
  item       text not null,        -- mix type for the plant, 'قشط <عمق>' for milling
  unit       text not null default '',
  rate       numeric not null check (rate > 0),        -- KD per unit
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, item)
);
create trigger trg_updated before update on recharge_rates
  for each row execute function set_updated_at();

-- ── 2. Internal invoices ─────────────────────────────────────────────
create table internal_invoices (
  id             bigint generated always as identity primary key,
  inv_no         text not null unique,                 -- INT-2026-001
  period         text not null check (period ~ '^\d{4}-\d{2}$'),
  vendor_id      bigint not null references vendors(id),
  cost_center_id bigint not null references cost_centers(id),
  commitment_id  bigint references commitments(id),    -- the internal WO, when raised
  lines          jsonb not null default '[]'::jsonb,   -- [{item, qty, unit, rate, amount}]
  total          numeric not null check (total >= 0),
  status         text not null default 'مسودة' check (status in ('مسودة','صادر','ملغي')),
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  unique (period, vendor_id, cost_center_id)
);
create trigger trg_pipeline_audit after insert or update or delete on internal_invoices
  for each row execute function pipeline_audit_row();

do $$
begin
  execute 'alter table recharge_rates enable row level security';
  execute 'create policy "anon read" on recharge_rates for select to anon, authenticated using (true)';
  execute 'alter table internal_invoices enable row level security';
  execute 'create policy "anon read" on internal_invoices for select to anon, authenticated using (true)';
end $$;

-- ── 3. The run ───────────────────────────────────────────────────────
create or replace function recharge_run(p_pin text, p_period text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_plant bigint;
  v_mill  bigint;
  v_missing jsonb;
  r record;
  v_existing internal_invoices%rowtype;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  if p_period !~ '^\d{4}-\d{2}$' then
    return json_build_object('success', false, 'error', 'bad period');
  end if;
  select id into v_plant from vendors where handle = 'plant';
  select id into v_mill  from vendors where handle = 'milling';

  -- Every item the period needs must have an active rate BEFORE anything
  -- is generated — partial invoices would be worse than none.
  select coalesce(jsonb_agg(distinct x.miss), '[]'::jsonb) into v_missing from (
    select jsonb_build_object('vendor', 'plant', 'item', d.mix) as miss
    from dispatch_loads d
    join projects p on p.name = d.project
    join cost_centers cc on cc.project_id = p.id and cc.active
    where to_char(d.ts at time zone 'Asia/Kuwait', 'YYYY-MM') = p_period
      and trim(d.company) = 'كوبري' and coalesce(d.weight, 0) > 0
      and not exists (select 1 from recharge_rates rr
                      where rr.vendor_id = v_plant and rr.item = d.mix and rr.active)
    union
    select jsonb_build_object('vendor', 'milling', 'item', 'قشط ' || m.depth)
    from milling_programs m
    join projects p on p.name = m.project
    join cost_centers cc on cc.project_id = p.id and cc.active
    where m.status = 'مكتمل' and coalesce(m.area, 0) > 0
      and to_char((select max((e->>'ts')::timestamptz) from jsonb_array_elements(m.audit) e
                   where e->>'action' = 'completed') at time zone 'Asia/Kuwait', 'YYYY-MM') = p_period
      and not exists (select 1 from recharge_rates rr
                      where rr.vendor_id = v_mill and rr.item = 'قشط ' || m.depth and rr.active)
  ) x;
  if jsonb_array_length(v_missing) > 0 then
    return json_build_object('success', false, 'error', 'missing rates', 'missingRates', v_missing);
  end if;

  for r in
    -- Plant: Copri tonnage by cost center × mix
    select v_plant as vendor_id, cc.id as cc_id, p.name as project,
           jsonb_agg(jsonb_build_object('item', agg.mix, 'qty', agg.qty, 'unit', 'طن',
                                        'rate', agg.rate, 'amount', agg.amount) order by agg.mix) as lines,
           round(sum(agg.amount), 3) as total
    from (
      select d.project, d.mix, round(sum(d.weight)::numeric, 2) as qty, rr.rate,
             round(sum(d.weight)::numeric * rr.rate, 3) as amount
      from dispatch_loads d
      join recharge_rates rr on rr.vendor_id = v_plant and rr.item = d.mix and rr.active
      where to_char(d.ts at time zone 'Asia/Kuwait', 'YYYY-MM') = p_period
        and trim(d.company) = 'كوبري' and coalesce(d.weight, 0) > 0
      group by d.project, d.mix, rr.rate
    ) agg
    join projects p on p.name = agg.project
    join cost_centers cc on cc.project_id = p.id and cc.active
    group by cc.id, p.name
    union all
    -- Milling: completed area by cost center × depth
    select v_mill, cc.id, p.name,
           jsonb_agg(jsonb_build_object('item', agg.item, 'qty', agg.qty, 'unit', 'م²',
                                        'rate', agg.rate, 'amount', agg.amount) order by agg.item),
           round(sum(agg.amount), 3)
    from (
      select m.project, 'قشط ' || m.depth as item, round(sum(m.area)::numeric, 2) as qty, rr.rate,
             round(sum(m.area)::numeric * rr.rate, 3) as amount
      from milling_programs m
      join recharge_rates rr on rr.vendor_id = v_mill and rr.item = 'قشط ' || m.depth and rr.active
      where m.status = 'مكتمل' and coalesce(m.area, 0) > 0
        and to_char((select max((e->>'ts')::timestamptz) from jsonb_array_elements(m.audit) e
                     where e->>'action' = 'completed') at time zone 'Asia/Kuwait', 'YYYY-MM') = p_period
      group by m.project, m.depth, rr.rate
    ) agg
    join projects p on p.name = agg.project
    join cost_centers cc on cc.project_id = p.id and cc.active
    group by cc.id, p.name
  loop
    select * into v_existing from internal_invoices
      where period = p_period and vendor_id = r.vendor_id and cost_center_id = r.cc_id;
    if found then
      if v_existing.status <> 'مسودة' then
        v_skipped := v_skipped + 1; continue;   -- issued/cancelled: never regenerate
      end if;
      update internal_invoices
         set lines = r.lines, total = r.total, created_by = v_user.name,
             commitment_id = resolve_internal_wo(
               (select handle from vendors where id = r.vendor_id), r.project)
       where id = v_existing.id;
      v_updated := v_updated + 1;
    else
      insert into internal_invoices (inv_no, period, vendor_id, cost_center_id,
          commitment_id, lines, total, created_by)
      values (next_pipeline_no('INT', 'INT'), p_period, r.vendor_id, r.cc_id,
          resolve_internal_wo((select handle from vendors where id = r.vendor_id), r.project),
          r.lines, r.total, v_user.name);
      v_created := v_created + 1;
    end if;
  end loop;

  return json_build_object('success', true, 'period', p_period,
    'created', v_created, 'updated', v_updated, 'skippedIssued', v_skipped);
end $$;
grant execute on function recharge_run(text, text) to anon, authenticated;

-- Draft → issued (issued invoices feed the export layer, 0016)
create or replace function internal_invoice_issue(p_pin text, p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  update internal_invoices set status = 'صادر' where id = p_id and status = 'مسودة';
  if not found then return json_build_object('success', false, 'error', 'not a draft'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function internal_invoice_issue(text, bigint) to anon, authenticated;

-- >>>>>>>> 0016_export_layer.sql >>>>>>>>

-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0016: commitment pipeline — export / reconciliation
-- ═══════════════════════════════════════════════════════════════════
-- Brief module 4: SpectroNova stays the ledger; this app hands it clean
-- coded batches. Two adapters behind ONE interface (batch + rows):
--   • FILE adapter (this migration + the portal's CSV download) — the
--     primary path until API docs/credentials arrive, and the audit
--     copy forever after.
--   • API adapter — STUB: when SpectroNova's API is documented, a
--     server-side job posts the same export_rows payloads and writes
--     acked/acked_at back; nothing else changes. Master-data sync FROM
--     SpectroNova waits for finance's master rebuild (syncing the
--     polluted masters would be worse than not syncing).
-- Every transaction row carries: date, vendor (SpectroNova contact id
-- via the 0013 mapping), cost center code, GL account (config), amount,
-- commitment reference, source-record id. A row can be exported ONCE,
-- ever (unique source+source_id across batches). Reconciliation = the
-- acked flag per row: automated when the API confirms postings, ticked
-- manually by finance until then.

-- GL accounts are config, not constants (chart of accounts TBD)
insert into pipeline_settings (key, value) values
  ('gl_accounts', '{"supplier_invoice": "", "internal_recharge": ""}'::jsonb)
on conflict (key) do nothing;

create table export_batches (
  id         bigint generated always as identity primary key,
  batch_no   text not null unique,                    -- EXP-2026-001
  created_by text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);
create table export_rows (
  id        bigint generated always as identity primary key,
  batch_id  bigint not null references export_batches(id),
  source    text not null check (source in ('supplier_invoice','internal_invoice')),
  source_id bigint not null,
  payload   jsonb not null,                           -- frozen transaction row
  acked     boolean not null default false,
  acked_by  text not null default '',
  acked_at  timestamptz,
  unique (source, source_id)                          -- exported once, ever
);
create index export_rows_by_batch on export_rows (batch_id);
create trigger trg_pipeline_audit after insert or update or delete on export_batches
  for each row execute function pipeline_audit_row();
create trigger trg_pipeline_audit after insert or update or delete on export_rows
  for each row execute function pipeline_audit_row();

do $$
begin
  execute 'alter table export_batches enable row level security';
  execute 'create policy "anon read" on export_batches for select to anon, authenticated using (true)';
  execute 'alter table export_rows enable row level security';
  execute 'create policy "anon read" on export_rows for select to anon, authenticated using (true)';
end $$;

-- Everything postable that no batch has picked up yet, already in the
-- final transaction-row shape. Internal invoices post on their period's
-- last day; supplier invoices on their invoice date.
create or replace view export_pending as
select 'supplier_invoice'::text as source, si.id as source_id,
       jsonb_build_object(
         'date', to_char(si.invoice_date, 'YYYY-MM-DD'),
         'contactId', coalesce((select m.contact_id from vendor_spectronova_ids m
                                where m.vendor_id = si.vendor_id and not m.flagged
                                order by m.contact_id limit 1), ''),
         'vendor', v.name,
         'costCenter', coalesce(cc.spectronova_code, cc.code),
         'glAccount', coalesce((select value->>'supplier_invoice' from pipeline_settings
                                where key = 'gl_accounts'), ''),
         'amount', si.amount,
         'commitmentRef', c.number,
         'sourceId', 'SI-' || si.id,
         'refNo', si.supplier_invoice_no) as payload
from supplier_invoices si
join commitments c   on c.id = si.commitment_id
join vendors v       on v.id = si.vendor_id
join cost_centers cc on cc.id = c.cost_center_id
where not exists (select 1 from export_rows er
                  where er.source = 'supplier_invoice' and er.source_id = si.id)
union all
select 'internal_invoice', ii.id,
       jsonb_build_object(
         'date', to_char((ii.period || '-01')::date + interval '1 month' - interval '1 day', 'YYYY-MM-DD'),
         'contactId', coalesce((select m.contact_id from vendor_spectronova_ids m
                                where m.vendor_id = ii.vendor_id and not m.flagged
                                order by m.contact_id limit 1), ''),
         'vendor', v.name,
         'costCenter', coalesce(cc.spectronova_code, cc.code),
         'glAccount', coalesce((select value->>'internal_recharge' from pipeline_settings
                                where key = 'gl_accounts'), ''),
         'amount', ii.total,
         'commitmentRef', coalesce(c.number, ''),
         'sourceId', 'II-' || ii.id,
         'refNo', ii.inv_no)
from internal_invoices ii
join vendors v       on v.id = ii.vendor_id
join cost_centers cc on cc.id = ii.cost_center_id
left join commitments c on c.id = ii.commitment_id
where ii.status = 'صادر'
  and not exists (select 1 from export_rows er
                  where er.source = 'internal_invoice' and er.source_id = ii.id);

-- Snapshot every pending row into a new batch (the payload is frozen so
-- later master edits can't silently rewrite an exported file).
create or replace function export_batch_create(p_pin text, p_note text default '') returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_batch_id bigint;
  v_batch_no text;
  v_rows int;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);

  perform 1 from export_pending limit 1;
  if not found then return json_build_object('success', false, 'error', 'nothing to export'); end if;

  v_batch_no := next_pipeline_no('EXP', 'EXP');
  insert into export_batches (batch_no, created_by, note)
  values (v_batch_no, v_user.name, coalesce(p_note, ''))
  returning id into v_batch_id;

  insert into export_rows (batch_id, source, source_id, payload)
  select v_batch_id, source, source_id, payload from export_pending;
  get diagnostics v_rows = row_count;

  return json_build_object('success', true, 'batchNo', v_batch_no,
    'batchId', v_batch_id, 'rows', v_rows);
end $$;
grant execute on function export_batch_create(text, text) to anon, authenticated;

-- Reconciliation tick — manual until the API adapter confirms postings.
create or replace function export_row_ack(p_pin text, p_row_id bigint, p_acked boolean) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  update export_rows
     set acked = p_acked,
         acked_by = case when p_acked then v_user.name else '' end,
         acked_at = case when p_acked then now() end
   where id = p_row_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function export_row_ack(text, bigint, boolean) to anon, authenticated;
