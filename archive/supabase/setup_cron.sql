-- ตั้งเวลาเรียก Edge Function "notify" ทุก 15 นาที (รันครั้งเดียวใน SQL Editor หรือ supabase db query)
-- แทน <NOTIFY_SECRET> ด้วยค่าเดียวกับ secret ของ function (supabase secrets set NOTIFY_SECRET=...)
-- และแทน <PROJECT_REF> ด้วย Reference ID ของโปรเจกต์ — ห้าม commit ค่าจริงลง repo
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<NOTIFY_SECRET>', 'notify_secret', 'x-notify-secret ของ Edge Function notify')
where not exists (select 1 from vault.secrets where name = 'notify_secret');

select cron.unschedule('workout-notify') where exists (select 1 from cron.job where jobname = 'workout-notify');
select cron.schedule(
  'workout-notify',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000)
  $$
);
