-- 0027_bundling.sql — ACCOUNTING PIVOT step 5 (brief Part 3, views 3–4).
-- Bundle creation from matched notes, the draft→verified→published
-- lifecycle actions, adjusting bundles, the last-used-line suggestion,
-- and the transcription view (SN's field names — also the future SN
-- data page payload, step 7). All writes RPC-only; 0024's triggers
-- remain the enforcement layer, RPCs surface friendly errors.

-- ── A. note_recon grows item_id (appended — view contract additive) ──
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
       d.item_id
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
       m.item_id
from material_receipts m;

-- Matched notes not yet in a real (non-adjusting) bundle.
create or replace view note_bundle_ready as
select r.* from note_recon r
where r.recon_status = 'matched'
  and not exists (select 1 from bundle_lines bl
    where bl.note_source = r.note_source
      and bl.note_ref = r.note_ref
      and not bl.is_adjustment);

-- Last-used PO line per canonical item — the bundling suggestion
-- (accountant confirms; self-corrects because the latest bundle wins).
create or replace view bundle_last_line as
select distinct on (cl.item_id)
       cl.item_id, b.commitment_line_id, b.created_at
from bundles b
join commitment_lines cl on cl.id = b.commitment_line_id
where cl.item_id is not null
order by cl.item_id, b.created_at desc;

-- ── B. Transcription rows: SN's names, SN's order ────────────────────
-- Supplier | PO Number | PO Line | Item Code | Description | Qty | UOM |
-- Unit Price | Amount | Delivery Date | Supplier DN Number | Site.
-- Published rows of this view are the frozen data-page contract (step 7):
-- after freeze, additions go at the END only, nothing renamed/reordered.
create or replace view bundle_transcription as
select b.id            as bundle_id,
       b.bundle_no,
       b.status,
       b.source,
       b.adjusts_bundle_id,
       b.imported_flag,
       b.sn_reference,
       b.published_at,
       coalesce(nullif(vs.sn_name, ''), v.name)  as supplier,
       coalesce(nullif(c.sn_po, ''), c.number)   as po_number,
       cl.line_no                                as po_line,
       coalesce(isn.item_code, '')               as item_code,
       cl.item                                   as description,
       bl.qty,
       cl.unit                                   as uom,
       cl.rate                                   as unit_price,
       bl.amount,
       bl.delivery_date,
       bl.note_no                                as supplier_dn,
       bl.site,
       bl.id                                     as line_id
from bundles b
join bundle_lines bl     on bl.bundle_id = b.id
join commitment_lines cl on cl.id = b.commitment_line_id
join commitments c       on c.id = cl.commitment_id
join vendors v           on v.id = c.vendor_id
left join lateral (select sn_name from vendor_spectronova_ids
                    where vendor_id = v.id and sn_name <> '' limit 1) vs on true
left join lateral (select item_code from item_spectronova_ids
                    where item_id = cl.item_id limit 1) isn on true;

-- ── C. RPCs ──────────────────────────────────────────────────────────

-- Create a bundle (draft) from matched notes against ONE PO line.
-- p_notes: [{ref, qty?}] — qty override is for ADJUSTING bundles
-- (negative allowed); normal bundles bill the note's own quantity
-- (dispatch: received weight, falling back to dispatched for accepted-
-- unweighed notes). Amount = qty × line rate, KWD 3 dp.
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
    if v_src = 'dispatch' then
      select d.note, (d.ts at time zone 'Asia/Kuwait')::date, d.site,
             coalesce(r.weight_arrival, d.weight)
        into v_note_no, v_date, v_site, v_qty
        from dispatch_loads d
        left join lateral (select weight_arrival from receipts
                            where note = d.note order by ts desc limit 1) r on true
       where d.id = v_ref;
    else
      select m.receipt_id, (m.ts at time zone 'Asia/Kuwait')::date, m.site, m.quantity
        into v_note_no, v_date, v_site, v_qty
        from material_receipts m where m.id = v_ref;
    end if;
    if v_note_no is null then
      raise exception 'note %/% not found', v_src, v_ref;
    end if;
    v_qty := coalesce(nullif(v_n->>'qty', '')::numeric, v_qty);
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
grant execute on function bundle_create(text, bigint, text, jsonb, bigint, text)
  to anon, authenticated;

-- Lifecycle: draft→verified→published (verified→draft demotion allowed).
-- Publishing an empty bundle is refused; the 0024 guard enforces the
-- rest (transition order, published immutability).
create or replace function bundle_status_set(
  p_pin text, p_bundle_id bigint, p_status text
) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype; v_b bundles%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.admin) then
    return json_build_object('success', false, 'error', 'not an accountant');
  end if;
  select * into v_b from bundles where id = p_bundle_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if p_status = 'published'
     and not exists (select 1 from bundle_lines where bundle_id = p_bundle_id) then
    return json_build_object('success', false, 'error', 'empty bundle');
  end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  update bundles set
    status       = p_status,
    verified_by  = case when p_status = 'verified'  then v_user.name else verified_by end,
    verified_at  = case when p_status = 'verified'  then now()       else verified_at end,
    published_by = case when p_status = 'published' then v_user.name else published_by end,
    published_at = case when p_status = 'published' then now()       else published_at end
  where id = p_bundle_id;
  return json_build_object('success', true, 'status', p_status);
exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $$;
grant execute on function bundle_status_set(text, bigint, text) to anon, authenticated;

-- Delete a DRAFT bundle (guards refuse anything else).
create or replace function bundle_delete(p_pin text, p_bundle_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.admin) then
    return json_build_object('success', false, 'error', 'not an accountant');
  end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  delete from bundle_lines where bundle_id = p_bundle_id;
  delete from bundles where id = p_bundle_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end $$;
grant execute on function bundle_delete(text, bigint) to anon, authenticated;

-- Import confirmation (accountant side): records that SN staff have
-- transcribed the bundle — INVSI/… and/or Stock_Receipt/… references.
-- The token-gated SN-staff variant lands with the data page (step 7).
create or replace function bundle_import_confirm(
  p_pin text, p_bundle_id bigint, p_sn_reference text
) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype; v_b bundles%rowtype;
begin
  v_user := pipeline_auth(p_pin);
  if v_user.id is null then return json_build_object('success', false, 'error', 'bad pin'); end if;
  if not (v_user.accountant or v_user.admin) then
    return json_build_object('success', false, 'error', 'not an accountant');
  end if;
  select * into v_b from bundles where id = p_bundle_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  if v_b.status <> 'published' then
    return json_build_object('success', false, 'error', 'not published');
  end if;
  if coalesce(trim(p_sn_reference), '') = '' then
    return json_build_object('success', false, 'error', 'reference required');
  end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  update bundles set imported_flag = true, sn_reference = trim(p_sn_reference), imported_at = now()
  where id = p_bundle_id;
  return json_build_object('success', true);
end $$;
grant execute on function bundle_import_confirm(text, bigint, text) to anon, authenticated;
