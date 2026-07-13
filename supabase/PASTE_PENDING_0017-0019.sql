-- ════════════════════════════════════════════════════════════════════
-- SINGLE-PASTE BUNDLE — pipeline v2 slices 0-1 (2026-07-13)
-- Contents, in order: 0017_slice0_auth.sql → 0018_po_register.sql →
-- 0019_rpc_auth.sql (verbatim concatenation of the three migration
-- files; paste once in the Supabase SQL editor, then delete this file).
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FILE: migrations/0017_slice0_auth.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════
-- 0017 — SLICE 0 of the v2 brief: users, roles, permissions, audit.
-- Upgrades pipeline identity from PIN-only to Supabase Auth with a
-- STAGED cutover:
--   • auth.users ↔ pipeline_users via auth_user_id (self-linked once,
--     see pipeline_user_link_self) — admin creates the auth accounts in
--     the dashboard (Authentication → Add user, email + password).
--   • pipeline_auth() is the single gate every NEW pipeline RPC uses:
--     JWT identity first; PIN fallback only while the
--     'auth_required' setting is off. Flipping it to true kills PIN
--     logins portal-wide (the v1 RPCs 0013–0016 get their preambles
--     re-pointed at pipeline_auth in the migration that flips the flag —
--     do not flip it before that migration lands).
--   • New capabilities: accountant (daily batch approval, matching) and
--     admin (user management), joining requester / approver.
--   • Cost-center scoping: pipeline_user_centers rows LIMIT a user to
--     those centers; no rows = unrestricted (head office posture).
--   • Audit gap closed: pipeline_users / pipeline_user_centers /
--     pipeline_settings / recharge_rates changes now hit pipeline_audit
--     (pipeline_users through a REDACTING trigger — pipeline_audit is
--     anon-readable, PINs must never appear in it).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Identity + capability columns ─────────────────────────────────
alter table pipeline_users
  add column email        text unique,
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column accountant   boolean not null default false,
  add column admin        boolean not null default false;

-- Fouad wears every hat until the real user list lands (14 July configs)
update pipeline_users set accountant = true, admin = true
 where name = 'فؤاد الزغبي';

create table pipeline_user_centers (
  user_id        bigint not null references pipeline_users(id) on delete cascade,
  cost_center_id bigint not null references cost_centers(id),
  primary key (user_id, cost_center_id)
);
alter table pipeline_user_centers enable row level security;
create policy "anon read" on pipeline_user_centers for select to anon, authenticated using (true);

-- true when the user may act for the given cost center
create or replace function pipeline_user_in_scope(p_user_id bigint, p_cc bigint) returns boolean
language sql stable as $$
  select not exists (select 1 from pipeline_user_centers where user_id = p_user_id)
      or exists (select 1 from pipeline_user_centers
                 where user_id = p_user_id and cost_center_id = p_cc);
$$;

-- ── 2. auth_required switch (config row, off at cutover) ─────────────
insert into pipeline_settings (key, value, updated_by)
  values ('auth_required', 'false'::jsonb, 'migration 0017')
  on conflict (key) do nothing;

-- ── 3. The single auth gate ──────────────────────────────────────────
-- JWT first: a logged-in Supabase Auth user is matched by auth_user_id.
-- PIN fallback: only while auth_required=false (staged cutover).
-- Returns the pipeline_users row (id is null = not authenticated) and
-- stamps app.pipeline_actor for the audit triggers.
create or replace function pipeline_auth(p_pin text) returns pipeline_users
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_required boolean := coalesce(
    (select value = 'true'::jsonb from pipeline_settings where key = 'auth_required'), false);
begin
  if auth.uid() is not null then
    select * into v_user from pipeline_users
      where auth_user_id = auth.uid() and active limit 1;
  end if;
  if v_user.id is null and not v_required and coalesce(p_pin, '') <> '' then
    select * into v_user from pipeline_users
      where pin = p_pin and active limit 1;
  end if;
  if v_user.id is not null then
    perform set_config('app.pipeline_actor', v_user.name, true);
  end if;
  return v_user;
