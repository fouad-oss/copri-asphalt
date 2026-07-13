-- ════════════════════════════════════════════════════════════════════
-- 0021 — SLICE 2 of the v2 brief: subcontract register (the invisible
-- liability). Subcontractors have no commitment process at all today —
-- contracts are filed documents with no financial shadow; subs surface
-- only through payment certificates and through materials COPRI
-- delivers on their behalf, which must be recovered against those
-- certificates.
--
--   • subcontracts extends a CON commitment 1:1 (the blanket_lpos
--     pattern) — the no-orphan rule and CON- numbering stay intact.
--     Terms (retention %, advance, validity, scope, document) attach to
--     the commitment via subcontract_register().
--   • payment_certificates record certified-to-date against the
--     contract; retention is computed from the contract's % at record
--     time (kept explicit per-cert so a mid-contract % change never
--     rewrites history).
--   • sub_material_charges is the materials-issued-to-sub ledger:
--     deliveries COPRI makes on a sub's behalf, recorded against the
--     contract with back-charge status معلق (pending) → مخصوم (deducted
--     on cert #N). Closes the recovery leak.
--   • subcontract_register view: value vs certified vs back-charges vs
--     retention held — single query, no N+1.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Contract record ───────────────────────────────────────────────
create table subcontracts (
  id             bigint generated always as identity primary key,
  commitment_id  bigint not null unique references commitments(id),
  vendor_id      bigint not null references vendors(id),
  cost_center_id bigint not null references cost_centers(id),
  scope          text not null default '',
  contract_value numeric not null check (contract_value > 0),
  retention_pct  numeric not null default 0 check (retention_pct >= 0 and retention_pct <= 100),
  advance_amount numeric not null default 0 check (advance_amount >= 0),
  valid_from     date,
  valid_to       date,
  doc_url        text not null default '',        -- contract document (Storage/file link)
  status         text not null default 'نشط' check (status in ('نشط','مغلق','ملغي')),
  created_by     text not null default '',
  created_at     timestamptz not null default now()
);
create index subcontracts_by_vendor on subcontracts (vendor_id);
create index subcontracts_by_cc     on subcontracts (cost_center_id);

-- ── 2. Payment certificates ──────────────────────────────────────────
create table payment_certificates (
  id                bigint generated always as identity primary key,
  subcontract_id    bigint not null references subcontracts(id),
  cert_no           int    not null check (cert_no >= 1),
  period            text   not null default '',   -- e.g. '2026-06' / 'دفعة 3'
  gross_amount      numeric not null check (gross_amount > 0),
  retention_amount  numeric not null default 0 check (retention_amount >= 0),
  backcharge_amount numeric not null default 0 check (backcharge_amount >= 0),
  net_amount        numeric not null,
  note              text not null default '',
  created_by        text not null default '',
  created_at        timestamptz not null default now(),
  unique (subcontract_id, cert_no)
);
create index payment_certificates_by_contract on payment_certificates (subcontract_id, cert_no);

-- ── 3. Materials-issued-to-sub ledger ────────────────────────────────
-- Source: a site material_receipts capture (receipt_id) or a manual
-- accounting entry. status معلق until the charge is deducted on a
-- certificate (certificate_id set atomically by certificate_record).
create table sub_material_charges (
  id             bigint generated always as identity primary key,
  subcontract_id bigint not null references subcontracts(id),
  receipt_id     bigint unique references material_receipts(id),
  description    text not null default '',
  quantity       numeric,
  unit           text not null default '',
  amount         numeric not null check (amount >= 0),
  status         text not null default 'معلق' check (status in ('معلق','مخصوم','ملغي')),
  certificate_id bigint references payment_certificates(id),
  note           text not null default '',
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  constraint deducted_needs_cert check
    ((status = 'مخصوم') = (certificate_id is not null))
);
create index sub_material_charges_open on sub_material_charges (subcontract_id, status);

-- audit + RLS (v1 posture: anon read, writes via RPCs)
do $$
declare t text;
begin
  foreach t in array array['subcontracts','payment_certificates','sub_material_charges'] loop
    execute format('create trigger trg_pipeline_audit after insert or update or delete on %I
                    for each row execute function pipeline_audit_row()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy "anon read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ── 4. Register view: value vs certified vs back-charges vs retention ─
create or replace view subcontract_overview as
select s.id, s.commitment_id, c.number, s.vendor_id, v.name as vendor_name,
       s.cost_center_id, s.scope, s.contract_value, s.retention_pct,
       s.advance_amount, s.valid_from, s.valid_to, s.doc_url, s.status,
       coalesce(pc.gross, 0)        as certified_amount,
       coalesce(pc.retention, 0)    as retention_held,
       coalesce(pc.n, 0)            as cert_count,
       coalesce(ch.pending, 0)      as backcharges_pending,
       coalesce(ch.deducted, 0)     as backcharges_deducted,
       s.contract_value - coalesce(pc.gross, 0) as remaining_value
from subcontracts s
join commitments c on c.id = s.commitment_id
join vendors v     on v.id = s.vendor_id
left join (
  select subcontract_id, count(*) as n, sum(gross_amount) as gross,
         sum(retention_amount) as retention
  from payment_certificates group by 1
) pc on pc.subcontract_id = s.id
left join (
  select subcontract_id,
         sum(amount) filter (where status = 'معلق')  as pending,
         sum(amount) filter (where status = 'مخصوم') as deducted
  from sub_material_charges group by 1
) ch on ch.subcontract_id = s.id;

-- ── 5. RPCs ──────────────────────────────────────────────────────────
-- Attach contract terms to a CON commitment (creates the register row).
-- Approver or accountant; the CON commitment itself still arrives only
-- through the request flow / manual entry — no orphan contracts.
create or replace function subcontract_register(
  p_pin text, p_commitment_id bigint,
  p_scope text, p_retention_pct numeric, p_advance numeric default 0,
  p_valid_from date default null, p_valid_to date default null,
  p_doc_url text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_cmt  commitments%rowtype;
  v_id   bigint;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.approver or v_user.accountant) then
    return json_build_object('success', false, 'error', 'not allowed');
  end if;

  select * into v_cmt from commitments where id = p_commitment_id;
  if not found then return json_build_object('success', false, 'error', 'unknown commitment'); end if;
  if v_cmt.ctype <> 'CON' then return json_build_object('success', false, 'error', 'not a CON commitment'); end if;
  if v_cmt.status <> 'نشط' then return json_build_object('success', false, 'error', 'commitment not active'); end if;
  if not pipeline_user_in_scope(v_user.id, v_cmt.cost_center_id) then
    return json_build_object('success', false, 'error', 'cost center out of scope');
  end if;
  if exists (select 1 from subcontracts where commitment_id = p_commitment_id) then
    return json_build_object('success', false, 'error', 'already registered');
  end if;
  if coalesce(p_retention_pct, -1) < 0 or p_retention_pct > 100 then
    return json_build_object('success', false, 'error', 'retention percent 0–100 required');
  end if;
  if p_valid_from is not null and p_valid_to is not null and p_valid_to < p_valid_from then
    return json_build_object('success', false, 'error', 'validity window inverted');
  end if;

  insert into subcontracts (commitment_id, vendor_id, cost_center_id, scope,
      contract_value, retention_pct, advance_amount, valid_from, valid_to,
      doc_url, created_by)
  values (v_cmt.id, v_cmt.vendor_id, v_cmt.cost_center_id, coalesce(trim(p_scope), ''),
      v_cmt.value, p_retention_pct, coalesce(p_advance, 0), p_valid_from, p_valid_to,
      coalesce(p_doc_url, ''), v_user.name)
  returning id into v_id;
  return json_build_object('success', true, 'id', v_id, 'number', v_cmt.number);
end $$;
grant execute on function subcontract_register(text, bigint, text, numeric, numeric, date, date, text)
  to anon, authenticated;

-- Add a back-charge to the ledger. From a site capture (receipt_id, once
-- per receipt) or manual. Accountant only.
create or replace function sub_charge_add(
  p_pin text, p_subcontract_id bigint,
  p_amount numeric, p_description text default '',
  p_receipt_id bigint default null,
  p_quantity numeric default null, p_unit text default '', p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_sub  subcontracts%rowtype;
  v_id   bigint;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;

  select * into v_sub from subcontracts where id = p_subcontract_id;
  if not found then return json_build_object('success', false, 'error', 'unknown subcontract'); end if;
  if v_sub.status <> 'نشط' then return json_build_object('success', false, 'error', 'subcontract not active'); end if;
  if coalesce(p_amount, 0) <= 0 then
    return json_build_object('success', false, 'error', 'amount required');
  end if;
  if p_receipt_id is not null and not exists
     (select 1 from material_receipts where id = p_receipt_id) then
    return json_build_object('success', false, 'error', 'unknown receipt');
  end if;

  insert into sub_material_charges (subcontract_id, receipt_id, description,
      quantity, unit, amount, note, created_by)
  values (p_subcontract_id, p_receipt_id, coalesce(trim(p_description), ''),
      p_quantity, coalesce(p_unit, ''), p_amount, coalesce(p_note, ''), v_user.name)
  returning id into v_id;
  return json_build_object('success', true, 'id', v_id);
exception when unique_violation then
  return json_build_object('success', false, 'error', 'receipt already charged');
end $$;
grant execute on function sub_charge_add(text, bigint, numeric, text, bigint, numeric, text, text)
  to anon, authenticated;

-- Record a payment certificate. cert_no is allocated per contract;
-- retention computed from the contract %; the listed pending charges are
-- deducted on THIS certificate atomically. net = gross − retention −
-- deducted charges (advance recovery stays a manual note for now).
create or replace function certificate_record(
  p_pin text, p_subcontract_id bigint, p_gross numeric,
  p_period text default '', p_charge_ids jsonb default '[]'::jsonb,
  p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_sub  subcontracts%rowtype;
  v_cert payment_certificates%rowtype;
  v_no   int;
  v_charges numeric := 0;
  v_retention numeric;
  v_id  bigint;
  v_ids bigint[];
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;

  select * into v_sub from subcontracts where id = p_subcontract_id for update;
  if not found then return json_build_object('success', false, 'error', 'unknown subcontract'); end if;
  if v_sub.status <> 'نشط' then return json_build_object('success', false, 'error', 'subcontract not active'); end if;
  if coalesce(p_gross, 0) <= 0 then
    return json_build_object('success', false, 'error', 'gross amount required');
  end if;

  select array_agg(x::bigint) into v_ids
    from jsonb_array_elements_text(coalesce(p_charge_ids, '[]'::jsonb)) x;
  if v_ids is not null then
    select coalesce(sum(amount), 0) into v_charges
      from sub_material_charges
     where id = any(v_ids) and subcontract_id = p_subcontract_id and status = 'معلق';
    if (select count(*) from sub_material_charges
        where id = any(v_ids) and subcontract_id = p_subcontract_id and status = 'معلق')
       <> array_length(v_ids, 1) then
      return json_build_object('success', false, 'error', 'charge list contains non-pending items');
    end if;
  end if;

  v_retention := round(p_gross * v_sub.retention_pct / 100, 3);
  select coalesce(max(cert_no), 0) + 1 into v_no
    from payment_certificates where subcontract_id = p_subcontract_id;

  insert into payment_certificates (subcontract_id, cert_no, period, gross_amount,
      retention_amount, backcharge_amount, net_amount, note, created_by)
  values (p_subcontract_id, v_no, coalesce(trim(p_period), ''), p_gross,
      v_retention, v_charges, p_gross - v_retention - v_charges,
      coalesce(p_note, ''), v_user.name)
  returning id into v_id;

  if v_ids is not null then
    update sub_material_charges
       set status = 'مخصوم', certificate_id = v_id
     where id = any(v_ids) and subcontract_id = p_subcontract_id and status = 'معلق';
  end if;

  return json_build_object('success', true, 'id', v_id, 'certNo', v_no,
    'retention', v_retention, 'backcharges', v_charges,
    'net', p_gross - v_retention - v_charges);
end $$;
grant execute on function certificate_record(text, bigint, numeric, text, jsonb, text)
  to anon, authenticated;
