#!/usr/bin/env node
// Local runner for the SN → Supabase sync (same engine as the edge function).
// Use for the first full backfill and for ad-hoc runs from a laptop.
//
//   node scripts/sn-sync-local.mjs                     # full run (masters + walks + invoices)
//   node scripts/sn-sync-local.mjs --scope quick       # forward walks + new docs only
//   node scripts/sn-sync-local.mjs --stages masters,po # restrict stages
//   node scripts/sn-sync-local.mjs --resume 12         # continue run id 12
//   node scripts/sn-sync-local.mjs --budget 300000     # stop after 5 min and leave a resumable cursor
//
// Reads .env.sn at repo root (gitignored): SN_API_EMAIL, SN_API_PASSWORD, SN_TENANT_ID,
// SUPABASE_SERVICE_ROLE_KEY, optional SUPABASE_URL (defaults to the project URL).
// Never prints secrets.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from '../supabase/functions/sn-sync/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.sn', '.env.local']) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const env = {
  SN_API_EMAIL: process.env.SN_API_EMAIL, SN_API_PASSWORD: process.env.SN_API_PASSWORD, SN_TENANT_ID: process.env.SN_TENANT_ID,
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://abwsxqnppihrmkhydkai.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`missing in .env.sn: ${missing.join(', ')}`); process.exit(2); }

const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s  ${m}`);
const stagesOnly = arg('--stages') ? arg('--stages').split(',') : null;
try {
  const res = await runSync({
    env, trigger: 'local', triggeredBy: process.env.USERNAME || process.env.USER || 'local',
    scope: arg('--scope', 'full'), runId: arg('--resume') ? Number(arg('--resume')) : undefined,
    budgetMs: Number(arg('--budget', 0)) || 0, stagesOnly, log,
  });
  console.log('\nRUN', res.runId, res.resume ? `PAUSED at ${JSON.stringify(res.cursor)} — resume with --resume ${res.runId}` : 'COMPLETE');
  console.table(res.stages.map((s) => ({ stage: s.stage, ms: s.ms, req: s.requests, fetched: s.fetched, ins: s.inserted, upd: s.updated, same: s.unchanged, miss: s.missed, err: s.errors, note: s.note })));
  console.log(`requests ${res.requests}, ${(res.elapsedMs / 1000).toFixed(0)}s, errors ${res.errors.length}`);
  if (res.errors.length) console.log(res.errors.slice(0, 20).join('\n'));
} catch (e) { console.error('sync failed:', e?.message || e); process.exit(1); }