end $$;
-- Internal helper for other definer functions ONLY — it returns the full
-- row (pin included), so the default PUBLIC execute must go.
revoke execute on function pipeline_auth(text) from public, anon, authenticated;

-- ── 4. Login / profile RPCs ──────────────────────────────────────────
-- Upgraded PIN login (v1 signature kept): now also reports the new
-- capabilities and whether the row is already linked to an auth account.
-- Refuses PINs outright once auth_required=true.
create or replace function pipeline_user_check(p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare
  u pipeline_users%rowtype;
  v_required boolean := coalesce(
    (select value = 'true'::jsonb from pipeline_settings where key = 'auth_required'), false);
begin
  if v_required then return json_build_object('success', false, 'authRequired', true); end if;
  select * into u from pipeline_users where pin = p_pin and active limit 1;
  if not found then return json_build_object('success', false); end if;
  return json_build_object('success', true, 'name', u.name,
    'requester', u.requester, 'approver', u.approver,
    'accountant', u.accountant, 'admin', u.admin,
    'costCenterId', u.cost_center_id, 'linked', u.auth_user_id is not null);
end $$;

-- Profile for a Supabase-Auth session (no PIN involved). notLinked=true
-- tells the portal to show the one-time PIN-link screen.
create or replace function pipeline_login_jwt() returns json
language plpgsql security definer set search_path = public as $$
declare u pipeline_users%rowtype;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into u from pipeline_users where auth_user_id = auth.uid() and active limit 1;
  if not found then return json_build_object('success', false, 'notLinked', true); end if;
  return json_build_object('success', true, 'name', u.name,
    'requester', u.requester, 'approver', u.approver,
    'accountant', u.accountant, 'admin', u.admin,
    'costCenterId', u.cost_center_id, 'linked', true);
end $$;
grant execute on function pipeline_login_jwt() to authenticated;

-- One-time self-link: a logged-in auth user proves ownership of a
-- pipeline_users row with its PIN; the row is bound to auth.uid() and,
-- from then on, JWT login needs no PIN. Linking is once-ever per row
-- and once-ever per auth account.
create or replace function pipeline_user_link_self(p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare u pipeline_users%rowtype;
begin
  if auth.uid() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  if exists (select 1 from pipeline_users where auth_user_id = auth.uid()) then
    return json_build_object('success', false, 'error', 'account already linked');
  end if;
  select * into u from pipeline_users where pin = p_pin and active limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if u.auth_user_id is not null then
    return json_build_object('success', false, 'error', 'user already linked');
  end if;
  perform set_config('app.pipeline_actor', u.name, true);
  update pipeline_users
     set auth_user_id = auth.uid(),
         email = coalesce((select au.email from auth.users au where au.id = auth.uid()), email)
   where id = u.id;
  return json_build_object('success', true, 'name', u.name,
    'requester', u.requester, 'approver', u.approver,
    'accountant', u.accountant, 'admin', u.admin,
    'costCenterId', u.cost_center_id, 'linked', true);
end $$;
grant execute on function pipeline_user_link_self(text) to authenticated;

-- ── 5. Audit-gap closure ─────────────────────────────────────────────
-- pipeline_users rows carry PINs and pipeline_audit is anon-readable →
-- dedicated redacting trigger (pin masked, auth_user_id kept: it is not
-- a secret and proves WHO a row was bound to).
create or replace function pipeline_audit_users_row() returns trigger
language plpgsql as $$
declare
  v_actor  text := coalesce(nullif(current_setting('app.pipeline_actor', true), ''), '(dashboard)');
  v_before jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'pin' end;
  v_after  jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'pin' end;
begin
  if tg_op = 'UPDATE' and new.pin is distinct from old.pin then
    v_after := v_after || '{"pin":"(changed)"}'::jsonb;
  end if;
  insert into pipeline_audit (table_name, row_id, action, actor, before, after)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '0')::bigint,
          tg_op, v_actor, v_before, v_after);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_pipeline_audit after insert or update or delete on pipeline_users
  for each row execute function pipeline_audit_users_row();

