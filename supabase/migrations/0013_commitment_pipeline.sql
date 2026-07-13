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
