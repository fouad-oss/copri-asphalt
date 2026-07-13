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
