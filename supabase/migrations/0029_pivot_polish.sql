-- 0029_pivot_polish.sql — ACCOUNTING PIVOT step 8 (polish pass).
-- Fixes from the branch code review:
--   A. sn_page_token was anon-readable (0013 blanket policy) — hide it
--   B. note_recon gains bill_qty (single billing-qty source);
--      note_bundle_ready recreated; bundle_last_line per item PER PO
--      (brief Part 3); po_line_balance gains po_status
--   C. commitment_lines canonization trigger + backfill (typed register
--      lines get item_id, reviving the last-used-line suggestion)
--   D. bundle_create: qty override restricted to adjusting bundles;
--      note snapshots read note_recon (one source of truth)
--   E. po_lines_add: validate BEFORE inserting (no partial commits);
--      derived amounts rounded to 3 dp; po_entry same rounding
--   F. ref_payload: capture dropdown = items WITH a category (the 0024
--      SN asphalt seeds have category '' and must not appear on the
--      materials capture form — asphalt is captured via dispatch)

-- ── A. Token secrecy ─────────────────────────────────────────────────
-- The token-check functions are SECURITY DEFINER, so they still read it.
drop policy "anon read" on pipeline_settings;
create policy "anon read" on pipeline_settings for select to anon, authenticated
  using (key <> 'sn_page_token');

-- ── B. Views ─────────────────────────────────────────────────────────
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
       coalesce(r.weight_arrival, d.weight) as bill_qty
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
       m.quantity
from material_receipts m;

-- recreate: `select r.*` was expanded at creation time, so the new
-- bill_qty column doesn't reach the dependent view without this
create or replace view note_bundle_ready as
select r.* from note_recon r
where r.recon_status = 'matched'
  and not exists (select 1 from bundle_lines bl
    where bl.note_source = r.note_source
      and bl.note_ref = r.note_ref
      and not bl.is_adjustment);

-- Per item PER PO (brief: "the last-used PO line per item per PO").
drop view if exists bundle_last_line;
create view bundle_last_line as
select distinct on (cl.item_id, cl.commitment_id)
       cl.item_id, cl.commitment_id, b.commitment_line_id, b.created_at
from bundles b
join commitment_lines cl on cl.id = b.commitment_line_id
where cl.item_id is not null
order by cl.item_id, cl.commitment_id, b.created_at desc;

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
       c.sn_po,
       c.status         as po_status
from commitment_lines cl
join commitments c        on c.id = cl.commitment_id
left join bundles b       on b.commitment_line_id = cl.id
left join bundle_lines bl on bl.bundle_id = b.id
group by cl.id, c.id;

-- ── C. Register lines canonize like captures do (0025 pattern) ───────
create or replace function commitment_lines_canon() returns trigger
language plpgsql as $$
begin
  if new.item_id is null and coalesce(new.item, '') <> '' then
    select id into new.item_id from items
      where vendor_norm(name) = vendor_norm(new.item);
  end if;
  return new;
end $$;
create trigger trg_commitment_lines_canon before insert or update of item on commitment_lines
  for each row execute function commitment_lines_canon();

-- Backfill (the guard freezes lines of non-active commitments — lift it
-- for this one sweep, same switch the revision flow uses).
select set_config('app.pipeline_allow_rev', '1', false);
update commitment_lines cl set item_id = i.id
  from items i
  where cl.item_id is null and vendor_norm(cl.item) = vendor_norm(i.name);
select set_config('app.pipeline_allow_rev', '', false);

