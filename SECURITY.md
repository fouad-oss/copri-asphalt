# SECURITY.md — commitment-pipeline checklist (v2 brief)

Architecture note: the app is a static page talking to Supabase (PostgREST +
Auth + Storage). "Server-side" below = Postgres RPCs / RLS / triggers.
Some brief items translate accordingly: sessions are Supabase JWTs (not
cookies — no CSRF surface, but tokens live in localStorage, flagged below);
"parameterized queries" = PostgREST + plpgsql (no string-built SQL anywhere).

Legend: [x] done · [~] partial (see note) · [ ] open

## Authentication & sessions
- [x] Password hashing — Supabase Auth (bcrypt, managed) for office roles (0017).
- [x] PINs never client-readable: `pipeline_users` has RLS with no policies; login via SECURITY DEFINER RPCs only (0013/0017).
- [x] Field capture roles passwordless by design (v2 brief): raw captures only, no financial effect until an authenticated accountant maps + approves.
- [~] Sessions: Supabase JWT access+refresh; revocation = Supabase dashboard (disable user) + `active=false` kills the pipeline profile at next RPC. Tokens in localStorage, not httpOnly cookies — accepted for the static-page architecture, revisit if XSS surface grows.
- [ ] Idle timeout for office roles (client-side timer + refresh-token stop).
- [~] Login rate limiting — Supabase Auth has built-in limits for email/password; PIN fallback path has none (mitigated: PIN path dies when `auth_required` flips true).
- [ ] MFA (TOTP) REQUIRED for admin + finance-approver — Supabase supports enrollment; portal UI + enforcement is a pre-launch item (see DECISIONS.md).

## Authorization
- [x] Every pipeline write goes through SECURITY DEFINER RPCs; deny by default (bad pin / no capability = refusal) (0013–0020).
- [x] Cost-center scope enforced server-side: `pipeline_user_in_scope()` inside RPCs (0017+), never only in UI.
- [x] No role from URL params in the pipeline; `plantRole=manager` retirement scheduled with the auth cutover (`auth_required` flip).
- [x] Separation of duties: creator ≠ approver enforced in `request_decide`/chain engine (0020), not convention.
- [~] IDOR: pipeline reads are anon-readable by design v1 posture (no amounts hidden yet); write-path object checks verify ownership/scope. Tightening read RLS is the auth-cutover follow-up.

## Input, output, files
- [x] No string-built SQL (plpgsql + PostgREST everywhere).
- [x] All financial validation server-side in RPCs; client checks are convenience.
- [x] Duplicate-invoice guard at the constraint level; near-dup needs explicit force (0013/0018).
- [~] Output encoding: DOM built with textContent/createElement in the portal; innerHTML only with app-generated strings — keep it that way; CSP header pending (Vercel vercel.json headers, pre-launch).
- [x] CSRF: no cookie auth → no CSRF surface on state-changing RPCs.
- [~] Upload hardening: photos go to the public `material-receipts` bucket (v1 posture, receipt photos are low-sensitivity); size cap + client compression in the capture form. Authenticated serving + EXIF strip = pre-launch item.

## Secrets & infrastructure
- [x] No secrets in repo/bundle: anon key is public by design (RLS enforces); service key never committed; SpectroNova API creds (when they arrive) live server-side only.
- [x] HTTPS only (Vercel + Supabase); HSTS on Vercel by default.
- [x] DB not publicly exposed beyond PostgREST/RLS; app talks anon/authenticated roles only (no direct DB user).
- [x] Audit log append-only at the grant level: pipeline_audit RLS = select only; writes happen inside triggers.
- [ ] Backups: Supabase automated backups ON (verify plan tier); data-folder 3-2-1 + tested restore procedure — document before launch.
- [ ] Dependency hygiene: no npm deps by design; Python tools are stdlib+openpyxl.

## Monitoring & people
- [ ] Alerting on failed-login bursts / permission-denied bursts / creator==approver attempts / unusual exports (Supabase log drains or a nightly RPC report — pre-launch).
- [x] Errors: RPCs return structured `{success:false,error}` without stack traces.
- [x] Offboarding: `active=false` on pipeline_users blocks every RPC at next call; disable the auth user to kill refresh.
- [ ] Quarterly role-review report generated from config (pipeline_users × centers dump).

## Pre-launch pass
- [ ] Matrix test: every RPC × every role, expect deny outside scope.
- [ ] Flip `auth_required=true` (kills PIN fallback) after all office users are linked.
