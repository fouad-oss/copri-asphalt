-- ════════════════════════════════════════════════════════════════════
-- 0055 — QUANTITIES: data for the subcontractor management page
--        (the fast-follow 0045/0054 were building towards)
--
--   A. qm_sub_wo_totals — NEW view: per subcontractor × work order,
--      allocated vs executed vs remaining. This is the drill-down behind
--      the subcontractor list, which qm_sub_totals already summarises.
--   B. qm_sub_line_status += contract_id, APPENDED.
--
-- Why B matters: that view is keyed by kashef and vendor with no contract
-- anywhere, and a vendor can work on BOTH contracts — بحر الابداع is
-- vendors.id 10 on Hawalli AND on the Expressway. Reading it by vendor
-- alone therefore mixes the two projects. 0046 appended contract_id to the
-- five views that had the same problem; this is the sixth.
--
-- NOTE (42P16): `create or replace view` cannot rename or reorder existing
-- columns, so contract_id goes LAST on qm_sub_line_status.
-- Idempotent; safe to re-run. Paste after 0054.
-- ════════════════════════════════════════════════════════════════════

-- ── A. per subcontractor × work order ────────────────────────────────
-- Only rows where the subcontractor actually has something (an allocation
-- or executed work) — the cross join would otherwise produce one row per
-- vendor per work order.
create or replace view qm_sub_wo_totals
with (security_invoker = true) as
select k.contract_id,
       v.id                        as vendor_id,
       v.name                      as vendor_name,
       k.id                        as kashef_id,
       k.kashef_no,
       k.wo_no,
       k.area,
       k.location_text,
       k.loc_type,
       k.work_type,
       k.closed,
       k.wo_date,
       coalesce(a.alloc_value, 0)  as allocated_value,
       coalesce(e.exec_value, 0)   as executed_value,
       coalesce(a.n_lines, 0)      as allocated_lines,
       coalesce(e.n_tadqiq, 0)     as tadqiq_count,
       e.last_tadqiq_date
from qm_kashefs k
join qm_contracts c on c.id = k.contract_id
cross join (select id, name from vendors where qm_subcontractor) v
left join (
  select kl.kashef_id, al.vendor_id,
         sum(al.qty * bi.rate) as alloc_value,
         count(*)              as n_lines
  from qm_allocations al
  join qm_kashef_lines kl on kl.id = al.kashef_line_id
  join qm_bop_items bi on bi.id = kl.bop_item_id
  group by kl.kashef_id, al.vendor_id
) a on a.kashef_id = k.id and a.vendor_id = v.id
left join (
  select t.kashef_id, t.vendor_id,
         sum(tl.qty * bi.rate) as exec_value,
         count(distinct t.id)  as n_tadqiq,
         max(t.tadqiq_date) filter (where not t.opening) as last_tadqiq_date
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  group by t.kashef_id, t.vendor_id
) e on e.kashef_id = k.id and e.vendor_id = v.id
where coalesce(a.alloc_value, 0) <> 0 or coalesce(e.exec_value, 0) <> 0;

-- ── B. qm_sub_line_status += contract_id (APPENDED) ─────────────────
create or replace view qm_sub_line_status
with (security_invoker = true) as
select kl.kashef_id, kl.id as kashef_line_id, kl.bop_item_id,
       v.id as vendor_id, v.name as vendor_name,
       bi.bab, bi.band, bi.suffix, bi.description, bi.unit, bi.rate,
       kl.qty as kashef_qty,
       coalesce(al.qty, 0) as allocated,
       coalesce(ex.total, 0) as executed,
       k.contract_id                                    -- appended (see header)
from qm_kashef_lines kl
join qm_kashefs k on k.id = kl.kashef_id
join qm_bop_items bi on bi.id = kl.bop_item_id
cross join (select id, name from vendors where qm_subcontractor) v
left join qm_allocations al on al.kashef_line_id = kl.id and al.vendor_id = v.id
left join (
  select t.kashef_id, t.vendor_id, tl.bop_item_id, sum(tl.qty) as total
  from qm_tadqiq_lines tl join qm_tadqiq t on t.id = tl.tadqiq_id
  group by t.kashef_id, t.vendor_id, tl.bop_item_id
) ex on ex.kashef_id = kl.kashef_id and ex.vendor_id = v.id and ex.bop_item_id = kl.bop_item_id
where al.qty is not null or coalesce(ex.total, 0) > 0;

-- ── grants: same posture as every other qm_* object ─────────────────
do $qmsub$
declare o text;
begin
  foreach o in array array['qm_sub_wo_totals', 'qm_sub_line_status'] loop
    execute format('revoke all on %I from public, anon', o);
    execute format('grant select on %I to authenticated', o);
  end loop;
end $qmsub$;
