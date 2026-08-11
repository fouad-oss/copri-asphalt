-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0032: plant feedback — متفرقات flag + per-site daily
--                        load numbering (paper memo 2026-08-11)
-- ═══════════════════════════════════════════════════════════════════
-- A. dispatch_loads.is_misc — explicit متفرقات bucket for accounting
--    (never inferred from empty address fields).
-- B. dispatch_load_counters — atomic per-site DAILY load counter
--    (رقم الحمولة). Day = Kuwait calendar date, computed server-side.
--    Site identity (site_key):
--      • متفرقات                → fixed key 'MISC' (one shared daily counter)
--      • km-range projects      → project|site  (the km values are per-load
--        data, not a site identity — Expressway counts per road)
--      • everything else        → project|site|block|street (a named street
--        carries the name in block, street '' — its own counter per name)
--    Whitespace-normalized. Voids leave gaps; numbers are never reused.
-- C. dispatch_submit v4: assigns the load number INSIDE the insert
--    transaction (insert … on conflict … returning — atomic under
--    concurrent clerks; the counter bump rolls back with a serial
--    collision so retries never burn numbers). p_load_number is kept in
--    the signature for old cached clients but IGNORED — the server value
--    is returned as load_number in the response. The GLOBAL delivery-note
--    serial (delivery_note_serial, from 126186) is UNTOUCHED.
-- D. note_recon: is_misc appended (accounting filters on it).
-- Historic rows keep their load numbers — no backfill, scheme applies
-- from paste forward.

-- ── A. متفرقات flag ──────────────────────────────────────────────────
alter table dispatch_loads add column if not exists is_misc boolean not null default false;

-- ── B. daily per-site counters ───────────────────────────────────────
create table if not exists dispatch_load_counters (
  day      date not null,
  site_key text not null,
  last_no  int  not null default 0,
  primary key (day, site_key)
);
alter table dispatch_load_counters enable row level security;
-- anon read = the clerk form's live "next number" preview (numbers only,
-- same v1 posture as every other reference read)
drop policy if exists "anon read" on dispatch_load_counters;
create policy "anon read" on dispatch_load_counters
  for select to anon, authenticated using (true);

-- Whitespace normalizer — mirrors the client's normSp() (trim + collapse).
create or replace function norm_sp(t text) returns text
language sql immutable as $$
  select regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g')
$$;

-- ── C. dispatch_submit v4 ────────────────────────────────────────────
-- The 0014 signature must go (an overload would be ambiguous to
-- PostgREST); the new one adds p_is_misc with a default, so old cached
-- clients that omit it keep working unchanged.
drop function if exists dispatch_submit(
  text, text, text, text, text, text, text, text, numeric, numeric,
  text, text, text, text, text, text, text, text, text, int, text);

