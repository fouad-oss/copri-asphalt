-- ═══════════════════════════════════════════════════════════════════
-- COPRI ASPHALT — 0010: reassign 9 mis-entered loads from ش59 to ش57
-- ═══════════════════════════════════════════════════════════════════
-- User-confirmed (2026-07-12): the 2026-07-06 Type I loads recorded on
-- مشرف شارع 59 actually went to شارع 57 — the plant clerks picked 59
-- because 57 was not yet a dropdown option. These are exactly the rows
-- Blueprint flagged as out-of-sequence (Type I after 59 reached Type II).
-- Named-street rows keep the street name in `block`.

update dispatch_loads
set block = '57',
    remarks = trim(both ' | ' from coalesce(remarks, '') || ' | تصحيح الموقع: شارع 57 (سُجل 59 خطأً عند الإدخال)')
where site = 'مشرف'
  and loc_type = 'اسم الشارع'
  and block = '59'
  and note in ('126106', '126108', '126111', '126114', '126117',
               '126119', '126122', '126126', '126127');
-- expected: UPDATE 9
