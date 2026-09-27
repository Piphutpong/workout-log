-- =============================================================================
-- Workout Log — schema เริ่มต้น
-- ทุกตารางมี id (uuid PK), user_id, created_at, updated_at และเปิด RLS
-- ห้ามแก้ไฟล์นี้หลัง deploy แล้ว ให้เพิ่ม migration ใหม่แทน
-- =============================================================================

create extension if not exists pgcrypto;

-- updated_at อัตโนมัติ --------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- วันที่ "วันนี้" ตามเขตเวลา Asia/Bangkok
create or replace function public.bkk_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;

-- =============================================================================
-- 3.1 ตั้งค่าและเป้าหมาย
-- =============================================================================
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade unique,
  display_name text,
  sex text check (sex in ('male','female')),
  height_cm numeric(5,1),
  birth_date date,
  max_hr int not null default 186 check (max_hr between 120 and 230),
  target_weight_kg numeric(5,1) default 76,
  program_start_date date,
  default_rest_sec int not null default 90,
  weight_step_lb numeric(4,2) not null default 2.5,
  pinned_pain_parts text[] not null default '{ศอกซ้าย}',
  notify_email boolean not null default false,
  notify_morning_time time default '06:30',
  notify_evening_time time default '20:30',
  notify_weekly boolean not null default true,
  notify_push boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_type text not null check (goal_type in ('body','strength','run','consistency','plan')),
  title text not null,
  -- metric: weight_kg | pbf_pct | smm_kg | waist_cm | body_fat_kg | active_days_week
  --         | pain_avg7:<จุด> | e1rm:<exercise_id> | run_pace:<run_type> | run_distance_week | plan_completion
  metric text not null,
  start_value numeric,
  start_date date not null default public.bkk_today(),
  target_value numeric not null,
  target_date date,
  -- keep_above / keep_below = เป้าแบบ "ไม่ต่ำกว่า" / "ไม่เกิน"
  direction text not null check (direction in ('down','up','keep_above','keep_below')),
  status text not null default 'active' check (status in ('active','done','archived')),
  achieved_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 3.2 เวท
-- =============================================================================
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  measure_type text not null default 'reps' check (measure_type in ('reps','seconds','band')),
  muscle_group text,
  grip_intensive boolean not null default false, -- ท่าที่ใช้การบีบจับ (ใช้กับกฎความเจ็บศอก)
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.weight_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  description text,
  color text not null default '#3b82f6',
  is_warmup boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  program_id uuid not null references public.weight_programs on delete cascade,
  exercise_id uuid not null references public.exercises on delete restrict,
  sort_order int not null default 0,
  target_sets int not null default 3 check (target_sets between 1 and 20),
  target_reps int check (target_reps between 1 and 100),
  target_seconds int check (target_seconds between 1 and 3600),
  target_weight_lb numeric(6,2),
  rest_sec int,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.program_exercises (program_id, sort_order);

create table public.weight_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  program_id uuid references public.weight_programs on delete set null,
  duration_min int check (duration_min between 0 and 600),
  is_deload boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.weight_sessions (user_id, date desc);

create table public.weight_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid not null references public.weight_sessions on delete cascade,
  exercise_id uuid not null references public.exercises on delete restrict,
  date date not null,
  set_no int not null,
  weight_lb numeric(6,2),
  reps int check (reps between 0 and 200),
  seconds int check (seconds between 0 and 3600),
  band_level text check (band_level in ('เบา','กลาง','หนัก')),
  rpe numeric(3,1) check (rpe between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.weight_sets (user_id, exercise_id, date desc);
create index on public.weight_sets (session_id);

-- =============================================================================
-- 3.3 ตารางประจำสัปดาห์
-- =============================================================================
create table public.weekly_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = อาทิตย์
  activity text not null check (activity in ('weight','run','rest','active_recovery')),
  -- สำหรับวันวิ่งที่ไม่ใช้แผน
  run_type text check (run_type in ('easy','interval','long','tempo','threshold','vo2max')),
  title text,
  segments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_of_week)
);

