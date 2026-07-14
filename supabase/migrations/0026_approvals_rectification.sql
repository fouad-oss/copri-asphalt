-- 0026_approvals_rectification.sql — ACCOUNTING PIVOT step 4 (brief
-- Part 3, views 1–2). Backend for the rebuilt approvals page: the SN PO
-- number on the register, the extended manual-entry RPC, and the
-- accountant's one-click follow-up marker. The rectification queue and
-- PO-line-balance UI read the 0024 views (note_recon / po_line_balance).

-- ── A. SN's own PO number on the register ────────────────────────────
-- Distinct from `number` (our {WO|LPO|CON}- / {cc}-PO/nnnn series) and
-- from `source_ref` (import: raw SN PO no; manual: idempotency uuid).
-- Soft-validated as PO/\d{3,5} in the UI — WARN on mismatch, never
-- block. Editable post-mint (not covered by the immutability guard).
alter table commitments add column sn_po text not null default '';
update commitments set sn_po = source_ref where origin = 'import' and sn_po = '';

-- ── B. po_entry v2: + SN PO number + PO date ─────────────────────────
-- Same-name overloads confuse PostgREST — drop the 0018 signature and
-- recreate with the two new defaulted params (0022 request_submit
-- precedent). Body otherwise unchanged.
drop function if exists po_entry(text, text, text, bigint, bigint, text, numeric, jsonb, text);

create or replace function po_entry(
  p_pin text, p_client_ref text, p_type text,
  p_cost_center_id bigint, p_vendor_id bigint,
  p_description text, p_value numeric,
  p_lines jsonb default '[]'::jsonb, p_note text default '',
  p_sn_po text default '', p_po_date date default null
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
      description, value, origin, source_ref, created_by, sn_po, po_date)
  values (v_no, p_type, null, p_cost_center_id, p_vendor_id,
      trim(p_description) || case when coalesce(p_note,'') <> '' then e'\n' || p_note else '' end,
      v_value, 'manual', coalesce(p_client_ref, ''), v_user.name,
      coalesce(trim(p_sn_po), ''), p_po_date)
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
grant execute on function po_entry(text, text, text, bigint, bigint, text, numeric, jsonb, text, text, date)
  to anon, authenticated;

-- ── B2. Append PO lines to an existing commitment ────────────────────
-- The SN imports carried PO HEADERS only — the register's lines are
-- typed by the accountant against the imported POs (brief: "PORegister,
-- manual entry by accountant"). Append-only; line_no continues from the
-- last; the 0018 guard already freezes lines on non-active commitments.
create or replace function po_lines_add(
  p_pin text, p_commitment_id bigint, p_lines jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user pipeline_users%rowtype;
  v_cmt  commitments%rowtype;
  v_line jsonb; v_no int; v_qty numeric; v_rate numeric; v_amt numeric;
  v_added int := 0;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.requester or v_user.admin) then
    return json_build_object('success', false, 'error', 'no capability');
  end if;
  select * into v_cmt from commitments where id = p_commitment_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_cmt.status <> 'نشط' then return json_build_object('success', false, 'error', 'not active'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  select coalesce(max(line_no), 0) into v_no
    from commitment_lines where commitment_id = p_commitment_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if coalesce(trim(v_line->>'item'), '') = '' then
      return json_build_object('success', false, 'error', 'line item required');
    end if;
    v_no   := v_no + 1;
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, v_qty * v_rate);
    insert into commitment_lines (commitment_id, line_no, item, qty, unit, rate, amount, remarks)
    values (p_commitment_id, v_no, trim(v_line->>'item'), v_qty,
            coalesce(v_line->>'unit', ''), v_rate, v_amt, coalesce(v_line->>'remarks', ''));
    v_added := v_added + 1;
  end loop;
  if v_added = 0 then return json_build_object('success', false, 'error', 'no lines'); end if;
  return json_build_object('success', true, 'added', v_added);
end $$;
grant execute on function po_lines_add(text, bigint, jsonb) to anon, authenticated;

-- ── C. Follow-up marker: the queue's one-click engineer chase-up ─────
create or replace function note_followup_set(
  p_pin text, p_source text, p_ref bigint, p_flag boolean
) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.admin) then
    return json_build_object('success', false, 'error', 'not an accountant');
  end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  if p_source = 'dispatch' then
    update dispatch_loads
       set followup_flag = p_flag, followup_at = case when p_flag then now() end
     where id = p_ref;
  elsif p_source = 'material' then
    update material_receipts
       set followup_flag = p_flag, followup_at = case when p_flag then now() end
     where id = p_ref;
  else
    return json_build_object('success', false, 'error', 'bad source');
  end if;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true, 'flag', p_flag);
end $$;
grant execute on function note_followup_set(text, text, bigint, boolean) to anon, authenticated;

-- ── D. po_line_balance carries the SN PO number (appended column) ────
create or replace view po_line_balance as
select cl.id            as line_id,
       c.id             as commitment_id,
       c.number         as po_number,
       c.po_date,
       c.vendor_id,
       cl.line_no,
       cl.item,
       cl.item_id,
       cl.unit,
       cl.rate,
       cl.qty           as order_qty,
       cl.remarks,
       coalesce(sum(bl.qty) filter (where b.status = 'published'), 0)            as published_qty,
       coalesce(sum(bl.qty) filter (where b.status in ('draft','verified')), 0)  as pending_qty,
       cl.qty - coalesce(sum(bl.qty), 0)                                         as remaining_qty,
       c.sn_po
from commitment_lines cl
join commitments c        on c.id = cl.commitment_id
left join bundles b       on b.commitment_line_id = cl.id
left join bundle_lines bl on bl.bundle_id = b.id
group by cl.id, c.id;
