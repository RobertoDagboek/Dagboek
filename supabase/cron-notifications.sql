-- ============================================================
--  Wake the sender up once a minute.
--
--  Run this AFTER migration 013 and AFTER the send-push function is deployed.
--  Replace CRON_SECRET_HERE with the same value you set in the function's
--  secrets - it is what stops anyone else being able to trigger it.
--
--  Once a minute, not once an hour: a task set for 09:07 has to fire at 09:07.
--  Each run is one small query, and on a quiet minute it sends nothing.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('dagboek-notify')
  where exists (select 1 from cron.job where jobname = 'dagboek-notify');

select cron.schedule('dagboek-notify', '* * * * *', $$
  select net.http_post(
    url     := 'https://raufnpdvboljqeowulhy.supabase.co/functions/v1/send-push',
    -- Supabase's gateway rejects any function call with no Authorization
    -- header, before the function is ever reached. The anon key satisfies it;
    -- x-cron-secret is what actually authorises the send.
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY_HERE","x-cron-secret":"CRON_SECRET_HERE"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- To check it is running:      select * from cron.job;
-- To see the last few runs:    select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it:                  select cron.unschedule('dagboek-notify');