create table public.weight_rotation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  sort_order int not null,
  program_id uuid not null references public.weight_programs on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.warmup_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  activity_type text not null check (activity_type in ('weight','run_easy','run_hard')),
  items jsonb not null default '[]', -- [{name, sec?, reps?, program_id?}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 3.4 แผนวิ่ง
-- run_plans / run_plan_days ที่ user_id เป็น null = แผนต้นแบบของระบบ (อ่านได้ทุกคน แก้ไม่ได้)
-- =============================================================================
create table public.run_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete cascade,
  slug text,
  name text not null,
  level text not null check (level in ('begin','performance')),
  goal_distance_km numeric(5,2),
  total_days int not null check (total_days between 1 and 400),
  source text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index run_plans_system_slug on public.run_plans (slug) where user_id is null;

create table public.run_plan_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references public.run_plans on delete cascade,
  day_no int not null check (day_no >= 1),
  week_no int not null check (week_no >= 1),
  workout_type text not null check (workout_type in (
    'rest','active_recovery','walk_run','easy','long','interval','tempo',
    'threshold','vo2max','strides','race_test','weights')),
  title text not null,
  description text,               -- ข้อความต้นฉบับ
  repeat_of_week int check (repeat_of_week >= 1),
  add_strides boolean not null default false,
  add_weights boolean not null default false,
  segments jsonb not null default '[]',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, day_no)
);

create table public.plan_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references public.run_plans on delete cascade,
  start_date date not null,
  status text not null default 'active' check (status in ('active','paused','done')),
  day_offset int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plan_enrollments_one_active on public.plan_enrollments (user_id) where status = 'active';

-- วันที่กด "ข้าม" หรือ "เลื่อน" (ใช้แสดง ✗ และ heatmap)
create table public.day_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  status text not null check (status in ('skipped','postponed')),
  activity text check (activity in ('weight','run','rest','active_recovery')),
  plan_day_id uuid references public.run_plan_days on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- =============================================================================
-- 3.5 การวิ่ง
-- =============================================================================
create table public.shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  start_date date not null default public.bkk_today(),
  start_km numeric(7,2) not null default 0,
  retire_km numeric(7,1) not null default 700,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  time_of_day time,
  plan_day_id uuid references public.run_plan_days on delete set null,
  run_type text not null check (run_type in (
    'easy','long','interval','tempo','threshold','vo2max','walk_run','strides','race_test','recovery')),
  distance_km numeric(6,2) check (distance_km >= 0 and distance_km <= 300),
  duration_sec int check (duration_sec >= 0 and duration_sec <= 86400),
  pace_sec_per_km numeric(7,1) generated always as (
    case when distance_km > 0 and duration_sec > 0 then round(duration_sec / distance_km, 1) end
  ) stored,
  avg_hr int check (avg_hr between 30 and 250),
  max_hr int check (max_hr between 30 and 250),
  rpe numeric(3,1) check (rpe between 1 and 10),
  feeling int check (feeling between 1 and 5),
  completed text not null default 'full' check (completed in ('full','partial','skipped')),
  shoe_id uuid references public.shoes on delete set null,
  temp_c numeric(4,1),
  humidity_pct numeric(4,1),
  source text not null default 'manual' check (source in ('manual','gpx','fit','tcx','strava')),
  external_id text, -- สำหรับเชื่อม Strava ในอนาคต
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.runs (user_id, date desc);
create index on public.runs (user_id, run_type, date desc);
create unique index runs_external on public.runs (user_id, source, external_id) where external_id is not null;

