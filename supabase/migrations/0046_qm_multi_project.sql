-- ════════════════════════════════════════════════════════════════════
-- 0046 — QUANTITIES: second project (الطرق السريعة) + contract-scoped views
--        (Fouad, 2026-08-15: same module for the Expressway project, with
--         a project switcher in the header)
--
--   The schema was already per-contract (qm_kashefs.contract_id,
--   qm_bop_items.contract_id, unique(contract_id, kashef_no) so both
--   projects keep their own WO numbering). Two things were missing:
--
--   A. the Expressway contract row itself. Seeded from what the app
--      already knows about the project (dispatch reference: «كوبري —
--      الطرق السريعة», contract هـ ص / ط / 9).
--      ⚠ pct is seeded 0 and contract_value/start_date/duration_days are
--      left null ON PURPOSE — Fouad supplies the real header with the
--      backfill. A 0 percentage shows raw rates rather than quietly
--      applying Hawalli's 9%.
--
--   B. five dashboard views aggregated across ALL contracts because they
--      had no contract column (qm_sub_totals, qm_monthly_exec,
--      qm_wo_flags, qm_certified_totals, qm_exec_totals). Each now
--      carries contract_id so the screens can scope to the selected
--      project. Existing columns keep their names and meaning.
--
--   The BOP is per contract too: the Expressway price book gets seeded
--   alongside its backfill, so its work orders pick items from its own
--   جدول أسعار, never Hawalli's.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── A. the Expressway contract row ───────────────────────────────────
insert into qm_contracts (code, contract_no, name, contractor, pct)
values ('EXPW', 'هـ ص / ط / 9',
        'أعمال الطرق السريعة',
        'شركة كوبري للمشاريع الإنشائية', 0)
on conflict (code) do nothing;

-- ── B. contract-scoped rebuilds of the five global views ─────────────
create or replace view qm_sub_totals
with (security_invoker = true) as
select c.contract_id,
       v.id                        as vendor_id,
       v.name                      as vendor_name,
       coalesce(a.alloc_value, 0)  as allocated_value,
       coalesce(e.exec_value, 0)   as executed_value,
       e.last_tadqiq_date,
       coalesce(e.n, 0)            as tadqiq_count,
       coalesce(a.wo_count, 0)     as allocated_wos
from (select id from qm_contracts) c(contract_id)
cross join (select id, name from vendors where qm_subcontractor) v
left join (
  select k.contract_id, al.vendor_id,
         sum(al.qty * bi.rate) as alloc_value,
         count(distinct kl.kashef_id) as wo_count
  from qm_allocations al
  join qm_kashef_lines kl on kl.id = al.kashef_line_id
  join qm_kashefs k on k.id = kl.kashef_id
  join qm_bop_items bi on bi.id = kl.bop_item_id
  group by 1, 2
) a on a.contract_id = c.contract_id and a.vendor_id = v.id
left join (
  select k.contract_id, t.vendor_id,
         sum(tl.qty * bi.rate) as exec_value,
         max(t.tadqiq_date) filter (where not t.opening) as last_tadqiq_date,
         count(distinct t.id) as n
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  join qm_kashefs k on k.id = t.kashef_id
  group by 1, 2
) e on e.contract_id = c.contract_id and e.vendor_id = v.id;

create or replace view qm_monthly_exec
with (security_invoker = true) as
select k.contract_id,
       date_trunc('month', t.tadqiq_date)::date as month,
       t.opening,
       sum(tl.qty * bi.rate) as exec_value,
       count(distinct t.id)  as tadqiq_count
from qm_tadqiq t
join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
join qm_bop_items bi on bi.id = tl.bop_item_id
join qm_kashefs k on k.id = t.kashef_id
group by 1, 2, 3;

create or replace view qm_wo_flags
with (security_invoker = true) as
select k.contract_id,
       k.id as kashef_id,
       coalesce(la.over_alloc_lines, 0)      as over_alloc_lines,
       coalesce(la.exec_over_alloc_lines, 0) as exec_over_alloc_lines,
       coalesce(oo.out_of_wo_lines, 0)       as out_of_wo_lines
from qm_kashefs k
left join (
  select kl.kashef_id,
         count(*) filter (where coalesce(al.total, 0) > kl.qty + 0.0005) as over_alloc_lines,
         count(*) filter (where coalesce(ex.total, 0) > coalesce(al.total, 0) + 0.0005) as exec_over_alloc_lines
  from qm_kashef_lines kl
  left join (select kashef_line_id, sum(qty) as total from qm_allocations group by 1) al
    on al.kashef_line_id = kl.id
  left join (
    select t.kashef_id, tl.bop_item_id, sum(tl.qty) as total
    from qm_tadqiq t join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
    group by 1, 2
  ) ex on ex.kashef_id = kl.kashef_id and ex.bop_item_id = kl.bop_item_id
  group by 1
) la on la.kashef_id = k.id
left join (
  select t.kashef_id, count(*) as out_of_wo_lines
  from qm_tadqiq t join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  where tl.out_of_kashef
  group by 1
) oo on oo.kashef_id = k.id;

create or replace view qm_certified_totals
with (security_invoker = true) as
select k.contract_id, cl.kashef_id, cl.bop_item_id, sum(cl.qty) as qty_certified
from qm_pay_cert_lines cl
join qm_kashefs k on k.id = cl.kashef_id
group by 1, 2, 3;

create or replace view qm_exec_totals
with (security_invoker = true) as
select k.contract_id, t.kashef_id, tl.bop_item_id,
       sum(tl.qty) as qty_executed,
       max(t.tadqiq_date) as last_date
from qm_tadqiq t
join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
join qm_kashefs k on k.id = t.kashef_id
group by 1, 2, 3;

revoke all on qm_sub_totals, qm_monthly_exec, qm_wo_flags,
              qm_certified_totals, qm_exec_totals from anon;
grant select on qm_sub_totals, qm_monthly_exec, qm_wo_flags,
                qm_certified_totals, qm_exec_totals to authenticated;
