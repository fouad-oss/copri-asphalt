-- ════════════════════════════════════════════════════════════════════
-- 0069 — RETIRE THE LEGACY PO REGISTER (Fouad's decision, 2026-08-20)
--        SN sync brief v2, Phase B §3.2 follow-through.
--
-- The SpectroNova mirror is the PO source since 2026-08-19
-- (pipeline_settings.po_source = 'sn'); the reconciliation report
-- (SN_LEGACY_PO_RECONCILIATION.md) matched ALL 424 imported app POs to
-- the mirror (0 legacy-only; only PO/0378 carries an app line + bundle,
-- which keeps working through bundle_transcription's legacy branch).
--
-- Retirement = close, never delete: the 424 imported commitments flip
-- نشط → مغلق. Effects: they leave the legacy register selector and the
-- legacy bundling picker (both filter on نشط) and bundle_create refuses
-- them — history, bundles, and views are untouched. Manual pipeline
-- commitments (WO/LPO/CON, origin='manual') are NOT touched.
-- Reversible: set status back to 'نشط' on the same predicate.
--
-- Applied 2026-08-20 via `supabase db query --linked` on Fouad's
-- instruction; file kept for the migration record.
-- ════════════════════════════════════════════════════════════════════

update commitments
   set status = 'مغلق'
 where origin = 'import'
   and coalesce(sn_po, '') <> ''
   and status = 'نشط';

-- Expected: 424 rows (the full imported register).
-- Check:  select origin, status, count(*) from commitments group by 1,2 order by 1,2;
