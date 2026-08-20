-- ════════════════════════════════════════════════════════════════════
-- SN SYNC — nightly schedule (paste in the SQL editor AFTER the edge
-- function is deployed and its secrets are set; NOT a numbered migration
-- because it embeds a project-specific secret).
--
-- Prereqs (Dashboard → Database → Extensions): pg_cron, pg_net enabled.
-- Replace <<SN_SYNC_SECRET>> with the same value you set via
--   supabase secrets set SN_SYNC_SECRET=…
-- and <<ANON_KEY>> with the project's publishable/anon key.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 02:30 Asia/Kuwait = 23:30 UTC (Kuwait is UTC+3, no DST)
select cron.unschedule('sn-sync-nightly') where exists (select 1 from cron.job where jobname = 'sn-sync-nightly');
select cron.schedule(
  'sn-sync-nightly',
  '30 23 * * *',
  $$
  select net.http_post(
    url     := 'https://abwsxqnppihrmkhydkai.supabase.co/functions/v1/sn-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', '<<ANON_KEY>>',
                 'x-sn-sync-secret', '<<SN_SYNC_SECRET>>'),
    body    := '{"scope":"full"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check:  select jobname, schedule, active from cron.job;
--         select * from cron.job_run_details order by start_time desc limit 5;
-- The function answers within ~100 s and continues the run by re-invoking
-- itself; watch progress in sn_sync_runs (cursor / stages) and sn_sync_status.
