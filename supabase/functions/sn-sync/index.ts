// Supabase Edge Function: sn-sync — SpectroNova → Supabase mirror.
//
// Deploy:  supabase functions deploy sn-sync --no-verify-jwt
//   (JWT verification is done here, not by the gateway, because the nightly
//    scheduler authenticates with a shared secret instead of a user JWT.)
// Secrets: supabase secrets set SN_API_EMAIL=… SN_API_PASSWORD=… SN_TENANT_ID=… SN_SYNC_SECRET=…
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected by the platform.)
//
// Callers:
//   • "Sync now" button — POST with the user's Supabase JWT (Authorization: Bearer <jwt>),
//     body {scope:'quick'|'full'}; allowed only when sn_sync_may_trigger() (active admin).
//   • Nightly schedule / self-continuation — header  x-sn-sync-secret: <SN_SYNC_SECRET>,
//     body {scope:'full'} or {runId, scope} to resume.
//
// Each invocation works for at most SN_SYNC_BUDGET_MS (default 100 s) and, if the run is
// not finished, re-invokes itself with the runId so the run continues in the background.
// The user gets an immediate JSON answer with the runId; progress is in sn_sync_runs.

// @ts-ignore — Deno resolves the sibling JS module
import { runSync } from './core.js';

declare const Deno: any;
declare const EdgeRuntime: any;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const env = {
    SN_API_EMAIL: Deno.env.get('SN_API_EMAIL'), SN_API_PASSWORD: Deno.env.get('SN_API_PASSWORD'), SN_TENANT_ID: Deno.env.get('SN_TENANT_ID'),
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  };
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = Deno.env.get('SN_SYNC_SECRET');
  const budgetMs = Number(Deno.env.get('SN_SYNC_BUDGET_MS')) || 100_000;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const scope = body.scope === 'full' ? 'full' : 'quick';

  // ── auth ──
  let trigger: 'manual' | 'schedule' = 'schedule';
  let triggeredBy = 'cron';
  const hdrSecret = req.headers.get('x-sn-sync-secret');
  if (secret && hdrSecret && hdrSecret === secret) {
    trigger = 'schedule';
  } else {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    // Ask Postgres, as the calling user, whether they are an active admin.
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/sn_sync_may_trigger`, {
      method: 'POST', headers: { apikey: anon!, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}',
    });
    const ok = r.ok && (await r.json()) === true;
    if (!ok) return json({ error: 'not an admin' }, 403);
    trigger = 'manual';
    // best-effort name for the run row
    try {
      const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: anon!, Authorization: auth } }).then((x) => x.json());
      triggeredBy = u?.email || 'admin';
    } catch { triggeredBy = 'admin'; }
    if (body.runId) return json({ error: 'resume is scheduler-only' }, 400);
  }

  const log = (m: string) => console.log(`[sn-sync] ${m}`);
  try {
    const res = await runSync({ env, trigger, triggeredBy, scope, runId: body.runId, budgetMs, log });
    if (res.resume && secret) {
      // continue in the background: fire the next invocation and return now
      const next = fetch(`${env.SUPABASE_URL}/functions/v1/sn-sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sn-sync-secret': secret, apikey: anon! },
        body: JSON.stringify({ runId: res.runId, scope }),
      }).catch((e: unknown) => console.error('continuation failed', e));
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(next);
    }
    return json({ ok: true, runId: res.runId, resume: res.resume, cursor: res.cursor, requests: res.requests, elapsedMs: res.elapsedMs, stages: res.stages, errors: res.errors.slice(0, 10) });
  } catch (e) {
    console.error('[sn-sync] failed:', (e as Error)?.message);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