-- pipeline_user_centers has a composite key — audit rows key on user_id
create or replace function pipeline_audit_centers_row() returns trigger
language plpgsql as $$
declare v_actor text := coalesce(nullif(current_setting('app.pipeline_actor', true), ''), '(dashboard)');
begin
  insert into pipeline_audit (table_name, row_id, action, actor, before, after)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.user_id else new.user_id end), 0),
          tg_op, v_actor,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_pipeline_audit after insert or update or delete on pipeline_user_centers
  for each row execute function pipeline_audit_centers_row();

-- settings + recharge_rates missed the generic trigger in 0013/0015.
-- pipeline_settings keys on a text pk → row_id 0, key visible in the
-- payload; good enough for an append-only trail.
create or replace function pipeline_audit_settings_row() returns trigger
language plpgsql as $$
declare v_actor text := coalesce(nullif(current_setting('app.pipeline_actor', true), ''), '(dashboard)');
begin
  insert into pipeline_audit (table_name, row_id, action, actor, before, after)
  values (tg_table_name, 0, tg_op, v_actor,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_pipeline_audit after insert or update or delete on pipeline_settings
  for each row execute function pipeline_audit_settings_row();
create trigger trg_pipeline_audit after insert or update or delete on recharge_rates
  for each row execute function pipeline_audit_row();

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FILE: migrations/0018_po_register.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════
-- 0018 — SLICE 1 of the v2 brief: PO register + delivery matching.
-- The finance meeting's core finding: the process breaks AFTER the PO —
-- delivery notes are not tracked against POs. This migration makes the
-- commitment register hold real POs (with lines) from three origins:
--   'rf'     — minted by request_decide (v1 flow, unchanged)
--   'manual' — the always-open intake screen (po_entry RPC below),
--              mirroring today's paper RF-LPO→PO flow until Slice 4
--   'import' — the SpectroNova per-department export importer (tools/),
--              which generates SQL for the dashboard editor
-- and ties every delivery capture to a PO line:
--   • commitment_lines (item / qty / unit / rate) with received-qty
--     accumulation views (po_line_match, po_match = three-way match)
--   • material_receipts (site delivery notes) and grns (office capture)
--     gain commitment_line_id + a "no PO found" exception flag —
--     an exception for the accountant, not a free pass
--   • accountant DAILY BATCH approval (capture_pending view +
--     capture_batch_decide RPC) — never per-ticket
-- Uses pipeline_auth (0017): JWT first, PIN fallback until cutover.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Commitments: three origins, request now optional ──────────────
alter table commitments
  alter column request_id drop not null,
  add column origin      text not null default 'rf'
             check (origin in ('rf','manual','import')),
  add column source_ref  text not null default '',  -- SpectroNova PO no (import)
  add column source_file text not null default '';  -- import provenance

-- Immutability guard rewritten null-safe (request_id can be null now)
create or replace function commitments_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('app.pipeline_allow_rev', true) = '1' then return new; end if;
  if new.number is distinct from old.number or new.ctype is distinct from old.ctype
     or new.request_id is distinct from old.request_id
     or new.cost_center_id is distinct from old.cost_center_id
     or new.vendor_id is distinct from old.vendor_id
     or new.description is distinct from old.description
     or new.value is distinct from old.value
     or new.blanket_id is distinct from old.blanket_id
     or new.origin is distinct from old.origin
     or new.source_ref is distinct from old.source_ref then
    raise exception 'commitments are immutable — use the revision flow';
  end if;
  return new;
end $$;

-- ── 2. PO lines ──────────────────────────────────────────────────────
-- qty/rate nullable: lump-sum and service commitments have no quantity;
-- amount is explicit so imports can carry ERP line totals verbatim.
create table commitment_lines (
  id            bigint generated always as identity primary key,
  commitment_id bigint not null references commitments(id),
  line_no       int    not null,
  item          text   not null check (item <> ''),
  qty           numeric check (qty > 0),
  unit          text   not null default '',
  rate          numeric check (rate >= 0),
  amount        numeric check (amount >= 0),       -- qty*rate when both known
  unique (commitment_id, line_no)
);
create index commitment_lines_by_commitment on commitment_lines (commitment_id, line_no);

create trigger trg_pipeline_audit after insert or update or delete on commitment_lines
  for each row execute function pipeline_audit_row();
alter table commitment_lines enable row level security;
create policy "anon read" on commitment_lines for select to anon, authenticated using (true);

-- Lines of a closed/cancelled commitment are frozen (revision flow excepted)
create or replace function commitment_lines_guard() returns trigger
language plpgsql as $$
declare v_status text;
begin
  if current_setting('app.pipeline_allow_rev', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from commitments
    where id = coalesce(new.commitment_id, old.commitment_id);
  if v_status is distinct from 'نشط' then
    raise exception 'commitment is % — lines are frozen', coalesce(v_status, '?');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_commitment_lines_guard before insert or update or delete on commitment_lines
  for each row execute function commitment_lines_guard();

-- ── 3. Manual PO entry — the always-open intake door ─────────────────
-- Mirrors the paper RF-LPO→PO flow: a requester (scoped to their cost
-- centers) registers an already-approved PO directly. Slice 4 restricts
-- this to exceptions once the request portal has earned trust.
create or replace function po_entry(
  p_pin text, p_client_ref text, p_type text,
  p_cost_center_id bigint, p_vendor_id bigint,
  p_description text, p_value numeric,
  p_lines jsonb default '[]'::jsonb, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user  pipeline_users%rowtype;
  v_cmt   commitments%rowtype;
  v_no    text;
  v_line  jsonb;
  v_i     int := 0;
  v_sum   numeric := 0;
  v_qty   numeric; v_rate numeric; v_amt numeric;
  v_value numeric;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.requester then return json_build_object('success', false, 'error', 'not a requester'); end if;

  if coalesce(p_client_ref, '') <> '' then
    select * into v_cmt from commitments
      where origin = 'manual' and source_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'number', v_cmt.number, 'id', v_cmt.id, 'resumed', true);
    end if;
  end if;

  if p_type not in ('WO','LPO','CON') then
    return json_build_object('success', false, 'error', 'bad type');
  end if;
  if not exists (select 1 from cost_centers where id = p_cost_center_id and active) then
    return json_build_object('success', false, 'error', 'unknown cost center');
  end if;
  if not pipeline_user_in_scope(v_user.id, p_cost_center_id) then
    return json_build_object('success', false, 'error', 'cost center out of scope');
  end if;
  if not exists (select 1 from vendors where id = p_vendor_id and active) then
    return json_build_object('success', false, 'error', 'unknown vendor');
  end if;
  if coalesce(trim(p_description), '') = '' then
    return json_build_object('success', false, 'error', 'description required');
  end if;

  -- line amounts: explicit amount wins, else qty*rate; PO value:
  -- explicit p_value wins, else the sum of line amounts
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, v_qty * v_rate);
    if coalesce(trim(v_line->>'item'), '') = '' then
      return json_build_object('success', false, 'error', 'line item required');
    end if;
    v_sum := v_sum + coalesce(v_amt, 0);
  end loop;
  v_value := coalesce(p_value, nullif(v_sum, 0));
  if coalesce(v_value, 0) <= 0 then
    return json_build_object('success', false, 'error', 'value required');
  end if;

  v_no := next_pipeline_no(p_type, p_type);
  insert into commitments (number, ctype, request_id, cost_center_id, vendor_id,
      description, value, origin, source_ref, created_by)
  values (v_no, p_type, null, p_cost_center_id, p_vendor_id,
      trim(p_description) || case when coalesce(p_note,'') <> '' then e'\n' || p_note else '' end,
      v_value, 'manual', coalesce(p_client_ref, ''), v_user.name)
  returning * into v_cmt;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_i    := v_i + 1;
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, v_qty * v_rate);
    insert into commitment_lines (commitment_id, line_no, item, qty, unit, rate, amount)
    values (v_cmt.id, v_i, trim(v_line->>'item'), v_qty,
            coalesce(v_line->>'unit', ''), v_rate, v_amt);
  end loop;

  return json_build_object('success', true, 'number', v_no, 'id', v_cmt.id);
