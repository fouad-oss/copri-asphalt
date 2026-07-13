-- ════════════════════════════════════════════════════════════════════
-- SINGLE-PASTE BUNDLE — pipeline v2 slices 0-4 continuation (2026-07-13)
-- Contents, in order: 0020_chains_raw_capture_items.sql →
-- 0021_subcontract_register.sql → 0022_blanket_lines_routing.sql
-- (verbatim concatenation; paste once in the Supabase SQL editor, then
-- delete this file). REQUIRES 0017-0019 to be applied first
-- (PASTE_PENDING_0017-0019.sql if not yet pasted).
-- ════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FILE: migrations/0020_chains_raw_capture_items.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════
-- 0020 — v2 brief (post-finance-meeting revision), Slice 0 delta +
-- Slice 1 rework + items master.
--
--   A. Approval chains are configurable sequential gates, not a single
--      approver field (approval_chain_gates). Seeded per the meeting:
--      accountant-raised requests → finance approver ("Jimmy"); every
--      other request keeps the v1 single head-office gate. Adding the
--      planned PM → Jimmy → Admin chain later = INSERT rows, no schema
--      change. Separation of duties enforced in request_decide (creator
--      can never clear a gate on their own request).
--   B. New capabilities: finance_approver, management (read-only flag
--      for UI routing — grants nothing server-side). Accountants may
--      raise requests (their requests route through 'accountant_raised').
--   C. Slice 1 rework: delivery capture is RAW — no PO reference at
--      capture time. Mapping a DN to its PO line is an ACCOUNTING step
--      in the daily batch: capture_line_suggest proposes (vendor +
--      material + open-PO), the accountant confirms, capture_batch_decide
--      maps-then-approves in one action. Unmapped site captures can
--      exist but can never be approved.
--   D. Canonical items master (data rule #3): items +
--      item_spectronova_ids, nullable item_id on commitment_lines and
--      material_receipts (hard FK enforcement waits for the seeded
--      master — dedup ITEMS decisions pending).
-- ════════════════════════════════════════════════════════════════════

-- ── A1. Capabilities ─────────────────────────────────────────────────
alter table pipeline_users
  add column finance_approver boolean not null default false,
  add column management       boolean not null default false;

-- Fouad wears every hat until the real user list lands (0017 pattern);
-- reassign to Jimmy in the Table Editor when his account is created.
update pipeline_users set finance_approver = true where name = 'فؤاد الزغبي';

-- ── A2. Chain config: sequential gates ───────────────────────────────
create table approval_chain_gates (
  id         bigint generated always as identity primary key,
  chain      text not null,
  gate_no    int  not null check (gate_no >= 1),
  capability text not null check (capability in
             ('approver','finance_approver','accountant','admin')),
  label      text not null default '',
  active     boolean not null default true,
  unique (chain, gate_no)
);
insert into approval_chain_gates (chain, gate_no, capability, label) values
  ('default',           1, 'approver',         'المكتب الرئيسي'),
  ('accountant_raised', 1, 'finance_approver', 'اعتماد مالي');
-- Planned future chain (INSERT when finance says go):
--   ('default', 1, 'approver', 'مدير المشروع'), ('default', 2, 'finance_approver', 'جيمي'),
--   ('default', 3, 'admin', 'الإدارة')

create trigger trg_pipeline_audit after insert or update or delete on approval_chain_gates
  for each row execute function pipeline_audit_row();
alter table approval_chain_gates enable row level security;
create policy "anon read" on approval_chain_gates for select to anon, authenticated using (true);

-- Requests walk their chain; gate_log is the provable approval trail
-- (append-only jsonb, milling audit pattern) on top of pipeline_audit.
alter table commitment_requests
  add column chain        text  not null default 'default',
  add column current_gate int   not null default 1,
  add column gate_log     jsonb not null default '[]';

-- ── A3. request_submit v2: scope check + chain assignment ────────────
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
  v_chain text;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not (v_user.requester or v_user.accountant) then
    return json_build_object('success', false, 'error', 'bad pin');
  end if;

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
  if not pipeline_user_in_scope(v_user.id, p_cost_center_id) then
    return json_build_object('success', false, 'error', 'cost center out of scope');
  end if;
  perform 1 from vendors where id = p_vendor_id and active;
  if not found then return json_build_object('success', false, 'error', 'unknown vendor'); end if;

  -- Accountant-raised requests route to the finance approver (Jimmy);
  -- everything else walks the default chain.
  v_chain := case when v_user.accountant then 'accountant_raised' else 'default' end;

  -- Call-off: must reference a live blanket of the same vendor (rule:
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
      requested_by, client_ref, office_note, chain)
  values (v_req_no, p_type, p_cost_center_id, p_vendor_id,
      trim(p_description), p_value, p_blanket_id, coalesce(p_is_blanket, false),
      coalesce(p_blanket_category, ''), coalesce(p_blanket_rate_ref, ''),
      p_blanket_valid_from, p_blanket_valid_to,
      v_user.name, nullif(p_client_ref, ''), v_warn, v_chain)
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

-- ── A4. request_decide v2: walk the gates ────────────────────────────
-- Approving clears the request's CURRENT gate; the commitment is minted
-- only when the last active gate clears. Rejection at any gate is final.
-- Separation of duties: the requester can never decide their own request.
create or replace function request_decide(
  p_pin text, p_id bigint, p_decision text, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_req  commitment_requests%rowtype;
  v_gate approval_chain_gates%rowtype;
  v_next approval_chain_gates%rowtype;
  v_may  boolean;
  v_cmt_no text;
  v_cmt_id bigint;
  v_bl_id  bigint;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;

  select * into v_req from commitment_requests where id = p_id for update;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_req.status <> 'قيد المراجعة' then
    return json_build_object('success', false, 'error', 'already decided');
  end if;
  if v_req.requested_by = v_user.name then
    return json_build_object('success', false, 'error', 'creator cannot approve own request');
  end if;

  -- The gate this decision must clear. A chain with no matching active
  -- gate falls back to the v1 posture (single head-office approver).
  select * into v_gate from approval_chain_gates
    where chain = v_req.chain and gate_no = v_req.current_gate and active;
  if not found then
    v_gate.capability := 'approver'; v_gate.label := 'المكتب الرئيسي';
  end if;
  v_may := case v_gate.capability
             when 'approver'         then v_user.approver
             when 'finance_approver' then v_user.finance_approver
             when 'accountant'       then v_user.accountant
             when 'admin'            then v_user.admin
           end;
  if not coalesce(v_may, false) then
    return json_build_object('success', false, 'error', 'gate needs ' || v_gate.capability);
  end if;

  if p_decision = 'reject' then
    if coalesce(trim(p_note), '') = '' then
      return json_build_object('success', false, 'error', 'note required');
    end if;
    update commitment_requests set status = 'مرفوض', decided_by = v_user.name,
      decided_at = now(), office_note = trim(p_note),
      gate_log = gate_log || jsonb_build_object('gate', v_req.current_gate,
        'capability', v_gate.capability, 'decision', 'reject',
        'by', v_user.name, 'at', now(), 'note', trim(p_note))
      where id = p_id;
    return json_build_object('success', true, 'status', 'مرفوض');
  end if;
  if p_decision <> 'approve' then
    return json_build_object('success', false, 'error', 'unknown decision');
  end if;

  update commitment_requests set
    gate_log = gate_log || jsonb_build_object('gate', v_req.current_gate,
      'capability', v_gate.capability, 'decision', 'approve',
      'by', v_user.name, 'at', now(), 'note', coalesce(trim(p_note), ''))
    where id = p_id;

  -- More gates ahead? → advance, stay pending.
  select * into v_next from approval_chain_gates
    where chain = v_req.chain and gate_no > v_req.current_gate and active
    order by gate_no limit 1;
  if found then
    update commitment_requests set current_gate = v_next.gate_no where id = p_id;
    return json_build_object('success', true, 'status', 'قيد المراجعة',
      'nextGate', v_next.gate_no, 'nextCapability', v_next.capability,
      'nextLabel', v_next.label);
  end if;

  -- Last gate cleared → mint the commitment (v1 logic, unchanged).
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

-- ── A5. Login RPCs report the new capabilities ───────────────────────
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
    'financeApprover', u.finance_approver, 'management', u.management,
    'costCenterId', u.cost_center_id, 'linked', u.auth_user_id is not null);
end $$;

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
    'financeApprover', u.finance_approver, 'management', u.management,
    'costCenterId', u.cost_center_id, 'linked', true);
