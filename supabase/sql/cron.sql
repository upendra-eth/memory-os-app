-- Run once in Supabase SQL editor after deploying the edge functions.
-- Schedules the nightly day-digest job (Phase 9) and weekly questions job (Phase 11).
--
-- Prereqs:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
-- The pg_net extension lets pg_cron POST to your edge function URL.

-- Replace these with values from Project Settings → API.
-- Use the service_role key (NOT the anon key).
\set project_url 'https://YOUR-PROJECT-REF.supabase.co'
\set service_key 'YOUR-SERVICE-ROLE-KEY'

-- Phase 9: nightly day digest at 23:45 IST  (= 18:15 UTC)
SELECT cron.schedule(
  'day-digests',
  '15 18 * * *',
  $$
  SELECT net.http_post(
    url := :'project_url' || '/functions/v1/generate-day-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || :'service_key'
    ),
    body := '{}'::jsonb
    
  );
  $$
);

-- Phase 11: weekly questions Sunday 09:00 IST  (= 03:30 UTC)
SELECT cron.schedule(
  'weekly-questions',
  '30 3 * * 0',
  $$
  SELECT net.http_post(
    url := :'project_url' || '/functions/v1/generate-questions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || :'service_key'
    ),
    body := '{}'::jsonb
  );
  $$
);
