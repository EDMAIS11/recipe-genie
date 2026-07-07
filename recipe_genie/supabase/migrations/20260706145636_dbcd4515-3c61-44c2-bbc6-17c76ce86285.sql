-- Recurring import job (every 30 min). Requires the pg_cron and pg_net
-- extensions. On a fresh project enable them first (see MIGRAR-SUPABASE.md):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- Replace YOUR_APP_URL with your deployed URL and YOUR_SUPABASE_ANON_KEY with
-- your project's anon key.

-- Guarded so it doesn't fail on a fresh project where the job doesn't exist yet.
DO $$
BEGIN
  PERFORM cron.unschedule('import-recipes-30min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'import-recipes-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_APP_URL/api/public/hooks/import-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'YOUR_SUPABASE_ANON_KEY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