create table public.run_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  run_id uuid not null references public.runs on delete cascade,
  rep_no int not null,
  distance_m numeric(7,1),
  duration_sec int,
  avg_hr int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  run_id uuid not null references public.runs on delete cascade,
  km_no int not null,
  duration_sec int,
  avg_hr int,
  elevation_gain_m numeric(6,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 3.6 ร่างกายและการฟื้นตัว
-- =============================================================================
create table public.body_weight (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  weight_kg numeric(5,2) not null check (weight_kg between 20 and 300),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.body_comp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  weight_kg numeric(5,2),
  smm_kg numeric(5,2),
  body_fat_kg numeric(5,2),
  pbf_pct numeric(4,1),
  visceral_fat numeric(4,1),
  waist_cm numeric(5,1),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.body_comp (user_id, date desc);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  angle text not null check (angle in ('front','side','back')),
  storage_path text not null,
  weight_kg numeric(5,2),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_checkin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  energy int check (energy between 1 and 5),
  soreness int check (soreness between 1 and 5),
  resting_hr int check (resting_hr between 25 and 150),
  steps int check (steps between 0 and 200000),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.pain_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  body_part text not null, -- ศอกซ้าย/ศอกขวา/เข่า/หลังล่าง/ไหล่/ข้อเท้า/น่อง/อื่นๆ
  side text check (side in ('left','right','both')),
  score int not null check (score between 0 and 10),
  context text check (context in ('ระหว่างเวท','ระหว่างวิ่ง','ตื่นนอน','ทั้งวัน')),
  linked_session_id uuid references public.weight_sessions on delete set null,
  linked_run_id uuid references public.runs on delete set null,
  pinned boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pain_log (user_id, body_part, date desc);

-- =============================================================================
-- 3.7 โภชนาการ
-- =============================================================================
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  name_en text,
  brand text,
  serving_desc text,
  serving_g numeric(7,1),
  calories numeric(7,1) not null default 0,
  protein_g numeric(6,1) not null default 0,
  carb_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1),
  sodium_mg numeric(7,1),
  category text,
  source text not null default 'manual' check (source in ('seed','manual','barcode')),
  barcode text,
  is_estimate boolean not null default false,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.foods (user_id, name);
create unique index foods_barcode on public.foods (user_id, barcode) where barcode is not null;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  servings numeric(5,1) not null default 1,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id uuid not null references public.recipes on delete cascade,
  food_id uuid not null references public.foods on delete restrict,
  amount_g numeric(7,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  items jsonb not null default '[]', -- [{food_id?, recipe_id?, servings}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.food_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  meal text not null check (meal in ('เช้า','กลางวัน','เย็น','ว่าง','ก่อนออกกำลัง','หลังออกกำลัง')),
  food_id uuid references public.foods on delete set null,
  recipe_id uuid references public.recipes on delete set null,
  name text, -- snapshot ชื่อ (ใช้กับ quick add)
  servings numeric(5,2) not null default 1,
  calories numeric(7,1) not null default 0,
  protein_g numeric(6,1) not null default 0,
  carb_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1),
  sodium_mg numeric(7,1),
  time time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.food_log (user_id, date);

create table public.water_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  ml int not null check (ml between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.water_log (user_id, date);

create table public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  dose text,
  timing text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplement_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default public.bkk_today(),
  supplement_id uuid not null references public.supplements on delete cascade,
  taken boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, supplement_id)
);

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day_type text not null check (day_type in ('weight','run_easy','run_hard','rest')),
  kcal int not null,
  protein_g int not null,
  carb_g int not null,
  fat_g int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_type)
);

-- =============================================================================
-- Trigger updated_at + RLS ให้ทุกตาราง
-- =============================================================================
do $$
declare
  t text;
  owned text[] := array[
    'settings','goals','exercises','weight_programs','program_exercises','weight_sessions','weight_sets',
    'weekly_schedule','weight_rotation','warmup_routines','plan_enrollments','day_marks',
    'shoes','runs','run_intervals','run_splits',
    'body_weight','body_comp','progress_photos','daily_checkin','pain_log',
    'foods','recipes','recipe_items','meal_templates','food_log','water_log',
    'supplements','supplement_log','nutrition_targets'];
begin
  foreach t in array owned || array['run_plans','run_plan_days'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- ตารางส่วนตัว: เข้าถึงได้เฉพาะแถวของตัวเอง
  foreach t in array owned loop
    execute format($p$create policy "own rows" on public.%I for all to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;

  -- แผนวิ่ง: อ่านแผนระบบ (user_id null) ได้ แต่แก้ได้เฉพาะของตัวเอง
  foreach t in array array['run_plans','run_plan_days'] loop
    execute format($p$create policy "read own or system" on public.%I for select to authenticated
                     using (user_id is null or user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "write own" on public.%I for insert to authenticated
                     with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "update own" on public.%I for update to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "delete own" on public.%I for delete to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;
