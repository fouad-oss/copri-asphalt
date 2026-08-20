-- ════════════════════════════════════════════════════════════════════
-- 0065 — SN-BACKED BUNDLING: bundles may point at a SpectroNova PO line
--        (Fouad, 2026-08-18) — Phase B of the SN sync brief (v2).
--        Requires 0064 (sn_* mirror). Paste AFTER the first full sync.
--
-- The PO LINE stays the matching unit. A bundle references EXACTLY ONE of
--   • commitment_lines.id (legacy app register)  — unchanged behaviour
--   • sn_po_lines.sn_po_line_id (SN mirror)     — new
-- Which source the accounting UI offers is a runtime switch:
--   pipeline_settings.po_source = {"source":"legacy"|"sn"}   (seeded 'legacy';
--   flip to 'sn' after the mirror is populated — one row, no redeploy).
-- Nothing legacy is deleted or modified: existing bundles keep their
-- commitment_line_id; the reconciliation view below is a REPORT.
-- ════════════════════════════════════════════════════════════════════

-- ── A. bundles: SN line reference (exactly one of the two) ───────────
alter table bundles
  alter column commitment_line_id drop not null,
  add column sn_po_line_id bigint references sn_po_lines(sn_po_line_id);
alter table bundles add constraint bundles_one_line check (
  (commitment_line_id is not null)::int + (sn_po_line_id is not null)::int = 1);
create index bundles_by_sn_line on bundles (sn_po_line_id) where sn_po_line_id is not null;

-- ── B. Views ─────────────────────────────────────────────────────────

-- Per SN PO LINE: ordered / received (Σ stock-receipt lines) / bundled
-- (published + pending, from app bundles) / remaining — the SN twin of
-- po_line_balance. app_item_id maps the SN item to OUR items master via
-- item_spectronova_ids.item_code (used for the "last-used line" hint).
create or replace view sn_po_line_balance as
select r.sn_po_line_id      as line_id,
       r.sn_po_id,
       r.po_number,
       r.is_fixed_asset,
       r.is_closed,
       r.supplier_contact_id,
       r.supplier_name,
       r.department,
       r.po_date,
       r.order_line_number  as line_no,
       r.item_description   as item,
       r.item_id            as sn_item_id,
       ai.item_id           as app_item_id,
       r.item_code,
       r.uom                as unit,
       r.unit_price         as rate,
       r.qty_ordered        as order_qty,
       r.received_qty,
       r.receipt_count,
       r.invoiced_qty,
       coalesce(bs.published_qty, 0) as published_qty,
       coalesce(bs.pending_qty, 0)   as pending_qty,
       r.qty_ordered - coalesce(bs.published_qty, 0) - coalesce(bs.pending_qty, 0) as remaining_qty
from sn_po_line_received r
left join lateral (
  select sum(bl.qty) filter (where b.status = 'published')            as published_qty,
         sum(bl.qty) filter (where b.status in ('draft','verified'))  as pending_qty
    from bundles b join bundle_lines bl on bl.bundle_id = b.id
   where b.sn_po_line_id = r.sn_po_line_id) bs on true
left join lateral (
  select isi.item_id from item_spectronova_ids isi
   where isi.item_code = r.item_code and r.item_code is not null limit 1) ai on true;

-- Last-used SN line per (app item, SN PO) — the bundling suggestion.
create or replace view sn_bundle_last_line as
select distinct on (ai.item_id, l.sn_po_id)
       ai.item_id, l.sn_po_id, b.sn_po_line_id, b.created_at
from bundles b
join sn_po_lines l  on l.sn_po_line_id = b.sn_po_line_id
join sn_items si    on si.item_id = l.item_id
join item_spectronova_ids ai on ai.item_code = si.item_code
order by ai.item_id, l.sn_po_id, b.created_at desc;

-- bundle_transcription: same FROZEN column contract, now a union of the
-- legacy join and the SN join (BundleDetail, SN data page, Excel export).
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
                    where item_id = cl.item_id limit 1) isn on true
where b.commitment_line_id is not null
union all
select b.id, b.bundle_no, b.status, b.source, b.adjusts_bundle_id, b.imported_flag, b.sn_reference, b.published_at,
       p.supplier_name,
       p.po_number,
       l.order_line_number,
       coalesce(si.item_code, ''),
       coalesce(nullif(l.item_description, ''), si.description, ''),
       bl.qty,
       l.uom,
       l.unit_price,
       bl.amount,
       bl.delivery_date,
       bl.note_no,
       bl.site,
       bl.id
