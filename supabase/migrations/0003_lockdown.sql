-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0003: revoke broad anon write policies
-- ═══════════════════════════════════════════════════════════════════
-- Run ONLY after the frontend that uses the 0002 RPCs is live on main.
-- Receipts and all milling writes now flow through the SECURITY DEFINER
-- functions (confirm_receipt / milling_*), so the public key no longer
-- needs — and no longer gets — direct row update/insert on them.
-- What anon keeps: read everywhere, insert on dispatch_loads and
-- material_receipts (simple validated appends with unique-key guards).

drop policy "anon update" on dispatch_loads;   -- was any-column, any-row
drop policy "anon insert" on receipts;         -- now via confirm_receipt()
drop policy "anon update" on milling_programs; -- was any-column, any-row
drop policy "anon insert" on milling_programs; -- now via milling_submit()