end $$;

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
    'financeApprover', u.finance_approver, 'management', u.management,
    'costCenterId', u.cost_center_id, 'linked', true);
end $$;

-- ── C1. Capture is raw: no line requirement at insert ────────────────
-- The 0018 insert-time gate wanted a PO line (or flag) on every site DN.
-- v2 reverses that: field engineers record exactly what is in front of
-- them; the no-orphan rule moves to approval time (a DN can exist
-- unmapped, it can never be APPROVED unmapped — enforced in
-- capture_batch_decide below). Approval state stays force-reset: it is
-- never client-settable.
create or replace function material_receipts_capture_gate() returns trigger
language plpgsql as $$
begin
  new.approval_status := 'بانتظار';
  new.approved_by := ''; new.approved_at := null; new.exception_note := '';
  if new.no_po_flag then new.commitment_line_id := null; end if;
  return new;
end $$;

-- ── C2. Mapping suggestions for the daily batch ──────────────────────
-- Candidate PO lines per pending unmapped site capture: same vendor
-- (normalized name match on the capture's free-text supplier), ranked by
-- material-name match then open quantity. The accountant confirms; the
-- view never decides.
create or replace view capture_line_suggest as
select r.id as receipt_id,
       l.id as line_id,
       c.id as commitment_id,
       c.number as commitment_no,
       l.line_no, l.item, l.unit, l.rate,
       m.ordered_qty, m.received_qty, m.open_qty,
       case when vendor_norm(l.item) = vendor_norm(r.material) then 2
            when vendor_norm(l.item) like '%' || vendor_norm(r.material) || '%'
              or vendor_norm(r.material) like '%' || vendor_norm(l.item) || '%' then 1
            else 0 end as material_score
from material_receipts r
join vendors v on v.active and vendor_norm(v.name) = vendor_norm(coalesce(r.supplier, ''))
join commitments c on c.vendor_id = v.id and c.status = 'نشط'
join commitment_lines l on l.commitment_id = c.id
left join po_line_match m on m.line_id = l.id
where r.approval_status = 'بانتظار'
  and r.commitment_line_id is null;

-- ── C3. capture_batch_decide v2: map, then approve — one action ──────
-- Approve items may carry the accountant-confirmed mapping:
--   {kind:'site'|'grn', id, line_id?}
-- Site captures: approving REQUIRES a line (sent now or already set);
-- items without one are skipped and reported (client moves them to the
-- exception list). GRNs: the commitment is already known; a line is an
-- optional refinement (validated to belong to the GRN's commitment).
create or replace function capture_batch_decide(
  p_pin text, p_approve jsonb default '[]'::jsonb, p_except jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_it   jsonb;
  v_line bigint;
  v_ok   int := 0;
  v_ex   int := 0;
  v_skip int := 0;
  n      int;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not v_user.accountant then return json_build_object('success', false, 'error', 'not an accountant'); end if;

  for v_it in select * from jsonb_array_elements(coalesce(p_approve, '[]'::jsonb)) loop
    v_line := nullif(v_it->>'line_id', '')::bigint;
    if v_line is not null and not exists (select 1 from commitment_lines where id = v_line) then
      v_skip := v_skip + 1; continue;
    end if;
    if v_it->>'kind' = 'site' then
      update material_receipts
         set commitment_line_id = coalesce(v_line, commitment_line_id),
             no_po_flag      = false,
             approval_status = 'معتمد', approved_by = v_user.name, approved_at = now()
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار'
         and coalesce(v_line, commitment_line_id) is not null;
    elsif v_it->>'kind' = 'grn' then
      update grns
         set commitment_line_id = coalesce(v_line, commitment_line_id),
             approval_status = 'معتمد', approved_by = v_user.name, approved_at = now()
       where id = (v_it->>'id')::bigint and approval_status = 'بانتظار'
         and (v_line is null or exists (select 1 from commitment_lines l
              where l.id = v_line and l.commitment_id = grns.commitment_id));
    else
      continue;
    end if;
    get diagnostics n = row_count;
    v_ok := v_ok + n;
    if n = 0 then v_skip := v_skip + 1; end if;
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

  return json_build_object('success', true, 'approved', v_ok, 'excepted', v_ex,
    'skippedUnmapped', v_skip);
end $$;

-- ── D. Canonical items master (data rule #3) ─────────────────────────
-- Same pattern as vendors: normalized unique names, SpectroNova code
-- mapping (many-to-one tolerated during cleanup), merge-and-map. Seeded
-- by the dedup tool's apply stage once the accountant's ITEMS decisions
-- land; until then item_id stays nullable everywhere it appears.
create table items (
  id         bigint generated always as identity primary key,
  name       text not null,
  name_ar    text not null default '',
  unit       text not null default '',            -- canonical UOM
  category   text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index items_norm_key on items (vendor_norm(name));
create trigger trg_updated before update on items
  for each row execute function set_updated_at();
create trigger trg_pipeline_audit after insert or update or delete on items
  for each row execute function pipeline_audit_row();

create table item_spectronova_ids (
  item_id   bigint not null references items(id),
  item_code text   not null,
  flagged   boolean not null default false,       -- probable ERP duplicate
  primary key (item_id, item_code)
);

alter table commitment_lines  add column item_id bigint references items(id);
alter table material_receipts add column item_id bigint references items(id);
create index commitment_lines_by_item  on commitment_lines (item_id);
create index material_receipts_by_item on material_receipts (item_id);

alter table items enable row level security;
create policy "anon read" on items for select to anon, authenticated using (true);
alter table item_spectronova_ids enable row level security;
create policy "anon read" on item_spectronova_ids for select to anon, authenticated using (true);


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FILE: migrations/0021_subcontract_register.sql
-- ╚══════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FILE: migrations/0022_blanket_lines_routing.sql
-- ╚══════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════
-- 0022 — SLICE 3 of the v2 brief (blanket item lines) + Slice 4 routing
-- groundwork.
--
-- v2 reverses the v1 blanket model: "a blanket is specified by item
-- lines, not a money ceiling". Header keeps vendor/category/validity;
-- lines carry item + agreed rate + agreed QUANTITY — drawdown is
-- tracked in quantity per line, KD values are derived (qty × rate) and
-- never the primary control.
--
--   • Staged: existing money-ceiling blankets keep working
--     (control_mode='ceiling'); new blankets registered with lines get
--     control_mode='lines'. Nothing re-registers silently.
--   • A line call-off references a specific blanket LINE with a
--     quantity; its value is derived server-side at the line's agreed
--     rate (rate variance is impossible at request time by
--     construction; it re-appears at match time on GRN amounts, where
--     the accountant sees it in the daily batch).
--   • Auto-approved line call-offs mint their commitment WITH a
--     commitment_line copied from the blanket line, so the existing
--     delivery-matching machinery (0018/0020) works on call-offs
--     unchanged.
--   • Slice 4 groundwork: requests carry WHY they route where they do
--     (new-vendor flag, above-threshold flag from approval_rules) —
--     shown inline in the queue per the design system. Thresholds stay
--     null (= match nothing) until finance supplies them.
--
-- Transport/testing blankets: lines are service items with unit =
-- نقلة / طن·كم / فحص — same mechanics, nothing special-cased.
-- Seeding the real KNPC / Jawharat Berlin / transport / testing
-- blankets needs their agreed rates and quantities (open inputs from
-- finance) — they are registered through the portal once terms land;
-- this migration only guarantees the vendor rows exist.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Schema ────────────────────────────────────────────────────────
alter table blanket_lpos
  add column control_mode text not null default 'ceiling'
             check (control_mode in ('ceiling','lines'));

create table blanket_lines (
  id          bigint generated always as identity primary key,
  blanket_id  bigint not null references blanket_lpos(id),
  line_no     int    not null,
  item        text   not null check (item <> ''),
  item_id     bigint references items(id),
  unit        text   not null default '',
  agreed_rate numeric not null check (agreed_rate >= 0),
  agreed_qty  numeric not null check (agreed_qty > 0),
  unique (blanket_id, line_no)
);
create index blanket_lines_by_blanket on blanket_lines (blanket_id, line_no);
create trigger trg_pipeline_audit after insert or update or delete on blanket_lines
  for each row execute function pipeline_audit_row();
alter table blanket_lines enable row level security;
create policy "anon read" on blanket_lines for select to anon, authenticated using (true);

-- Call-offs know their line and quantity; requests carry proposed
-- blanket lines (jsonb) until approval materializes them.
alter table commitments
  add column blanket_line_id bigint references blanket_lines(id),
  add column call_off_qty    numeric check (call_off_qty > 0);
create index commitments_by_blanket_line on commitments (blanket_line_id);

alter table commitment_requests
  add column blanket_line_id bigint references blanket_lines(id),
  add column call_off_qty    numeric check (call_off_qty > 0),
  add column blanket_lines   jsonb not null default '[]';

-- Immutability guard covers the new commitment columns
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
     or new.blanket_line_id is distinct from old.blanket_line_id
     or new.call_off_qty is distinct from old.call_off_qty
     or new.origin is distinct from old.origin
     or new.source_ref is distinct from old.source_ref then
    raise exception 'commitments are immutable — use the revision flow';
  end if;
  return new;
end $$;

-- ── 2. Quantity drawdown per line ────────────────────────────────────
create or replace view blanket_line_drawdown as
select bl.id as line_id, bl.blanket_id, bl.line_no, bl.item, bl.item_id,
       bl.unit, bl.agreed_rate, bl.agreed_qty,
       coalesce(sum(c.call_off_qty) filter (where c.status <> 'ملغي'), 0) as drawn_qty,
       bl.agreed_qty
         - coalesce(sum(c.call_off_qty) filter (where c.status <> 'ملغي'), 0) as remaining_qty,
       bl.agreed_rate * bl.agreed_qty as agreed_value,
       bl.agreed_rate *
         coalesce(sum(c.call_off_qty) filter (where c.status <> 'ملغي'), 0) as drawn_value
from blanket_lines bl
left join commitments c on c.blanket_line_id = bl.id
group by bl.id;

-- ── 3. request_submit v3: line call-offs + blanket-with-lines + WHY ──
-- Signature grows (line call-off params + proposed lines) → drop the
-- 0020 overload so PostgREST resolution stays unambiguous.
drop function request_submit(text, text, text, bigint, bigint, text, numeric,
  bigint, boolean, text, text, date, date);

create or replace function request_submit(
  p_pin text, p_client_ref text, p_type text,
  p_cost_center_id bigint, p_vendor_id bigint,
  p_description text, p_value numeric,
  p_blanket_id bigint default null,
  p_is_blanket boolean default false,
  p_blanket_category text default '',
  p_blanket_rate_ref text default '',
  p_blanket_valid_from date default null,
  p_blanket_valid_to date default null,
  p_blanket_line_id bigint default null,
  p_qty numeric default null,
  p_blanket_lines jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_req  commitment_requests%rowtype;
  v_bl   blanket_lpos%rowtype;
  v_ln   blanket_lines%rowtype;
  v_line jsonb;
  v_remaining numeric;
  v_auto boolean := false;
  v_why  text := '';
  v_req_no text;
  v_cmt_no text;
  v_cmt_id bigint;
  v_chain text;
  v_value numeric := p_value;
  v_lines_sum numeric := 0;
  v_i int := 0;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null or not (v_user.requester or v_user.accountant) then
    return json_build_object('success', false, 'error', 'bad pin');
  end if;

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
  perform 1 from cost_centers where id = p_cost_center_id and active;
  if not found then return json_build_object('success', false, 'error', 'unknown cost center'); end if;
  if not pipeline_user_in_scope(v_user.id, p_cost_center_id) then
    return json_build_object('success', false, 'error', 'cost center out of scope');
  end if;
  perform 1 from vendors where id = p_vendor_id and active;
  if not found then return json_build_object('success', false, 'error', 'unknown vendor'); end if;

  v_chain := case when v_user.accountant then 'accountant_raised' else 'default' end;

  -- Blanket-with-lines: validate + total the proposed lines; the request
  -- value is the derived total (qty × rate), never a typed ceiling.
  if coalesce(p_is_blanket, false)
     and jsonb_array_length(coalesce(p_blanket_lines, '[]'::jsonb)) > 0 then
    for v_line in select * from jsonb_array_elements(p_blanket_lines) loop
      if coalesce(trim(v_line->>'item'), '') = ''
         or coalesce((v_line->>'qty')::numeric, 0) <= 0
         or coalesce((v_line->>'rate')::numeric, -1) < 0 then
        return json_build_object('success', false, 'error', 'blanket line needs item, qty > 0, rate >= 0');
      end if;
      v_lines_sum := v_lines_sum + (v_line->>'qty')::numeric * (v_line->>'rate')::numeric;
    end loop;
    v_value := v_lines_sum;
  end if;

  -- Line call-off: quantity against a specific blanket line; value is
  -- derived at the line's agreed rate (no rate variance possible here).
  if p_blanket_line_id is not null then
    if p_type <> 'LPO' or coalesce(p_is_blanket, false) then
      return json_build_object('success', false, 'error', 'call-off must be a plain LPO request');
    end if;
    if coalesce(p_qty, 0) <= 0 then
      return json_build_object('success', false, 'error', 'quantity required');
    end if;
    select * into v_ln from blanket_lines where id = p_blanket_line_id;
    if not found then return json_build_object('success', false, 'error', 'unknown blanket line'); end if;
    select * into v_bl from blanket_lpos where id = v_ln.blanket_id for update;
    if v_bl.status <> 'نشط' then
      return json_build_object('success', false, 'error', 'blanket not active');
    end if;
    if v_bl.vendor_id <> p_vendor_id then
      return json_build_object('success', false, 'error', 'vendor does not match blanket');
    end if;
    if current_date < v_bl.valid_from or current_date > v_bl.valid_to then
      return json_build_object('success', false, 'error', 'blanket outside validity window');
    end if;
    select remaining_qty into v_remaining from blanket_line_drawdown
      where line_id = p_blanket_line_id;
    v_value := round(p_qty * v_ln.agreed_rate, 3);
    if p_qty > v_remaining then
      if v_bl.breach_behavior = 'block' then
        return json_build_object('success', false, 'error', 'line quantity exceeded',
          'remainingQty', v_remaining);
      end if;
      v_why := 'تجاوز كمية بند المظلة — حُوّل للمكتب الرئيسي';
    else
      select route = 'auto' into v_auto from approval_rules
        where rule = 'call_off_within_blanket' and active;
      v_auto := coalesce(v_auto, false);
    end if;

  -- v1 ceiling call-off (staged: legacy blankets keep working)
  elsif p_blanket_id is not null then
    if p_type <> 'LPO' or coalesce(p_is_blanket, false) then
      return json_build_object('success', false, 'error', 'call-off must be a plain LPO request');
    end if;
    select * into v_bl from blanket_lpos where id = p_blanket_id for update;
    if not found or v_bl.status <> 'نشط' then
      return json_build_object('success', false, 'error', 'blanket not active');
    end if;
    if v_bl.control_mode = 'lines' then
      return json_build_object('success', false, 'error', 'blanket is line-controlled — pick a line');
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
      v_why := 'تجاوز سقف المظلة — حُوّل للمكتب الرئيسي';
    else
      select route = 'auto' into v_auto from approval_rules
        where rule = 'call_off_within_blanket' and active;
      v_auto := coalesce(v_auto, false);
    end if;
  end if;

  if coalesce(trim(p_description), '') = '' or coalesce(v_value, 0) <= 0 then
    return json_build_object('success', false, 'error', 'description and value required');
  end if;

  -- Slice 4: routing WHY flags, shown inline in the queue.
  if not v_auto then
    if exists (select 1 from approval_rules where rule = 'new_vendor' and active)
       and not exists (select 1 from commitments
                       where vendor_id = p_vendor_id and status <> 'ملغي') then
      v_why := trim(both ' · ' from v_why || ' · ' || 'مورد جديد — لا التزامات سابقة');
    end if;
    if exists (select 1 from approval_rules
               where rule = 'value_threshold' and active
                 and threshold is not null and v_value >= threshold) then
      v_why := trim(both ' · ' from v_why || ' · ' || 'فوق حد الاعتماد');
    end if;
  end if;

  v_req_no := next_pipeline_no('RF-' || p_type, 'RF-' || p_type);
  insert into commitment_requests (req_no, req_type, cost_center_id, vendor_id,
      description, estimated_value, blanket_id, blanket_line_id, call_off_qty,
      is_blanket, blanket_category, blanket_rate_ref, blanket_valid_from,
      blanket_valid_to, blanket_lines, requested_by, client_ref, office_note, chain)
  values (v_req_no, p_type, p_cost_center_id, p_vendor_id,
      trim(p_description), v_value,
      case when v_ln.id is not null then v_ln.blanket_id else p_blanket_id end,
      p_blanket_line_id, p_qty,
      coalesce(p_is_blanket, false),
      coalesce(p_blanket_category, ''), coalesce(p_blanket_rate_ref, ''),
      p_blanket_valid_from, p_blanket_valid_to,
      coalesce(p_blanket_lines, '[]'::jsonb),
      v_user.name, nullif(p_client_ref, ''), v_why, v_chain)
  returning * into v_req;

  if v_auto then
    v_cmt_no := next_pipeline_no(p_type, p_type);
    insert into commitments (number, ctype, request_id, cost_center_id, vendor_id,
        description, value, blanket_id, blanket_line_id, call_off_qty, created_by)
    values (v_cmt_no, p_type, v_req.id, p_cost_center_id, p_vendor_id,
        trim(p_description), v_value,
        coalesce(v_req.blanket_id, p_blanket_id), p_blanket_line_id, p_qty, 'تلقائي')
    returning id into v_cmt_id;
    -- line call-off → mirror the blanket line so delivery matching works
    if p_blanket_line_id is not null then
      insert into commitment_lines (commitment_id, line_no, item, item_id, qty, unit, rate, amount)
      values (v_cmt_id, 1, v_ln.item, v_ln.item_id, p_qty, v_ln.unit,
              v_ln.agreed_rate, round(p_qty * v_ln.agreed_rate, 3));
    end if;
    update commitment_requests set status = 'معتمد', decided_by = 'تلقائي',
      decided_at = now(), commitment_id = v_cmt_id,
      office_note = 'اعتماد تلقائي — سحب ضمن مظلة سارية'
      where id = v_req.id;
    return json_build_object('success', true, 'reqNo', v_req_no,
      'status', 'معتمد', 'commitmentNo', v_cmt_no, 'auto', true, 'value', v_value);
  end if;

  return json_build_object('success', true, 'reqNo', v_req_no,
    'status', v_req.status, 'value', v_value);
exception when unique_violation then
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
  bigint, boolean, text, text, date, date, bigint, numeric, jsonb) to anon, authenticated;

-- ── 4. request_decide v3: gates (0020) + line-blanket materialization ─
create or replace function request_decide(
  p_pin text, p_id bigint, p_decision text, p_note text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_req  commitment_requests%rowtype;
  v_gate approval_chain_gates%rowtype;
  v_next approval_chain_gates%rowtype;
  v_ln   blanket_lines%rowtype;
  v_line jsonb;
  v_may  boolean;
  v_cmt_no text;
  v_cmt_id bigint;
  v_bl_id  bigint;
  v_i int := 0;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;

  select * into v_req from commitment_requests where id = p_id for update;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_req.status <> 'قيد المراجعة' then
    return json_build_object('success', false, 'error', 'already decided');
  end if;
  if v_req.requested_by = v_user.name then
    return json_build_object('success', false, 'error', 'creator cannot approve own request');
  end if;

  select * into v_gate from approval_chain_gates
    where chain = v_req.chain and gate_no = v_req.current_gate and active;
  if not found then
    v_gate.capability := 'approver'; v_gate.label := 'المكتب الرئيسي';
  end if;
  v_may := case v_gate.capability
             when 'approver'         then v_user.approver
             when 'finance_approver' then v_user.finance_approver
             when 'accountant'       then v_user.accountant
             when 'admin'            then v_user.admin
           end;
  if not coalesce(v_may, false) then
    return json_build_object('success', false, 'error', 'gate needs ' || v_gate.capability);
  end if;

  if p_decision = 'reject' then
    if coalesce(trim(p_note), '') = '' then
      return json_build_object('success', false, 'error', 'note required');
    end if;
    update commitment_requests set status = 'مرفوض', decided_by = v_user.name,
      decided_at = now(), office_note = trim(p_note),
      gate_log = gate_log || jsonb_build_object('gate', v_req.current_gate,
        'capability', v_gate.capability, 'decision', 'reject',
        'by', v_user.name, 'at', now(), 'note', trim(p_note))
      where id = p_id;
    return json_build_object('success', true, 'status', 'مرفوض');
  end if;
  if p_decision <> 'approve' then
    return json_build_object('success', false, 'error', 'unknown decision');
  end if;

  update commitment_requests set
    gate_log = gate_log || jsonb_build_object('gate', v_req.current_gate,
      'capability', v_gate.capability, 'decision', 'approve',
      'by', v_user.name, 'at', now(), 'note', coalesce(trim(p_note), ''))
    where id = p_id;

  select * into v_next from approval_chain_gates
    where chain = v_req.chain and gate_no > v_req.current_gate and active
    order by gate_no limit 1;
  if found then
    update commitment_requests set current_gate = v_next.gate_no where id = p_id;
    return json_build_object('success', true, 'status', 'قيد المراجعة',
      'nextGate', v_next.gate_no, 'nextCapability', v_next.capability,
      'nextLabel', v_next.label);
  end if;

  -- Last gate cleared → mint.
  v_cmt_no := next_pipeline_no(v_req.req_type, v_req.req_type);
  insert into commitments (number, ctype, request_id, cost_center_id, vendor_id,
      description, value, blanket_id, blanket_line_id, call_off_qty, created_by)
  values (v_cmt_no, v_req.req_type, v_req.id, v_req.cost_center_id, v_req.vendor_id,
      v_req.description, v_req.estimated_value, v_req.blanket_id,
      v_req.blanket_line_id, v_req.call_off_qty, v_user.name)
  returning id into v_cmt_id;

  -- Approved line call-off → mirror the blanket line for delivery matching
  if v_req.blanket_line_id is not null then
    select * into v_ln from blanket_lines where id = v_req.blanket_line_id;
    insert into commitment_lines (commitment_id, line_no, item, item_id, qty, unit, rate, amount)
    values (v_cmt_id, 1, v_ln.item, v_ln.item_id, v_req.call_off_qty, v_ln.unit,
            v_ln.agreed_rate, round(v_req.call_off_qty * v_ln.agreed_rate, 3));
  end if;

  -- Blanket request → materialize header (+ lines when proposed)
  if v_req.is_blanket then
    insert into blanket_lpos (commitment_id, vendor_id, category, rate_ref,
        ceiling, valid_from, valid_to, control_mode)
    values (v_cmt_id, v_req.vendor_id, v_req.blanket_category, v_req.blanket_rate_ref,
        v_req.estimated_value, v_req.blanket_valid_from, v_req.blanket_valid_to,
        case when jsonb_array_length(v_req.blanket_lines) > 0 then 'lines' else 'ceiling' end)
    returning id into v_bl_id;
    for v_line in select * from jsonb_array_elements(v_req.blanket_lines) loop
      v_i := v_i + 1;
      insert into blanket_lines (blanket_id, line_no, item, item_id, unit, agreed_rate, agreed_qty)
      values (v_bl_id, v_i, trim(v_line->>'item'),
              nullif(v_line->>'item_id', '')::bigint,
              coalesce(v_line->>'unit', ''),
              (v_line->>'rate')::numeric, (v_line->>'qty')::numeric);
    end loop;
  end if;

  update commitment_requests set status = 'معتمد', decided_by = v_user.name,
    decided_at = now(), office_note = coalesce(trim(p_note), ''),
    commitment_id = v_cmt_id where id = p_id;
  return json_build_object('success', true, 'status', 'معتمد',
    'commitmentNo', v_cmt_no, 'blanketId', v_bl_id);
end $$;

-- ── 5. Vendor rows for the informal blankets (registration is one step
-- away once finance supplies rates/quantities) ────────────────────────
insert into vendors (name, kind, notes) values
  ('شركة البترول الوطنية الكويتية KNPC', 'supplier', 'مظلة ديزل / بيتومين — تسجيل المظلة عند ورود الأسعار'),
  ('جوهرة برلين',                        'supplier', 'مظلة ركام'),
  ('شركة فحص مواد خارجية',               'supplier', 'مظلة فحوصات مخبرية')
  on conflict do nothing;
insert into list_options (kind, value, sort_order) values
  ('blanket_category', 'نقل',    4),
  ('blanket_category', 'فحوصات', 5)
  on conflict do nothing;
