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