exception when unique_violation then
  if coalesce(p_client_ref, '') <> '' then
    select * into v_cmt from commitments
      where origin = 'manual' and source_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'number', v_cmt.number, 'id', v_cmt.id, 'resumed', true);
    end if;
  end if;
  return json_build_object('success', false, 'error', 'duplicate');
end $$;
grant execute on function po_entry(text, text, text, bigint, bigint, text, numeric, jsonb, text)
  to anon, authenticated;
-- idempotency probe for manual entries (source_ref = client_ref)
create unique index commitments_manual_client_ref on commitments (source_ref)
  where origin = 'manual' and source_ref <> '';

-- ── 4. Delivery notes reference PO lines ─────────────────────────────
-- Site channel: material_receipts (the existing material receival
-- module, extended per the brief). Office channel: grns. Both accumulate
-- received qty against the line; both land in the accountant's daily
-- batch. no_po_flag opens an exception instead of blocking the site.
alter table material_receipts
  add column commitment_line_id bigint references commitment_lines(id),
  add column no_po_flag         boolean not null default false,
  add column approval_status    text not null default 'بانتظار'
             check (approval_status in ('بانتظار','معتمد','استثناء')),
  add column approved_by        text not null default '',
  add column approved_at        timestamptz,
  add column exception_note     text not null default '';
