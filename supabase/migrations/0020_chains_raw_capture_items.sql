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