-- ── D. bundle_create: override = adjusting only; snapshots from
--      note_recon (the same bill_qty the UI shows) ────────────────────
create or replace function bundle_create(
  p_pin text, p_commitment_line_id bigint, p_source text, p_notes jsonb,
  p_adjusts bigint default null, p_remark text default ''
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user  pipeline_users%rowtype;
  v_line  commitment_lines%rowtype;
  v_cmt   commitments%rowtype;
  v_no    text;
  v_bid   bigint;
  v_n     jsonb;
  v_ref   bigint;
  v_qty   numeric; v_note_no text; v_date date; v_site text;
  v_added int := 0;
  v_src   text;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.admin) then
    return json_build_object('success', false, 'error', 'not an accountant');
  end if;
  if p_source not in ('asphalt','materials') then
    return json_build_object('success', false, 'error', 'bad source');
  end if;
  select * into v_line from commitment_lines where id = p_commitment_line_id;
  if not found then return json_build_object('success', false, 'error', 'line not found'); end if;
  select * into v_cmt from commitments where id = v_line.commitment_id;
  if v_cmt.status <> 'نشط' then return json_build_object('success', false, 'error', 'po not active'); end if;
  if p_adjusts is not null and not exists
     (select 1 from bundles where id = p_adjusts and status = 'published') then
    return json_build_object('success', false, 'error', 'adjusted bundle must be published');
  end if;
  if jsonb_array_length(coalesce(p_notes, '[]'::jsonb)) = 0 then
    return json_build_object('success', false, 'error', 'no notes');
  end if;

  perform set_config('app.pipeline_actor', v_user.name, true);
  v_src := case when p_source = 'asphalt' then 'dispatch' else 'material' end;
  v_no  := next_pipeline_no('BND', 'BND');
  insert into bundles (bundle_no, commitment_line_id, source, adjusts_bundle_id, notes, created_by)
  values (v_no, p_commitment_line_id, p_source, p_adjusts, coalesce(p_remark, ''), v_user.name)
  returning id into v_bid;

  for v_n in select * from jsonb_array_elements(p_notes) loop
    v_ref := (v_n->>'ref')::bigint;
    select nr.note_no, nr.delivery_date, nr.site, nr.bill_qty
      into v_note_no, v_date, v_site, v_qty
      from note_recon nr
     where nr.note_source = v_src and nr.note_ref = v_ref;
    if v_note_no is null then
      raise exception 'note %/% not found', v_src, v_ref;
    end if;
    -- qty override is the ADJUSTING mechanism only — a normal bundle
    -- always bills the note's own quantity
    if nullif(v_n->>'qty', '') is not null then
      if p_adjusts is null then
        raise exception 'qty override only on adjusting bundles (note %)', v_note_no;
      end if;
      v_qty := (v_n->>'qty')::numeric;
    end if;
    if v_qty is null or v_qty = 0 then
      raise exception 'note % has no billable quantity', v_note_no;
    end if;
    insert into bundle_lines (bundle_id, note_source, note_ref, note_no,
                              delivery_date, site, qty, amount)
    values (v_bid, v_src, v_ref, v_note_no, v_date, coalesce(v_site, ''),
            v_qty, coalesce(round(v_qty * v_line.rate, 3), 0));
    v_added := v_added + 1;
  end loop;

  return json_build_object('success', true, 'bundleNo', v_no, 'id', v_bid, 'lines', v_added);
exception
  when unique_violation then
    return json_build_object('success', false, 'error', 'note already bundled');
  when others then
    return json_build_object('success', false, 'error', SQLERRM);
end $$;

-- ── E. po_lines_add: validate first, insert after (a mid-loop return
--      used to COMMIT the earlier inserts); derived amounts 3 dp ───────
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

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if coalesce(trim(v_line->>'item'), '') = '' then
      return json_build_object('success', false, 'error', 'line item required');
    end if;
  end loop;

  perform set_config('app.pipeline_actor', v_user.name, true);
  select coalesce(max(line_no), 0) into v_no
    from commitment_lines where commitment_id = p_commitment_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_no   := v_no + 1;
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, round(v_qty * v_rate, 3));
    insert into commitment_lines (commitment_id, line_no, item, qty, unit, rate, amount, remarks)
    values (p_commitment_id, v_no, trim(v_line->>'item'), v_qty,
            coalesce(v_line->>'unit', ''), v_rate, v_amt, coalesce(v_line->>'remarks', ''));
    v_added := v_added + 1;
  end loop;
  if v_added = 0 then return json_build_object('success', false, 'error', 'no lines'); end if;
  return json_build_object('success', true, 'added', v_added);
end $$;

