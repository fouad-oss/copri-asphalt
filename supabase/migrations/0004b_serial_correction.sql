-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0004b: correct the serial seed (hard-set, not derived)
-- ═══════════════════════════════════════════════════════════════════
-- 0004 seeded the sequence from max(numeric note), but historical data
-- contains fat-fingered carbon numbers (12518, 1256617, 12556400,
-- 12587500, 1258011, 12613700, and 6-digit typos 126594 / 128896 /
-- 152866), so the sequence started at 12613703 instead of 126186.
-- Deriving from data is unreliable — hard-set to the real carbon-book
-- position instead. The typo'd rows stay (historical records): when the
-- sequence eventually reaches one, dispatch_submit()'s collision loop
-- skips past it.

-- Remove the end-to-end test dispatch that exposed this (preview test,
-- 2026-07-10; it has no receipt, so the FK is not in play).
delete from dispatch_loads where note = '12613703' and client_ref is not null;

-- Next allocated note = 126186.
select setval('delivery_note_serial', 126185);
