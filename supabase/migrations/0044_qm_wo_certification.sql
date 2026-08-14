-- ════════════════════════════════════════════════════════════════════
-- 0044 — QUANTITIES: per-work-order certification standing
--        (Fouad, 2026-08-14 — the «منتهي وجاري حسابه» worklist)
--
--   qm_wo_certification: for every work order, what has been executed
--   (طلبات التدقيق) against what the ministry has certified (دفعات
--   الوزارة), and the difference. A CLOSED work order with a positive
--   difference is finished work that is still waiting to be billed —
--   exactly the ministry's «منتهي وجاري حسابه» state, but derived from
--   the numbers, so a work order leaves the list by itself once its
--   certificates catch up.
--   Values are pre-نسبة العقد; the app applies the contract percentage.
-- Idempotent; safe to re-run. Paste after 0040/0041.
-- ════════════════════════════════════════════════════════════════════

create or replace view qm_wo_certification
with (security_invoker = true) as
select k.id                                as kashef_id,
       k.contract_id,
       k.kashef_no,
       k.closed,
       coalesce(e.executed_value, 0)       as executed_value,
       coalesce(c.certified_value, 0)      as certified_value,
       coalesce(e.executed_value, 0) - coalesce(c.certified_value, 0)
                                           as uncertified_value,
       c.last_cert_no,
       c.last_period_end
from qm_kashefs k
left join (
  select t.kashef_id, sum(tl.qty * bi.rate) as executed_value
  from qm_tadqiq t
  join qm_tadqiq_lines tl on tl.tadqiq_id = t.id
  join qm_bop_items bi on bi.id = tl.bop_item_id
  group by 1
) e on e.kashef_id = k.id
left join (
  select cl.kashef_id,
         sum(cl.qty * bi.rate) as certified_value,
         max(pc.cert_no)       as last_cert_no,
         max(pc.period_end)    as last_period_end
  from qm_pay_cert_lines cl
  join qm_bop_items bi on bi.id = cl.bop_item_id
  join qm_pay_certs pc on pc.id = cl.cert_id
  group by 1
) c on c.kashef_id = k.id;

revoke all on qm_wo_certification from anon;
grant select on qm_wo_certification to authenticated;