-- po_entry: same 3-dp rounding on derived line amounts (explicit ERP
-- amounts stay verbatim). Only the two round() calls changed vs 0026.
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

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty  := nullif(v_line->>'qty',  '')::numeric;
    v_rate := nullif(v_line->>'rate', '')::numeric;
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, round(v_qty * v_rate, 3));
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
    v_amt  := coalesce(nullif(v_line->>'amount', '')::numeric, round(v_qty * v_rate, 3));
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

-- ── F. Capture dropdown excludes the SN asphalt seeds ────────────────
-- Rule: the materials capture form lists items WITH a category; the
-- 0024 SN items (category '') stay transcription-only — asphalt is
-- captured through the dispatch channel, never as a site material.
create or replace function ref_payload() returns json
language sql stable as $$
select json_build_object(
  'version', '3',
  'settings', (select coalesce(json_object_agg(key, value), '{}'::json) from app_settings),
  'clients', (select coalesce(json_agg(json_build_object(
      'company', name, 'isCopri', is_copri) order by id), '[]'::json) from companies),
  'clientProjects', (select coalesce(json_agg(json_build_object(
      'company', c.name, 'project', p.name, 'contract', p.contract,
      'locationType', p.location_type, 'allowNamedStreet', p.allow_named_street) order by p.id), '[]'::json)
    from projects p join companies c on c.id = p.company_id where not c.is_copri),
  'clerks', (select coalesce(json_agg(json_build_object(
      'name', name, 'pin', pin) order by id), '[]'::json) from clerks),
  'drivers', (select coalesce(json_agg(json_build_object(
      'name', name, 'phone', phone, 'plate', plate, 'company', company,
      'copri', is_copri) order by id), '[]'::json) from drivers),
  'mixTypes', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'mix_type'),
  'plants', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'plant'),
  'transporters', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'transporter'),
  'rejectionReasons', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'rejection_reason'),
  'priorities', (select coalesce(json_agg(value order by sort_order, id), '[]'::json) from list_options where kind = 'milling_priority'),
  'projectInfo', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'company', c.name, 'contract', p.contract,
      'locationType', p.location_type, 'allowNamedStreet', p.allow_named_street) order by p.id), '[]'::json)
    from projects p join companies c on c.id = p.company_id where c.is_copri),
  'staff', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'name', s.name, 'pin', s.pin, 'phone', s.phone,
      'function', s.function, 'milling', s.milling) order by s.id), '[]'::json)
    from staff s join projects p on p.id = s.project_id),
  'sites', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'site', s.site) order by s.id), '[]'::json)
    from sites s join projects p on p.id = s.project_id),
  'streets', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'site', si.site, 'street', st.street) order by st.id), '[]'::json)
    from streets st join sites si on si.id = st.site_id join projects p on p.id = si.project_id),
  'workOrders', (select coalesce(json_agg(json_build_object(
      'project', p.name, 'site', coalesce(si.site, ''), 'block', w.block,
      'street', w.street, 'discipline', w.discipline, 'wo', w.wo,
      'status', w.status, 'description', w.description) order by w.id), '[]'::json)
    from work_orders w join projects p on p.id = w.project_id
    left join sites si on si.id = w.site_id),
  'suppliers', (select coalesce(json_agg(name order by id), '[]'::json) from suppliers),
  'subcontractors', (select coalesce(json_agg(name order by id), '[]'::json) from subcontractors),
  'catalog', (select coalesce(json_agg(json_build_object(
      'category', category, 'item', item, 'unit', unit) order by id), '[]'::json) from material_catalog),
  'managers', (select coalesce(json_agg(json_build_object(
      'name', name, 'pin', pin, 'role', role, 'projects', projects) order by id), '[]'::json) from milling_managers),
  'machines', (select coalesce(json_agg(json_build_object(
      'id', code, 'name', name, 'width', width) order by id), '[]'::json) from milling_machines),
  'canonItems', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name, 'category', category, 'unit', unit) order by category, name), '[]'::json)
    from items where active and category <> ''),
  'canonSuppliers', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name) order by name), '[]'::json)
    from vendors where active and kind = 'supplier'),
  'canonSubcontractors', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name) order by name), '[]'::json)
    from vendors where active and kind = 'subcontractor')
);
$$;