create index material_receipts_pending on material_receipts (approval_status, ts desc);
create index material_receipts_by_line on material_receipts (commitment_line_id);

alter table grns
  add column commitment_line_id bigint references commitment_lines(id),
  add column approval_status    text not null default 'بانتظار'
             check (approval_status in ('بانتظار','معتمد','استثناء')),
  add column approved_by        text not null default '',
  add column approved_at        timestamptz,
  add column exception_note     text not null default '';
create index grns_pending on grns (approval_status, created_at desc);
create index grns_by_line on grns (commitment_line_id);

-- material_receipts inserts are the one remaining direct anon write —
-- approval state must not be client-settable, and (once enforcement is
-- flipped on) a site delivery note needs a PO line or the exception flag.
create or replace function material_receipts_capture_gate() returns trigger
language plpgsql as $$
begin
  new.approval_status := 'بانتظار';
  new.approved_by := ''; new.approved_at := null; new.exception_note := '';
  if new.no_po_flag then new.commitment_line_id := null; end if;
  if capture_enforced('materials')
     and new.commitment_line_id is null and not new.no_po_flag then
    raise exception 'delivery note needs a PO line (or the no-PO exception flag)';
  end if;
  return new;
end $$;
create trigger trg_material_receipts_gate before insert on material_receipts
  for each row execute function material_receipts_capture_gate();

