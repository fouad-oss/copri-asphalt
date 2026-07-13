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

