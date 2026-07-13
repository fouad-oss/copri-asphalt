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
