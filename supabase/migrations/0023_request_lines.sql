-- ════════════════════════════════════════════════════════════════════
-- 0023 — per-unit config on EVERY PO request (user addition 2026-07-14):
-- RF requests (WO/LPO/CON) carry item lines — item (canonical items
-- master FK when picked, free text tolerated), qty, unit, agreed rate —
-- exactly like blankets. The request value derives from the lines
-- (qty × rate, never typed when lines exist), and final approval
-- materializes them as commitment_lines, so the three-way match and the
-- daily-batch mapping work on RF-born commitments from day one.
--
-- Lump-sum requests (no lines) keep working unchanged — the legacy
-- portal still submits them.
-- ════════════════════════════════════════════════════════════════════

alter table commitment_requests
  add column request_lines jsonb not null default '[]';

-- Signature grows (p_lines) → drop the 0022 overload so PostgREST
-- resolution stays unambiguous. Old clients calling with fewer named
-- args still resolve (every new arg has a default).
drop function request_submit(text, text, text, bigint, bigint, text, numeric,
  bigint, boolean, text, text, date, date, bigint, numeric, jsonb);

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
  p_blanket_lines jsonb default '[]'::jsonb,
  p_lines jsonb default '[]'::jsonb
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
  v_item_id bigint;
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

  -- Per-unit request lines: item / qty / unit / rate (+ optional item_id
  -- from the canonical items master). The value is the derived total.
  -- Mutually exclusive with blanket terms and line call-offs (those have
  -- their own line semantics).
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 0 then
    if coalesce(p_is_blanket, false) or p_blanket_line_id is not null or p_blanket_id is not null then
      return json_build_object('success', false, 'error', 'lines cannot combine with blanket terms or call-offs');
    end if;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if coalesce(trim(v_line->>'item'), '') = ''
         or coalesce((v_line->>'qty')::numeric, 0) <= 0
         or coalesce((v_line->>'rate')::numeric, -1) < 0 then
        return json_build_object('success', false, 'error', 'request line needs item, qty > 0, rate >= 0');
      end if;
      v_item_id := nullif(v_line->>'item_id', '')::bigint;
      if v_item_id is not null and not exists (select 1 from items where id = v_item_id) then
        return json_build_object('success', false, 'error', 'unknown item');
      end if;
      v_lines_sum := v_lines_sum + (v_line->>'qty')::numeric * (v_line->>'rate')::numeric;
    end loop;
    v_value := round(v_lines_sum, 3);
  end if;

  -- Blanket-with-lines: proposed lines total is the request value.
  if coalesce(p_is_blanket, false)
     and jsonb_array_length(coalesce(p_blanket_lines, '[]'::jsonb)) > 0 then
    v_lines_sum := 0;
    for v_line in select * from jsonb_array_elements(p_blanket_lines) loop
      if coalesce(trim(v_line->>'item'), '') = ''
         or coalesce((v_line->>'qty')::numeric, 0) <= 0
         or coalesce((v_line->>'rate')::numeric, -1) < 0 then
        return json_build_object('success', false, 'error', 'blanket line needs item, qty > 0, rate >= 0');
      end if;
      v_lines_sum := v_lines_sum + (v_line->>'qty')::numeric * (v_line->>'rate')::numeric;
    end loop;
    v_value := round(v_lines_sum, 3);
  end if;

  -- Line call-off: quantity against a blanket line, value derived at the
  -- line's agreed rate.
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

  -- v1 ceiling call-off (legacy blankets keep working)
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

  -- Routing WHY flags, shown inline in the queue.
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
      blanket_valid_to, blanket_lines, request_lines,
      requested_by, client_ref, office_note, chain)
  values (v_req_no, p_type, p_cost_center_id, p_vendor_id,
      trim(p_description), v_value,
      case when v_ln.id is not null then v_ln.blanket_id else p_blanket_id end,
      p_blanket_line_id, p_qty,
      coalesce(p_is_blanket, false),
      coalesce(p_blanket_category, ''), coalesce(p_blanket_rate_ref, ''),
      p_blanket_valid_from, p_blanket_valid_to,
      coalesce(p_blanket_lines, '[]'::jsonb), coalesce(p_lines, '[]'::jsonb),
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
  bigint, boolean, text, text, date, date, bigint, numeric, jsonb, jsonb) to anon, authenticated;

-- request_decide v4: final approval also materializes request_lines as
-- commitment_lines (the three-way match works on RF-born POs).
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
  v_qty numeric; v_rate numeric;
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

  -- Line call-off → mirror the blanket line for delivery matching
  if v_req.blanket_line_id is not null then
    select * into v_ln from blanket_lines where id = v_req.blanket_line_id;
    insert into commitment_lines (commitment_id, line_no, item, item_id, qty, unit, rate, amount)
    values (v_cmt_id, 1, v_ln.item, v_ln.item_id, v_req.call_off_qty, v_ln.unit,
            v_ln.agreed_rate, round(v_req.call_off_qty * v_ln.agreed_rate, 3));
  end if;

  -- Per-unit request lines (0023) → real commitment lines
  if jsonb_array_length(v_req.request_lines) > 0 then
    for v_line in select * from jsonb_array_elements(v_req.request_lines) loop
      v_i := v_i + 1;
      v_qty  := (v_line->>'qty')::numeric;
      v_rate := (v_line->>'rate')::numeric;
      insert into commitment_lines (commitment_id, line_no, item, item_id, qty, unit, rate, amount)
      values (v_cmt_id, v_i, trim(v_line->>'item'),
              nullif(v_line->>'item_id', '')::bigint,
              v_qty, coalesce(v_line->>'unit', ''), v_rate,
              round(v_qty * v_rate, 3));
    end loop;
  end if;

  -- Blanket request → materialize header (+ lines when proposed)
  if v_req.is_blanket then
    insert into blanket_lpos (commitment_id, vendor_id, category, rate_ref,
        ceiling, valid_from, valid_to, control_mode)
    values (v_cmt_id, v_req.vendor_id, v_req.blanket_category, v_req.blanket_rate_ref,
        v_req.estimated_value, v_req.blanket_valid_from, v_req.blanket_valid_to,
        case when jsonb_array_length(v_req.blanket_lines) > 0 then 'lines' else 'ceiling' end)
    returning id into v_bl_id;
    v_i := 0;
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
