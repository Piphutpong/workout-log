-- =============================================================================
-- Phase 4: รองเท้า, สภาพอากาศ, deload, การแจ้งเตือน (อีเมล/Web Push)
-- =============================================================================

alter table public.settings
  add column deload_week_start date,               -- วันจันทร์ของสัปดาห์ deload (null = ไม่ deload)
  add column weather_lat numeric(8,5) default 13.75630,  -- ตำแหน่งสำหรับดึงอุณหภูมิ (ค่าเริ่มต้น กรุงเทพฯ)
  add column weather_lon numeric(8,5) default 100.50180;

-- ระยะที่ใช้ไปของรองเท้า
create view public.shoe_usage with (security_invoker = true) as
select s.user_id, s.id as shoe_id,
       round(s.start_km + coalesce(sum(r.distance_km) filter (where r.completed <> 'skipped'), 0), 1) as km,
       count(r.id) filter (where r.completed <> 'skipped') as runs,
       max(r.date) as last_used
from public.shoes s
left join public.runs r on r.shoe_id = s.id
group by s.user_id, s.id, s.start_km;

-- ---------------------------------------------------------------------------
-- การแจ้งเตือน
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- กันส่งซ้ำ: 1 ประเภทต่อวัน
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  kind text not null check (kind in ('morning','evening','weekly','test')),
  channels text[] not null default '{}',
  title text,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, kind)
);

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions','notification_log'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ข้อมูลสำหรับข้อความแจ้งเตือนของผู้ใช้ (เรียกจาก Edge Function ด้วย service role เท่านั้น)
-- ตั้ง request.jwt.claims ภายใน transaction เพื่อให้ฟังก์ชันที่ใช้ auth.uid() ทำงานในนามผู้ใช้คนนั้น
create or replace function public.notification_payload(p_uid uuid, p_date date, p_weekly boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  res jsonb;
  prog record;
  lw date := date_trunc('week', p_date)::date - 7;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);

  res := jsonb_build_object(
    'date', p_date,
    'plan', public.today_plan(p_date),
    'weighed', exists (select 1 from public.body_weight where user_id = p_uid and date = p_date),
    'last_weight', (select weight_kg from public.body_weight where user_id = p_uid and date < p_date order by date desc limit 1),
    'food_items', (select count(*) from public.food_log where user_id = p_uid and date = p_date),
    'kcal', (select coalesce(round(sum(calories)), 0) from public.food_log where user_id = p_uid and date = p_date),
    'protein_g', (select coalesce(round(sum(protein_g)), 0) from public.food_log where user_id = p_uid and date = p_date),
    'weight_done', exists (select 1 from public.weight_sessions where user_id = p_uid and date = p_date),
    'run_done', exists (select 1 from public.runs where user_id = p_uid and date = p_date and completed <> 'skipped'),
    'checkin_done', exists (select 1 from public.daily_checkin where user_id = p_uid and date = p_date),
    'goals', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'current', current_value, 'target', target_value,
                                                            'pct', progress_pct, 'state', state)), '[]')
              from public.goal_progress(p_date) where status = 'active')
  );
  if p_weekly then
    res := res || jsonb_build_object(
      'week_start', lw,
      'review', (select to_jsonb(r) from public.weekly_reviews r where r.user_id = p_uid and r.week_start = lw),
      'stats', public.weekly_review_stats(lw),
      'weekly', (select to_jsonb(w) from public.weekly_summary w where w.user_id = p_uid and w.week_start = lw));
  end if;
  return res;
end $$;

revoke all on function public.notification_payload(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.notification_payload(uuid, date, boolean) to service_role;