from bundles b
join bundle_lines bl        on bl.bundle_id = b.id
join sn_po_lines l          on l.sn_po_line_id = b.sn_po_line_id
join sn_purchase_orders p   on p.sn_po_id = l.sn_po_id
left join sn_items si       on si.item_id = l.item_id
where b.sn_po_line_id is not null;
alter view bundle_transcription set (security_invoker = true);

-- Legacy ↔ SN reconciliation REPORT (no writes): every imported app PO
-- matched to the mirror by SN number, plus mirror POs the app never had.
create or replace view sn_legacy_po_recon as
with legacy as (
  select c.id as commitment_id, c.number as app_number, c.sn_po, c.status as app_status, c.po_date as app_po_date,
         v.name as app_vendor, c.value as app_value,
         (select count(*) from commitment_lines cl where cl.commitment_id = c.id) as app_lines,
         (select count(*) from bundles b join commitment_lines cl on cl.id = b.commitment_line_id where cl.commitment_id = c.id) as app_bundles,
         upper(regexp_replace(coalesce(c.sn_po, ''), '[^0-9A-Za-z/]', '', 'g')) as key
    from commitments c join vendors v on v.id = c.vendor_id
   where coalesce(c.sn_po, '') <> ''
), sn as (
  select p.sn_po_id, p.po_number, p.is_fixed_asset, p.is_closed, p.supplier_name, p.department, p.po_date, p.net_amount, p.line_count,
         upper(regexp_replace(p.po_number, '[^0-9A-Za-z/]', '', 'g')) as key
    from sn_purchase_orders p
)
select case when l.commitment_id is not null and s.sn_po_id is not null then 'matched'
            when l.commitment_id is not null then 'legacy_only' else 'sn_only' end as bucket,
       l.commitment_id, l.app_number, l.sn_po, l.app_status, l.app_po_date, l.app_vendor, l.app_value, l.app_lines, l.app_bundles,
       s.sn_po_id, s.po_number, s.is_fixed_asset, s.is_closed, s.supplier_name, s.department, s.po_date as sn_po_date, s.net_amount as sn_net_amount, s.line_count as sn_lines,
       case when l.commitment_id is not null and s.sn_po_id is not null and l.app_value is not null and s.net_amount is not null
            then round(s.net_amount - l.app_value, 3) end as value_delta
from legacy l full outer join sn s on s.key = l.key;

-- ── C. RPC: create a bundle against an SN PO line ────────────────────
-- Mirrors bundle_create (0029) — same auth, same note snapshotting, same
-- amount rule (qty × line rate, KWD 3 dp) — but the line is sn_po_lines
-- and the PO must be open (not closed) and, unless p_allow_fa, not a
-- fixed-asset PO.
create or replace function bundle_create_sn(
  p_pin text, p_sn_po_line_id bigint, p_source text, p_notes jsonb,
  p_adjusts bigint default null, p_remark text default '', p_allow_fa boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user  pipeline_users%rowtype;
  v_line  sn_po_lines%rowtype;
  v_po    sn_purchase_orders%rowtype;
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
  select * into v_line from sn_po_lines where sn_po_line_id = p_sn_po_line_id;
  if not found then return json_build_object('success', false, 'error', 'SN line not found'); end if;
  select * into v_po from sn_purchase_orders where sn_po_id = v_line.sn_po_id;
  if v_po.is_closed then return json_build_object('success', false, 'error', 'SN PO is closed'); end if;
  if v_po.is_fixed_asset and not p_allow_fa then
    return json_build_object('success', false, 'error', 'fixed-asset PO — not for bundling');
  end if;
  if v_line.unit_price is null then return json_build_object('success', false, 'error', 'SN line has no unit price'); end if;
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
  insert into bundles (bundle_no, sn_po_line_id, source, adjusts_bundle_id, notes, created_by)
  values (v_no, p_sn_po_line_id, p_source, p_adjusts, coalesce(p_remark, ''), v_user.name)
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
            v_qty, coalesce(round(v_qty * v_line.unit_price, 3), 0));
    v_added := v_added + 1;
  end loop;

  return json_build_object('success', true, 'bundleNo', v_no, 'id', v_bid, 'lines', v_added);
exception
  when unique_violation then
    return json_build_object('success', false, 'error', 'note already bundled');
  when others then
    return json_build_object('success', false, 'error', SQLERRM);
end $$;
grant execute on function bundle_create_sn(text, bigint, text, jsonb, bigint, text, boolean) to anon, authenticated;

-- ── D. Runtime switch (seeded legacy; flip after the first full sync) ─
insert into pipeline_settings (key, value, updated_by)
values ('po_source', '{"source":"legacy"}'::jsonb, 'migration 0065')
on conflict (key) do nothing;
-- To switch:  update pipeline_settings set value = '{"source":"sn"}', updated_by = 'Fouad' where key = 'po_source';