-- approval state changes are pipeline state → audit them (updates only;
-- inserts are the site's own log and would double every receipt)
create trigger trg_pipeline_audit after update on material_receipts
  for each row execute function pipeline_audit_row();

-- invoices ↔ delivery notes (brief: "invoice records reference PO +
-- delivery notes"). Composite-key link table; the audit trail lives on
-- the invoice and capture rows themselves, so no trigger here.
create table supplier_invoice_dns (
  invoice_id bigint not null references supplier_invoices(id),
  dn_kind    text   not null check (dn_kind in ('site','grn')),
  dn_id      bigint not null,
  primary key (invoice_id, dn_kind, dn_id)
);
alter table supplier_invoice_dns enable row level security;
create policy "anon read" on supplier_invoice_dns for select to anon, authenticated using (true);

-- ── 5. grn_submit v2: pipeline_auth + optional PO line ───────────────
-- Signature changes (p_line_id) → drop the v1 overload so PostgREST
-- resolution stays unambiguous.
drop function grn_submit(text, text, bigint, text, numeric, text, numeric, text, date, boolean, text);
create or replace function grn_submit(
  p_pin text, p_client_ref text, p_commitment_id bigint,
  p_description text, p_quantity numeric, p_unit text, p_amount numeric,
  p_line_id bigint default null,
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
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.requester then return json_build_object('success', false, 'error', 'not a requester'); end if;

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
  if p_line_id is not null and not exists
     (select 1 from commitment_lines where id = p_line_id and commitment_id = v_cmt.id) then
    return json_build_object('success', false, 'error', 'line not on this commitment');
  end if;

  if coalesce(trim(p_invoice_no), '') <> '' then
    if p_invoice_date is null then
      return json_build_object('success', false, 'error', 'invoice date required');
    end if;
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
  insert into grns (grn_no, commitment_id, commitment_line_id, description, quantity,
      unit, amount, supplier_invoice_id, received_by, note, client_ref)
  values (v_grn_no, v_cmt.id, p_line_id, trim(p_description), p_quantity,
      coalesce(p_unit, ''), p_amount, v_inv_id, v_user.name,
      coalesce(p_note, ''), nullif(p_client_ref, ''))
  returning * into v_grn;
  if v_inv_id is not null then
    insert into supplier_invoice_dns (invoice_id, dn_kind, dn_id)
    values (v_inv_id, 'grn', v_grn.id);
  end if;
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
  bigint, text, date, boolean, text) to anon, authenticated;

-- ── 6. The match views ───────────────────────────────────────────────
-- Per line: ordered vs received (approved / still pending), both
-- channels. Received amounts are valued at the line rate for site notes
-- (their rate field is retired) and taken verbatim from GRNs.
create or replace view po_line_match as
select l.id  as line_id,
       l.commitment_id, l.line_no, l.item, l.unit, l.rate,
       l.qty                                   as ordered_qty,
       coalesce(l.amount, l.qty * l.rate)      as ordered_amount,
       coalesce(mr.qty_ok, 0) + coalesce(g.qty_ok, 0)   as received_qty,
       coalesce(mr.qty_pend, 0) + coalesce(g.qty_pend, 0) as pending_qty,
       case when l.qty is not null
            then l.qty - coalesce(mr.qty_ok, 0) - coalesce(g.qty_ok, 0) end as open_qty
from commitment_lines l
left join (
  select commitment_line_id,
         sum(quantity) filter (where approval_status = 'معتمد')   as qty_ok,
         sum(quantity) filter (where approval_status = 'بانتظار') as qty_pend
  from material_receipts where commitment_line_id is not null group by 1
) mr on mr.commitment_line_id = l.id
left join (
  select commitment_line_id,
         sum(quantity) filter (where approval_status = 'معتمد')   as qty_ok,
         sum(quantity) filter (where approval_status = 'بانتظار') as qty_pend
  from grns where commitment_line_id is not null group by 1
) g on g.commitment_line_id = l.id;

-- Per PO: ordered vs received vs invoiced — the three-way match.
-- received_amount: GRN amounts verbatim + site notes valued at line rate.
create or replace view po_match as
select c.id as commitment_id, c.number, c.ctype, c.origin, c.status,
       c.cost_center_id, c.vendor_id,
       c.value as ordered_value,
       coalesce(g.amt_ok, 0) + coalesce(mr.amt_ok, 0)  as received_amount,
       coalesce(inv.total, 0)                          as invoiced_amount,
       coalesce(g.n, 0) + coalesce(mr.n, 0)            as capture_count,
       coalesce(g.n_pend, 0) + coalesce(mr.n_pend, 0)  as pending_count,
       coalesce(lines.n, 0)                            as line_count,
       coalesce(lines.open_lines, 0)                   as open_lines,
       c.value - coalesce(inv.total, 0)                as uninvoiced_value,
       coalesce(inv.total, 0) - coalesce(g.amt_ok, 0) - coalesce(mr.amt_ok, 0)
                                                       as invoiced_not_received
from commitments c
left join (
  select commitment_id,
         count(*) as n,
         count(*) filter (where approval_status = 'بانتظار') as n_pend,
         sum(amount) filter (where approval_status = 'معتمد') as amt_ok
  from grns group by 1
) g on g.commitment_id = c.id
left join (
  select l.commitment_id,
         count(*) as n,
         count(*) filter (where r.approval_status = 'بانتظار') as n_pend,
         sum(r.quantity * l.rate) filter (where r.approval_status = 'معتمد') as amt_ok
  from material_receipts r join commitment_lines l on l.id = r.commitment_line_id
  group by 1
) mr on mr.commitment_id = c.id
left join (
  select commitment_id, sum(amount) as total from supplier_invoices group by 1
) inv on inv.commitment_id = c.id
left join (
  select commitment_id, count(*) as n,
         count(*) filter (where qty is not null) as open_lines
  from commitment_lines group by 1
) lines on lines.commitment_id = c.id;

-- One list for the accountant's morning: everything still pending,
-- both channels, oldest first. "No PO" flags surface loudest.
create or replace view capture_pending as
select 'site'::text as kind, r.id, r.ts, r.receiver as actor,
       r.project, r.material as description, r.quantity, r.unit,
       null::numeric as amount, r.commitment_line_id, l.commitment_id,
       c.number as commitment_no, r.no_po_flag, r.photo_url, r.supplier as vendor_name
from material_receipts r
left join commitment_lines l on l.id = r.commitment_line_id
left join commitments c on c.id = l.commitment_id
where r.approval_status = 'بانتظار'
union all
select 'grn', g.id, g.created_at, g.received_by,
       '', g.description, g.quantity, g.unit,
       g.amount, g.commitment_line_id, g.commitment_id,
       c.number, false, '', v.name
from grns g
join commitments c on c.id = g.commitment_id
left join vendors v on v.id = c.vendor_id
where g.approval_status = 'بانتظار'
order by ts;

-- ── 7. Daily batch approval — one action, never per-ticket ───────────
-- The client sends exactly what the accountant saw: approve list +
-- exception list (each {kind:'site'|'grn', id, note}). Anything not
-- sent stays pending for tomorrow's batch.
create or replace function capture_batch_decide(
  p_pin text, p_approve jsonb default '[]'::jsonb, p_except jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_it   jsonb;
  v_ok   int := 0;
  v_ex   int := 0;
  n      int;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;

  for v_it in select * from jsonb_array_elements(coalesce(p_approve, '[]'::jsonb)) loop
    if v_it->>'kind' = 'site' then
      update material_receipts
         set approval_status = 'معتمد', approved_by = v_user.name, approved_at = now()
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    elsif v_it->>'kind' = 'grn' then
      update grns
         set approval_status = 'معتمد', approved_by = v_user.name, approved_at = now()
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    else
      continue;
    end if;
    get diagnostics n = row_count; v_ok := v_ok + n;
  end loop;

  for v_it in select * from jsonb_array_elements(coalesce(p_except, '[]'::jsonb)) loop
    if v_it->>'kind' = 'site' then
      update material_receipts
         set approval_status = 'استثناء', approved_by = v_user.name, approved_at = now(),
             exception_note = coalesce(v_it->>'note', '')
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    elsif v_it->>'kind' = 'grn' then
      update grns
         set approval_status = 'استثناء', approved_by = v_user.name, approved_at = now(),
             exception_note = coalesce(v_it->>'note', '')
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار';
    else
      continue;
    end if;
    get diagnostics n = row_count; v_ex := v_ex + n;
  end loop;

  return json_build_object('success', true, 'approved', v_ok, 'excepted', v_ex);
end $$;
grant execute on function capture_batch_decide(text, jsonb, jsonb) to anon, authenticated;

-- Resolve an exception: link the capture to its PO line (and approve),
-- or update the note while it stays open. Clearing no_po_flag on link.
create or replace function capture_exception_resolve(
  p_pin text, p_kind text, p_id bigint,
  p_line_id bigint default null, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  n int;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;
  if p_kind not in ('site','grn') then return json_build_object('success', false, 'error', 'bad kind'); end if;
  if p_line_id is not null and not exists (select 1 from commitment_lines where id = p_line_id) then
    return json_build_object('success', false, 'error', 'unknown line');
  end if;

  if p_kind = 'site' then
    update material_receipts
       set commitment_line_id = coalesce(p_line_id, commitment_line_id),
           no_po_flag = case when p_line_id is not null then false else no_po_flag end,
           approval_status = case when p_line_id is not null then 'معتمد' else approval_status end,
           approved_by = case when p_line_id is not null then v_user.name else approved_by end,
           approved_at = case when p_line_id is not null then now() else approved_at end,
           exception_note = coalesce(nullif(p_note, ''), exception_note)
     where id = p_id and approval_status = 'استثناء';
  else
    update grns
       set commitment_line_id = coalesce(p_line_id, commitment_line_id),
           approval_status = case when p_line_id is not null then 'معتمد' else approval_status end,
           approved_by = case when p_line_id is not null then v_user.name else approved_by end,
           approved_at = case when p_line_id is not null then now() else approved_at end,
           exception_note = coalesce(nullif(p_note, ''), exception_note)
     where id = p_id and approval_status = 'استثناء';
  end if;
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('success', false, 'error', 'not an open exception'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function capture_exception_resolve(text, text, bigint, bigint, text)
  to anon, authenticated;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FILE: migrations/0019_rpc_auth.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════
-- 0019 — Slice 0 completion: every v1 pipeline RPC (0013/0015/0016)
-- authenticates through pipeline_auth (0017) — JWT identity first, PIN
-- fallback until the auth_required setting flips. Function bodies are
-- otherwise IDENTICAL to their originals (generated mechanically; only
-- the 3-line PIN-lookup preamble changed — pipeline_auth stamps the
-- audit actor itself). grn_submit was already rebuilt this way in 0018.
-- After this migration, flipping auth_required=true retires PINs
-- everywhere at once.
-- ════════════════════════════════════════════════════════════════════

-- from 0013_commitment_pipeline.sql — preamble only
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
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not v_user.requester then return json_build_object('success', false, 'error', 'bad pin'); end if;

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

-- from 0013_commitment_pipeline.sql — preamble only
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
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not v_user.approver then return json_build_object('success', false, 'error', 'bad pin'); end if;

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

-- from 0015_internal_recharge.sql — preamble only
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
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not v_user.approver then return json_build_object('success', false, 'error', 'bad pin'); end if;
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

-- from 0015_internal_recharge.sql — preamble only
create or replace function internal_invoice_issue(p_pin text, p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not v_user.approver then return json_build_object('success', false, 'error', 'bad pin'); end if;
  update internal_invoices set status = 'صادر' where id = p_id and status = 'مسودة';
  if not found then return json_build_object('success', false, 'error', 'not a draft'); end if;
  return json_build_object('success', true);
end $$;

-- from 0016_export_layer.sql — preamble only
create or replace function export_batch_create(p_pin text, p_note text default '') returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_batch_id bigint;
  v_batch_no text;
  v_rows int;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not v_user.approver then return json_build_object('success', false, 'error', 'bad pin'); end if;

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

-- from 0016_export_layer.sql — preamble only
create or replace function export_row_ack(p_pin text, p_row_id bigint, p_acked boolean) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not v_user.approver then return json_build_object('success', false, 'error', 'bad pin'); end if;
  update export_rows
     set acked = p_acked,
         acked_by = case when p_acked then v_user.name else '' end,
         acked_at = case when p_acked then now() end
   where id = p_row_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true);
end $$;


