-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0008: add work orders from the WO portal (?wo)
-- ═══════════════════════════════════════════════════════════════════
-- work_order_add(): SECURITY DEFINER insert into the locked work_orders
-- reference table, plus an optional remap of dispatch/materials rows
-- logged under the placeholder work order '*' ("no order issued yet")
-- at the same location. Discipline decides which log gets remapped:
-- asphalt → dispatch_loads, civil → material_receipts, both → both.
-- Safe to run BEFORE the new frontend deploys (pure addition).

create or replace function work_order_add(
  p_project text, p_site text, p_block text, p_street text,
  p_discipline text, p_wo text, p_description text,
  p_map_star boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_project_id bigint;
  v_site_id    bigint;
  v_wo     text := trim(coalesce(p_wo, ''));
  v_block  text := trim(coalesce(p_block, ''));
  v_street text := trim(coalesce(p_street, ''));
  v_disp int := 0;
  v_mat  int := 0;
begin
  if v_wo = '' then
    return json_build_object('success', false, 'error', 'wo required');
  end if;
  if p_discipline not in ('asphalt', 'civil', 'both') then
    return json_build_object('success', false, 'error', 'bad discipline');
  end if;
  select id into v_project_id from projects where name = p_project;
  if v_project_id is null then
    return json_build_object('success', false, 'error', 'unknown project');
  end if;
  if coalesce(p_site, '') <> '' then
    select id into v_site_id from sites where project_id = v_project_id and site = p_site;
    if v_site_id is null then
      return json_build_object('success', false, 'error', 'unknown site');
    end if;
  end if;

  begin
    insert into work_orders (project_id, site_id, wo, discipline, block, street, status, description)
    values (v_project_id, v_site_id, v_wo, p_discipline, v_block, v_street, 'جاري',
            trim(coalesce(p_description, '')));
  exception when unique_violation then
    return json_build_object('success', false, 'error', 'duplicate');
  end;

  -- Remap the '*' placeholder rows this new order now covers.
  if p_map_star and coalesce(p_site, '') <> '' and (v_block <> '' or v_street <> '') then
    -- Dispatch (asphalt log): block rows keep the block in `block`;
    -- named-street rows store the street NAME in `block` (loc_type 'اسم الشارع').
    if p_discipline in ('asphalt', 'both') then
      update dispatch_loads set work_order = v_wo
       where work_order = '*' and project = p_project and site = p_site
         and ((v_block  <> '' and block = v_block  and loc_type <> 'اسم الشارع')
           or (v_street <> '' and block = v_street and loc_type =  'اسم الشارع'));
      get diagnostics v_disp = row_count;
    end if;
    -- Materials (civil log): named street lives in `street`, block in `block`.
    if p_discipline in ('civil', 'both') then
      update material_receipts set work_order = v_wo
       where work_order = '*' and project = p_project and site = p_site
         and ((v_block  <> '' and block  = v_block)
           or (v_street <> '' and street = v_street));
      get diagnostics v_mat = row_count;
    end if;
  end if;

  return json_build_object('success', true, 'mapped_dispatch', v_disp, 'mapped_materials', v_mat);
end $$;

grant execute on function work_order_add(text, text, text, text, text, text, text, boolean) to anon, authenticated;
