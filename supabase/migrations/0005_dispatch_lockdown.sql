-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0005: retire direct dispatch inserts
-- ═══════════════════════════════════════════════════════════════════
-- Run ONLY after the frontend that calls dispatch_submit() is live on main.
-- All dispatch writes now flow through the SECURITY DEFINER RPC (which
-- allocates the serial note), so a stale cached client typing manual note
-- numbers fails loudly instead of colliding with the sequence.

drop policy "anon insert" on dispatch_loads;
