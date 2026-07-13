-- ═══════════════════════════════════════════════════════════════════
-- ONE-PASTE CLEANUP: remove the 2026-07-13 end-to-end pipeline TEST rows
-- ═══════════════════════════════════════════════════════════════════
-- The proving-slice test created the ONLY transaction rows the pipeline
-- has: RF-LPO-2026-001/002, LPO-2026-001/002, blanket #1, GRN-2026-001,
-- invoice TEST-INV-77, batch EXP-2026-001. This deletes them all and
-- resets the counters so production numbering starts at -001.
-- The guard below aborts if the tables hold anything beyond that test
-- footprint (i.e. real rows have started landing) — clean manually then.
-- Run once in the SQL editor, then delete this file and
-- PASTE_PENDING_0013-0016.sql from the repo.

do $$
begin
  if (select count(*) from commitment_requests) <> 2
     or (select count(*) from commitments) <> 2
     or (select count(*) from blanket_lpos) <> 1
     or (select count(*) from grns) <> 1
     or (select count(*) from supplier_invoices) <> 1
     or (select count(*) from export_batches) <> 1
     or exists (select 1 from commitment_requests where description not like 'TEST%') then
    raise exception 'tables hold more than the 2026-07-13 test footprint — review before cleaning';
  end if;
end $$;

delete from export_rows;
delete from export_batches;
delete from grns;
delete from supplier_invoices;
update commitment_requests set commitment_id = null, blanket_id = null;
delete from commitments where blanket_id is not null;  -- call-offs first (they point at the blanket)
delete from blanket_lpos;                              -- frees the blanket's parent LPO
delete from commitments;
delete from commitment_requests;
delete from pipeline_audit;                            -- test noise, incl. rows the deletes above just logged
delete from pipeline_counters;                         -- next allocation of every series = 001