create or replace function dispatch_submit(
  p_client_ref text,
  p_project text, p_contract text, p_work_order text,
  p_plant text, p_truck text, p_driver text, p_mix text,
  p_weight numeric, p_temp_dispatch numeric,
  p_site text, p_block text, p_street text, p_loc_type text,
  p_clerk text, p_remarks text, p_company text, p_naqel text,
  p_driver_phone text, p_load_number int, p_notify_engineer text,
  p_is_misc boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_note text;
  v_existing dispatch_loads%rowtype;
  v_commitment bigint;
  v_misc boolean := coalesce(p_is_misc, false);
  v_site text; v_block text; v_street text; v_wo text;
  v_day date;
  v_key text;
  v_load int;
begin
  -- Idempotent retry: this submission already landed → same note back.
  if coalesce(p_client_ref, '') <> '' then
    select * into v_existing from dispatch_loads where client_ref = p_client_ref;
    if found then
      return json_build_object('success', true, 'note', v_existing.note,
        'load_number', v_existing.load_number, 'resumed', true);
    end if;
  end if;

  -- متفرقات: no address — force-blank the location fields server-side so
  -- the flag (not field emptiness) is the single source of truth.
  if v_misc then
    v_site := ''; v_block := ''; v_street := ''; v_wo := '';
  else
    v_site := coalesce(p_site, ''); v_block := coalesce(p_block, '');
    v_street := coalesce(p_street, ''); v_wo := coalesce(p_work_order, '');
  end if;

  -- Commitment link (0014 behavior, unchanged).
  v_commitment := resolve_internal_wo('plant', p_project);
  if v_commitment is null and trim(coalesce(p_company, '')) = 'كوبري' and capture_enforced('dispatch') then
    return json_build_object('success', false,
      'error', 'no active WO commitment for this project');
  end if;

  -- Daily counter bucket + site identity (see header).
  v_day := (now() at time zone 'Asia/Kuwait')::date;
  if v_misc then
    v_key := 'MISC';
  elsif norm_sp(p_loc_type) = 'نطاق كيلومتر' then
    v_key := norm_sp(p_project) || '|' || norm_sp(v_site);
  else
    v_key := norm_sp(p_project) || '|' || norm_sp(v_site) || '|'
          || norm_sp(v_block) || '|' || norm_sp(v_street);
  end if;

  for i in 1..20 loop
    begin
      -- Atomic bump: the ON CONFLICT row lock serializes concurrent clerks
      -- on the same site; the bump sits INSIDE this sub-transaction so a
      -- serial collision below rolls it back — no gaps from retries.
      insert into dispatch_load_counters as c (day, site_key, last_no)
      values (v_day, v_key, 1)
      on conflict (day, site_key) do update set last_no = c.last_no + 1
      returning last_no into v_load;

      v_note := nextval('delivery_note_serial')::text;
      insert into dispatch_loads (
        note, client_ref, project, contract, work_order, plant, truck, driver,
        mix, weight, temp_dispatch, site, block, street, loc_type, clerk,
        remarks, status, company, naqel, driver_phone, load_number, notify_engineer,
        commitment_id, is_misc
      ) values (
        v_note, nullif(p_client_ref, ''), coalesce(p_project, ''), coalesce(p_contract, ''),
        v_wo, coalesce(p_plant, ''), coalesce(p_truck, ''),
        coalesce(p_driver, ''), coalesce(p_mix, ''), p_weight, p_temp_dispatch,
        v_site, v_block, v_street,
        coalesce(p_loc_type, ''), coalesce(p_clerk, ''), coalesce(p_remarks, ''),
        'في الطريق',
        coalesce(p_company, ''), coalesce(p_naqel, ''), coalesce(p_driver_phone, ''),
        v_load, coalesce(p_notify_engineer, ''),
        v_commitment, v_misc
      );
      return json_build_object('success', true, 'note', v_note, 'load_number', v_load);
    exception when unique_violation then
      -- Either the serial was already used by a manual insert (skip to the
      -- next one), or a concurrent retry with the same client_ref won the
      -- race (return its note).
      if coalesce(p_client_ref, '') <> '' then
        select * into v_existing from dispatch_loads where client_ref = p_client_ref;
        if found then
          return json_build_object('success', true, 'note', v_existing.note,
            'load_number', v_existing.load_number, 'resumed', true);
        end if;
      end if;
    end;
  end loop;
  return json_build_object('success', false, 'error', 'could not allocate a note number');
end $$;

grant execute on function dispatch_submit to anon, authenticated;

-- ── D. note_recon: is_misc appended (END only — 0030 shape otherwise
--       byte-identical; materials are never متفرقات) ──────────────────
create or replace view note_recon as
select 'dispatch'::text  as note_source,
       d.id              as note_ref,
       d.note            as note_no,
       (d.ts at time zone 'Asia/Kuwait')::date as delivery_date,
       d.project, d.site, d.company,
       d.mix             as item_text,
       d.weight          as qty_dispatched,
       r.weight_arrival  as qty_received,
       coalesce(r.decision, '') as state_text,
       d.recon_status, d.followup_flag, d.followup_at,
       d.item_id,
       d.weight          as bill_qty,
       d.is_misc
from dispatch_loads d
left join lateral (
  select decision, weight_arrival from receipts
   where note = d.note order by ts desc limit 1) r on true
union all
select 'material',
       m.id,
       m.receipt_id,
       (m.ts at time zone 'Asia/Kuwait')::date,
       m.project, m.site, ''::text,
       m.material,
       null::numeric,
       m.quantity,
       m.approval_status,
       m.recon_status, m.followup_flag, m.followup_at,
       m.item_id,
       m.quantity,
       false
from material_receipts m;

-- (select r.* expands at creation — recreate so dependents see is_misc)
create or replace view note_bundle_ready as
select r.* from note_recon r
where r.recon_status = 'matched'
  and not exists (select 1 from bundle_lines bl
    where bl.note_source = r.note_source
      and bl.note_ref = r.note_ref
      and not bl.is_adjustment);

-- Verify:
-- select day, site_key, last_no from dispatch_load_counters order by day desc, site_key;
-- select note, load_number, is_misc, site, block, street from dispatch_loads order by id desc limit 10;
