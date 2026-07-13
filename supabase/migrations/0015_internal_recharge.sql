-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0015: commitment pipeline — internal recharge run
-- ═══════════════════════════════════════════════════════════════════
-- Monthly internal invoices from the profit centers to the consuming
-- cost centers, at POLICY RATES kept in a config table (rates are TBD
-- Phase 0 — the run refuses to generate until every item it needs has
-- an active rate, and returns the exact missing item strings to add).
--   • Plant  → per project: dispatched Copri tonnage, grouped by mix,
--     bucketed by Kuwait wall-clock month.
--   • Milling → per project: completed programs' area (completion ts
--     taken from the program's own audit trail), item = 'قشط <depth>'.
--   • Garage → no capture source in the app yet; joins the run when
--     one exists (rates table already accepts vendor handle 'garage').
-- Re-running a period REPLACES its drafts; issued invoices are never
-- touched (rerun skips them and reports the skip).

-- ── 1. Policy rates (config — office edits in the Table Editor) ──────
create table recharge_rates (
  id         bigint generated always as identity primary key,
  vendor_id  bigint not null references vendors(id),   -- internal: plant/milling/garage
  item       text not null,        -- mix type for the plant, 'قشط <عمق>' for milling
  unit       text not null default '',
  rate       numeric not null check (rate > 0),        -- KD per unit
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, item)
);
create trigger trg_updated before update on recharge_rates
  for each row execute function set_updated_at();

-- ── 2. Internal invoices ─────────────────────────────────────────────
create table internal_invoices (
  id             bigint generated always as identity primary key,
  inv_no         text not null unique,                 -- INT-2026-001
  period         text not null check (period ~ '^\d{4}-\d{2}$'),
  vendor_id      bigint not null references vendors(id),
  cost_center_id bigint not null references cost_centers(id),
  commitment_id  bigint references commitments(id),    -- the internal WO, when raised
  lines          jsonb not null default '[]'::jsonb,   -- [{item, qty, unit, rate, amount}]
  total          numeric not null check (total >= 0),
  status         text not null default 'مسودة' check (status in ('مسودة','صادر','ملغي')),
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  unique (period, vendor_id, cost_center_id)
);
create trigger trg_pipeline_audit after insert or update or delete on internal_invoices
  for each row execute function pipeline_audit_row();

do $$
begin
  execute 'alter table recharge_rates enable row level security';
  execute 'create policy "anon read" on recharge_rates for select to anon, authenticated using (true)';
  execute 'alter table internal_invoices enable row level security';
  execute 'create policy "anon read" on internal_invoices for select to anon, authenticated using (true)';
end $$;

-- ── 3. The run ───────────────────────────────────────────────────────
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
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
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
grant execute on function recharge_run(text, text) to anon, authenticated;

-- Draft → issued (issued invoices feed the export layer, 0016)
create or replace function internal_invoice_issue(p_pin text, p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_user pipeline_users%rowtype;
begin
  select * into v_user from pipeline_users where pin = p_pin and active and approver limit 1;
  if not found then return json_build_object('success', false, 'error', 'bad pin'); end if;
  perform set_config('app.pipeline_actor', v_user.name, true);
  update internal_invoices set status = 'صادر' where id = p_id and status = 'مسودة';
  if not found then return json_build_object('success', false, 'error', 'not a draft'); end if;
  return json_build_object('success', true);
end $$;
grant execute on function internal_invoice_issue(text, bigint) to anon, authenticated;
