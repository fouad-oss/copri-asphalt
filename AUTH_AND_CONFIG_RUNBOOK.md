# Auth cutover + finance config runbook — 2026-08-20

Prepared for the Open Items board: **Flip auth_required + create remaining office
users**, **Create Jimmy's account**, **Quantities QA account**, **Finance configs**,
**Blueprint map engineer rollout**. Everything here is copy-paste ready; nothing
below has been executed.

## A. Paste migration 0070 (once)

`supabase/migrations/0070_signup_pin_check.sql` — the anon PIN pre-check behind the
new **/app/signup** page. Without it the page shows a network error on submit.

## B. Onboard office users — they do it themselves now

Send each office user (Jimmy first) this link + their existing PIN:

> **app.copri.com/app/signup** — أدخل رمزك السري المعتاد + بريدك وكلمة مرور جديدة.
> الرمز يُستخدم مرة واحدة لربط حسابك، وبعدها الدخول دائماً بالبريد.

- The PIN must match a real, not-yet-linked `pipeline_users` row — no open sign-up.
- If Supabase has email confirmation ON, they confirm the email then use the page's
  "link" mode with the same details.
- **Jimmy specifically:** after he signs up, reassign the finance gate in the Table
  Editor — set `finance_approver = true` on his `pipeline_users` row and `false` on
  فؤاد الزغبي (interim holder since 0020).

**Quantities QA account** is different: `/app/quantities` accepts ANY Supabase Auth
email login (no pipeline_users row needed). Create it in Dashboard → Authentication →
Add user (email + password, auto-confirm), or let the QA use an existing account.

## C. Verify everyone is linked (SQL editor, read-only)

```sql
select name, email, auth_user_id is not null as linked,
       requester, approver, accountant, finance_approver, admin
from pipeline_users where active order by linked, name;
```

Every active row you expect to log in must show `linked = true` before step D.

## D. Flip auth_required

```sql
update pipeline_settings
   set value = 'true'::jsonb, updated_by = 'auth cutover'
 where key = 'auth_required';
```

- Kills PIN logins for the **pipeline/office RPCs only** (requests, approvals, GRN,
  accounting…). The field portals — dispatch clerks/engineers, capture receivers,
  milling, plant/finance desks — use their own staff tables and are **unaffected**.
- Rollback = same statement with `'false'::jsonb`.

## E. Finance configs (needs your numbers — fill and paste)

```sql
-- 1. Approval threshold (KD): requests at/above route to head office.
update approval_rules set threshold = /* KD */ null, active = true
 where rule = 'value_threshold';

-- 2. Internal recharge rates (KD per unit). recharge_run refuses and lists
--    the EXACT missing item strings — run it once from the portal to get the
--    list, then insert one row per item, e.g.:
-- insert into recharge_rates (vendor_id, item, unit, rate) values
--   ((select id from vendors where handle = 'plant'),   'Type I PMB',  'طن', 0.000),
--   ((select id from vendors where handle = 'milling'), 'قشط 5 سم',    'م2', 0.000);
```

**3. Real blankets (KNPC / Jawharat / transport / testing):** raise each as a blanket
request **with item lines** in the portal (vendor, category, rate ref, validity,
lines with agreed qty × rate). Final approval materializes `blanket_lpos` +
`blanket_lines` — no SQL needed. The 0022 seeds created the vendors only.

## F. Blueprint map — engineer rollout message (WhatsApp-ready)

> خريطة أعمال الأسفلت أصبحت متاحة: **app.copri.com/map**
> تعرض كل مواقع الفرش المنفذة على الخريطة — بحث بالقطعة/الشارع، وألوان حسب حالة
> التنفيذ، وتفاصيل كل مقطع بالضغط عليه. تعمل على الموبايل مباشرة بدون تحميل.
> أي موقع ناقص أو غير مطابق أخبروني عليه.

Send to the site engineers' group; no PIN needed (map is public-read).
