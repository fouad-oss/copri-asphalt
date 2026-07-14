-- 0025_capture_canonization.sql — ACCOUNTING PIVOT step 3 (brief Part 2,
-- "canonical masters"). Canonization is a MAPPING, never a rename:
-- historical capture rows keep their raw text AND gain a canonical_id
-- link; capture dropdowns show canonical entries only and store the id
-- going forward. Resolution is server-side (triggers norm-match the raw
-- text when the id is missing), so canonical links exist whatever client
-- version wrote the row. Going forward the items/vendors masters are the
-- editable source for capture dropdowns; material_catalog stays as the
-- pre-0025 fallback only.

-- ── A. Seed the items master from the materials catalog ──────────────
-- (idempotent — norm-unique names; the 0024 SN items stay untouched)
insert into items (name, unit, category)
select item, unit, category from material_catalog
on conflict do nothing;

-- ── B. Canonical links on the capture channels ───────────────────────
alter table material_receipts
  add column supplier_id      bigint references vendors(id),
  add column subcontractor_id bigint references vendors(id);
create index material_receipts_by_supplier on material_receipts (supplier_id);
create index material_receipts_by_subcontractor on material_receipts (subcontractor_id);

alter table dispatch_loads add column item_id bigint references items(id);
create index dispatch_loads_by_item on dispatch_loads (item_id);

-- Asphalt: the mix text maps deterministically onto the SN item.
-- Match longest first — 'Type III' contains 'Type I'. Mixes that are
-- none of the three (or a future emulsion mix) stay unmapped.
create or replace function asphalt_mix_item(p_mix text) returns bigint
language sql stable as $$
  select i.id from items i
  where vendor_norm(i.name) = vendor_norm(case
    when p_mix ilike '%type iii%' then 'Asphalt - Type III'
    when p_mix ilike '%type ii%'  then 'Asphalt - Type II'
    when p_mix ilike '%type i%'   then 'Asphalt - Type I'
  end)
$$;

create or replace function dispatch_loads_item() returns trigger
language plpgsql as $$
begin
  new.item_id := asphalt_mix_item(new.mix);
  return new;
end $$;
-- `update of mix` keeps receipt-status patches from re-firing this
create trigger trg_dispatch_item before insert or update of mix on dispatch_loads
  for each row execute function dispatch_loads_item();

-- Materials: null ids resolve from the raw text (norm-unique masters →
-- at most one match). A canonical dropdown name resolves to its id; free
-- text that matches nothing simply stays unlinked for the accountant.
create or replace function material_receipts_canon() returns trigger
language plpgsql as $$
begin
  if new.item_id is null and coalesce(new.material, '') <> '' then
    select id into new.item_id from items
      where vendor_norm(name) = vendor_norm(new.material);
  end if;
  if new.supplier_id is null and coalesce(new.supplier, '') <> '' then
    select id into new.supplier_id from vendors
      where vendor_norm(name) = vendor_norm(new.supplier);
  end if;
  if new.subcontractor_id is null and coalesce(new.subcontractor, '') <> '' then
    select id into new.subcontractor_id from vendors
      where vendor_norm(name) = vendor_norm(new.subcontractor);
  end if;
  return new;
end $$;
create trigger trg_material_canon before insert on material_receipts
  for each row execute function material_receipts_canon();

-- ── C. Backfill: historical rows gain their canonical links ──────────
-- (raw text untouched; re-running any of these is a no-op)
update dispatch_loads set item_id = asphalt_mix_item(mix) where item_id is null;

update material_receipts m set item_id = i.id
  from items i
  where m.item_id is null and vendor_norm(m.material) = vendor_norm(i.name);
update material_receipts m set supplier_id = v.id
  from vendors v
  where m.supplier_id is null and coalesce(m.supplier, '') <> ''
    and vendor_norm(m.supplier) = vendor_norm(v.name);
update material_receipts m set subcontractor_id = v.id
  from vendors v
  where m.subcontractor_id is null and coalesce(m.subcontractor, '') <> ''
    and vendor_norm(m.subcontractor) = vendor_norm(v.name);

-- ── D. ref_payload v3: canonical dropdown sources ride the existing
-- reference machinery (localStorage cache, boot overlay, 60s re-sync) —
-- ADDITIVE keys only, every prior key byte-identical (gotcha #2). ──────
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
    from items where active),
  'canonSuppliers', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name) order by name), '[]'::json)
    from vendors where active and kind = 'supplier'),
  'canonSubcontractors', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name) order by name), '[]'::json)
    from vendors where active and kind = 'subcontractor')
);
$$;
