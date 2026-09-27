-- =============================================================================
-- Phase 2: Dashboard / ความก้าวหน้า / สรุปรายสัปดาห์ + โปรแกรม "กระชับกล้ามเนื้อ (นายแบบ)"
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) program_exercises: superset + ช่วงจำนวนครั้ง (เช่น 15-20)
-- ---------------------------------------------------------------------------
alter table public.program_exercises
  add column superset_group text,
  add column target_reps_max int check (target_reps_max between 1 and 100);

-- ---------------------------------------------------------------------------
-- 2) สรุปรายสัปดาห์ที่สร้างแล้ว (ดูย้อนหลังได้)
-- ---------------------------------------------------------------------------
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,
  good jsonb not null default '[]',
  improve jsonb not null default '[]',
  stats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create trigger weekly_reviews_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();
alter table public.weekly_reviews enable row level security;
create policy "own rows" on public.weekly_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) โปรแกรมจากหนังสือ "ตัวอย่างโปรแกรมสำหรับกระชับกล้ามเนื้อ (นายแบบ)" หน้า 132
--    ทุกท่า 4 เซ็ต × 15-20 ครั้ง, ทำเป็น superset (ท่าคู่ไม่พักระหว่างกัน)
-- ---------------------------------------------------------------------------
create or replace function public.seed_toning_programs(p_uid uuid)
returns boolean language plpgsql set search_path = public as $$
declare
  e jsonb;
  ex_id uuid;
  p1 uuid; p2 uuid; p3 uuid;
  i int := 0;
begin
  if exists (select 1 from public.weight_programs where user_id = p_uid and name like 'นายแบบ%') then
    return false;
  end if;

  insert into public.weight_programs (user_id, name, description, color, sort_order)
  values (p_uid, 'นายแบบ 1: อก-หลัง-ท้อง',
          'กระชับกล้ามเนื้อ (หนังสือ หน้า 132) วันที่ 1 · 4×15-20 ครั้ง ทำเป็น superset · วันถัดไป Cardio 60 นาทีก่อนอาหารเช้า',
          '#ec4899', 11) returning id into p1;
  insert into public.weight_programs (user_id, name, description, color, sort_order)
  values (p_uid, 'นายแบบ 2: ขา-น่อง-ท้อง',
          'กระชับกล้ามเนื้อ วันที่ 3 · ต้นขาด้านหน้า-หลัง, น่อง · 4×15-20 ครั้ง superset · วันถัดไป Cardio 60 นาทีก่อนอาหารเช้า',
          '#14b8a6', 12) returning id into p2;
  insert into public.weight_programs (user_id, name, description, color, sort_order)
  values (p_uid, 'นายแบบ 3: ไหล่-แขน-ท้อง',
          'กระชับกล้ามเนื้อ วันที่ 5 · ไหล่, ต้นแขนด้านหน้า-หลัง · 4×15-20 ครั้ง superset (หนังสือระบุ "ท้อง" แต่ไม่มีท่าท้องในหน้านี้)',
          '#8b5cf6', 13) returning id into p3;

  for e in select * from jsonb_array_elements($j$[
    {"p":1,"ss":"1","name":"Flat dumbbell press","g":"อก","grip":true,"page":"P.48"},
    {"p":1,"ss":"1","name":"Bent over dumbbell row","g":"หลัง","grip":true,"page":"P.36"},
    {"p":1,"ss":"2","name":"Incline DB press","g":"อก","grip":true,"page":"P.52"},
    {"p":1,"ss":"2","name":"Incline dumbbell row","g":"หลัง","grip":true,"page":"P.38"},
    {"p":1,"ss":"3","name":"Flat dumbbell flyes","g":"อก","page":"P.50"},
    {"p":1,"ss":"3","name":"Straight-arm arc dumbbell row","g":"หลัง","grip":true,"page":"P.34"},
    {"p":1,"ss":"4","name":"Crunch","g":"ท้อง","page":"P.126"},
    {"p":1,"ss":"4","name":"Dumbbell knee up","g":"ท้อง","page":"P.128"},
    {"p":2,"ss":"1","name":"Dumbbell squat","g":"ขาหน้า","page":"P.114"},
    {"p":2,"ss":"1","name":"Sumo squat","g":"ขาหน้า/ขาใน","page":"P.118"},
    {"p":2,"ss":"2","name":"Dumbbell lunge","g":"ขาหน้า","page":"P.112"},
    {"p":2,"ss":"2","name":"Dumbbell stiff-leg deadlift","g":"ขาหลัง","grip":true,"page":"P.116"},
    {"p":2,"ss":"3","name":"Dumbbell standing calf raise","g":"น่อง","page":"P.120"},
    {"p":2,"ss":"3","name":"Dumbbell seated calf raise","g":"น่อง","page":"P.122"},
    {"p":3,"ss":"1","name":"Dumbbell shoulder press","g":"ไหล่","page":"P.62"},
    {"p":3,"ss":"1","name":"Dumbbell side lateral raise","g":"ไหล่","page":"P.66"},
    {"p":3,"ss":"2","name":"Dumbbell front raise","g":"ไหล่หน้า","page":"P.64"},
    {"p":3,"ss":"2","name":"Dumbbell rear lateral raise","g":"ไหล่หลัง","page":"P.70"},
    {"p":3,"ss":"3","name":"Alternate dumbbell curl","g":"ต้นแขนหน้า","grip":true,"page":"P.80"},
    {"p":3,"ss":"3","name":"One-arm dumbbell tricep extension","g":"ต้นแขนหลัง","page":"P.100"}
  ]$j$::jsonb) loop
    insert into public.exercises (user_id, name, measure_type, muscle_group, grip_intensive, note)
    values (p_uid, e->>'name', 'reps', e->>'g', coalesce((e->>'grip')::boolean, false), 'หนังสือ ' || (e->>'page'))
    on conflict (user_id, name) do update set name = excluded.name
    returning id into ex_id;

    i := i + 1;
    insert into public.program_exercises
      (user_id, program_id, exercise_id, sort_order, target_sets, target_reps, target_reps_max, rest_sec, superset_group)
    values (p_uid,
            case (e->>'p')::int when 1 then p1 when 2 then p2 else p3 end,
            ex_id, i, 4, 15, 20,
            -- ท่าแรกของคู่ไม่พัก (ไปท่าที่สองทันที) ท่าที่สองพัก 60 วิ
            case when i % 2 = 1 then 0 else 60 end,
            e->>'ss');
  end loop;
  return true;
end $$;

revoke all on function public.seed_toning_programs(uuid) from public, anon;
grant execute on function public.seed_toning_programs(uuid) to authenticated;

-- ผู้ใช้ใหม่: สร้างพร้อม settings (ตอน bootstrap_user)
create or replace function public.on_settings_created()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.seed_toning_programs(new.user_id);
  return new;
end $$;
create trigger settings_seed_toning after insert on public.settings
  for each row execute function public.on_settings_created();

-- ผู้ใช้เดิม
select public.seed_toning_programs(user_id) from public.settings;

-- ---------------------------------------------------------------------------
-- 4) PR (สถิติใหม่)
-- ---------------------------------------------------------------------------
create view public.pr_events with (security_invoker = true) as
select x.user_id, x.exercise_id, x.session_id, x.date, x.max_weight_lb, x.e1rm_lb, x.max_seconds,
       x.prev_best_e1rm, x.prev_best_weight, x.prev_best_seconds
from (
  select ep.*,
         max(ep.e1rm_lb) over w as prev_best_e1rm,
         max(ep.max_weight_lb) over w as prev_best_weight,
         max(ep.max_seconds) over w as prev_best_seconds,
         count(*) over w as prev_sessions
  from public.exercise_progress ep
  window w as (partition by ep.user_id, ep.exercise_id order by ep.date, ep.session_id
               rows between unbounded preceding and 1 preceding)
) x
where x.prev_sessions > 0
  and (x.e1rm_lb > x.prev_best_e1rm
       or x.max_weight_lb > x.prev_best_weight
       or x.max_seconds > x.prev_best_seconds);

create view public.run_pr_events with (security_invoker = true) as
select x.user_id, x.run_id, x.date, x.run_type, x.distance_km, x.pace_sec_per_km,
       case when x.pace_sec_per_km < x.prev_best_pace then 'pace' else 'distance' end as kind
from (
  select r.user_id, r.id as run_id, r.date, r.run_type, r.distance_km, r.pace_sec_per_km,
         min(r.pace_sec_per_km) over (partition by r.user_id, r.run_type order by r.date, r.created_at
                                      rows between unbounded preceding and 1 preceding) as prev_best_pace,
         max(r.distance_km) over (partition by r.user_id order by r.date, r.created_at
                                  rows between unbounded preceding and 1 preceding) as prev_longest
  from public.runs r
  where r.completed <> 'skipped' and r.distance_km >= 1 and r.pace_sec_per_km is not null
) x
where x.pace_sec_per_km < x.prev_best_pace or x.distance_km > x.prev_longest;

-- เวลาที่ดีที่สุดของระยะ (ใช้วิ่งที่ระยะ X ถึง X+15% แล้วเทียบเป็นเวลาที่ระยะ X)
create or replace function public.best_time_for(p_km numeric)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('sec', round(r.duration_sec * p_km / r.distance_km), 'date', r.date,
                            'distance_km', r.distance_km, 'run_id', r.id)
  from public.runs r
  where r.user_id = auth.uid() and r.completed <> 'skipped' and r.duration_sec > 0
    and r.distance_km between p_km and p_km * 1.15
  order by r.duration_sec / r.distance_km
  limit 1
$$;

create or replace function public.personal_records()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'exercises', coalesce((
      select jsonb_agg(x order by x.name) from (
        select e.id as exercise_id, e.name, e.measure_type,
               max(p.max_weight_lb) as max_weight_lb,
               max(p.e1rm_lb) as best_e1rm_lb,
               max(p.max_seconds) as max_seconds,
               (array_agg(p.date order by p.e1rm_lb desc nulls last, p.max_seconds desc nulls last, p.date))[1] as best_date
        from public.exercises e join public.exercise_progress p on p.exercise_id = e.id
        where e.user_id = auth.uid()
        group by e.id, e.name, e.measure_type) x), '[]'),
    'best_pace', coalesce((
      select jsonb_agg(jsonb_build_object('run_type', y.run_type, 'pace_sec_per_km', y.pace_sec_per_km,
                                          'date', y.date, 'distance_km', y.distance_km) order by y.run_type)
      from (select distinct on (run_type) run_type, pace_sec_per_km, date, distance_km
            from public.runs
            where user_id = auth.uid() and completed <> 'skipped' and pace_sec_per_km is not null and distance_km >= 1
            order by run_type, pace_sec_per_km) y), '[]'),
    'longest', (select jsonb_build_object('distance_km', distance_km, 'date', date, 'duration_sec', duration_sec)
                from public.runs where user_id = auth.uid() and completed <> 'skipped' and distance_km is not null
                order by distance_km desc, date limit 1),
    'best_5k', public.best_time_for(5),
    'best_10k', public.best_time_for(10),
    'best_21k', public.best_time_for(21.0975)
  )
$$;

-- ---------------------------------------------------------------------------
-- 5) volume รายสัปดาห์
-- ---------------------------------------------------------------------------
create view public.weekly_training with (security_invoker = true) as
select user_id, date_trunc('week', date)::date as week_start,
       sum(coalesce(weight_lb, 0) * coalesce(reps, 0)) as volume_lb,
       count(*) as sets,
       count(distinct session_id) as sessions
from public.weight_sets
group by 1, 2;

-- ---------------------------------------------------------------------------
-- 6) กิจกรรมรายวัน (แผน vs ทำจริง) — ใช้กับ heatmap / ความสม่ำเสมอ
-- ---------------------------------------------------------------------------
create or replace function public.day_activity(p_from date, p_to date)
returns table (date date, planned text, planned_workout text, weight_done boolean, run_done boolean,
               run_km numeric, mark text)
language sql stable set search_path = public as $$
  select d::date,
         tp->>'activity',
         tp->>'workout_type',
         exists (select 1 from public.weight_sessions w where w.user_id = auth.uid() and w.date = d::date),
         exists (select 1 from public.runs r where r.user_id = auth.uid() and r.date = d::date and r.completed <> 'skipped'),
         (select sum(r.distance_km) from public.runs r where r.user_id = auth.uid() and r.date = d::date and r.completed <> 'skipped'),
         (select m.status from public.day_marks m where m.user_id = auth.uid() and m.date = d::date)
  from generate_series(p_from, least(p_to, p_from + 400), interval '1 day') d
  cross join lateral (select public.today_plan(d::date) as tp) x
$$;

-- ---------------------------------------------------------------------------
-- 7) พัฒนาการเทียบกับวันอ้างอิง (p_ref = null → เทียบกับข้อมูลครั้งแรก)
-- ---------------------------------------------------------------------------
create or replace function public.progress_compare(p_ref date default null, p_today date default public.bkk_today())
returns jsonb language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_max_hr int;
  body jsonb := '{}';
  m text;
  cur numeric; ref numeric; ref_date date;
  first_date date;
  lifts jsonb; runs jsonb; recovery jsonb; pain jsonb;
  ref_end date;
begin
  select max_hr into v_max_hr from public.settings where user_id = uid;
  v_max_hr := coalesce(v_max_hr, 186);

  -- ร่างกาย: น้ำหนัก (เฉลี่ย 7 วัน)
  cur := public.metric_current('weight_kg', p_today);
  select min(date) into first_date from public.body_weight where user_id = uid;
  ref_end := coalesce(p_ref, first_date + 6);
  select round(avg(weight_kg), 2) into ref from public.body_weight
   where user_id = uid and date between ref_end - 6 and ref_end;
  if ref is null then
    select weight_kg, date into ref, ref_date from public.body_weight
     where user_id = uid and date <= coalesce(ref_end, p_today) order by date desc limit 1;
  end if;
  body := body || jsonb_build_object('weight_kg', jsonb_build_object('current', cur, 'ref', ref, 'good', 'down'));

  foreach m in array array['pbf_pct','smm_kg','waist_cm','body_fat_kg'] loop
    cur := public.metric_current(m, p_today);
    if p_ref is null then
      execute format('select %I from public.body_comp where user_id = $1 and %I is not null order by date limit 1', m, m)
        into ref using uid;
    else
      execute format('select %I from public.body_comp where user_id = $1 and %I is not null and date <= $2 order by date desc limit 1', m, m)
        into ref using uid, p_ref;
      if ref is null then
        execute format('select %I from public.body_comp where user_id = $1 and %I is not null order by date limit 1', m, m)
          into ref using uid;
      end if;
    end if;
    body := body || jsonb_build_object(m, jsonb_build_object(
      'current', cur, 'ref', ref, 'good', case when m = 'smm_kg' then 'up' else 'down' end));
  end loop;

  -- เวท: e1RM สูงสุดใน 28 วันล่าสุด เทียบ 28 วันก่อนวันอ้างอิง
  select coalesce(jsonb_agg(z order by z.name), '[]') into lifts from (
    select e.name, e.id as exercise_id,
           (select max(e1rm_lb) from public.exercise_progress p where p.exercise_id = e.id and p.date between p_today - 27 and p_today) as current,
           (select max(e1rm_lb) from public.exercise_progress p where p.exercise_id = e.id
              and p.date between coalesce(p_ref, f.first) - 27 and coalesce(p_ref, f.first + 27)) as ref
    from public.exercises e
    cross join lateral (select min(date) as first from public.exercise_progress p where p.exercise_id = e.id) f
    where e.user_id = uid and f.first is not null
  ) z where z.current is not null or z.ref is not null;

  -- volume ต่อสัปดาห์ (เฉลี่ย 4 สัปดาห์)
  select min(week_start) into first_date from public.weekly_training where user_id = uid;
  ref_end := coalesce(p_ref, first_date + 27);
  lifts := jsonb_build_object(
    'exercises', lifts,
    'weekly_volume', jsonb_build_object(
      'current', (select round(sum(volume_lb) / 4) from public.weekly_training where user_id = uid and week_start > p_today - 28),
      'ref', (select round(sum(volume_lb) / 4) from public.weekly_training where user_id = uid and week_start between ref_end - 27 and ref_end)));

  -- วิ่ง
  select min(date) into first_date from public.runs where user_id = uid and completed <> 'skipped';
  ref_end := coalesce(p_ref, first_date + 27);
  runs := jsonb_build_object(
    'easy_pace', jsonb_build_object(
      'current', (select round(avg(pace_sec_per_km)) from public.runs where user_id = uid and run_type = 'easy' and completed <> 'skipped' and date between p_today - 27 and p_today),
      'ref', (select round(avg(pace_sec_per_km)) from public.runs where user_id = uid and run_type = 'easy' and completed <> 'skipped' and date between ref_end - 27 and ref_end),
      'good', 'down'),
    'z2_pace', jsonb_build_object(
      'current', (select round(avg(pace_sec_per_km)) from public.runs where user_id = uid and completed <> 'skipped'
                   and avg_hr between v_max_hr * 0.6 and v_max_hr * 0.7 and date between p_today - 27 and p_today),
      'ref', (select round(avg(pace_sec_per_km)) from public.runs where user_id = uid and completed <> 'skipped'
                   and avg_hr between v_max_hr * 0.6 and v_max_hr * 0.7 and date between ref_end - 27 and ref_end),
      'hr_min', round(v_max_hr * 0.6), 'hr_max', round(v_max_hr * 0.7), 'good', 'down'),
    'weekly_km', jsonb_build_object(
      'current', (select round(coalesce(sum(distance_km), 0) / 4, 1) from public.runs where user_id = uid and completed <> 'skipped' and date between p_today - 27 and p_today),
      'ref', (select round(coalesce(sum(distance_km), 0) / 4, 1) from public.runs where user_id = uid and completed <> 'skipped' and date between ref_end - 27 and ref_end),
      'good', 'up'));

  -- ฟื้นตัว
  select min(date) into first_date from public.daily_checkin where user_id = uid;
  ref_end := coalesce(p_ref, first_date + 6);
  recovery := jsonb_build_object(
    'resting_hr', jsonb_build_object(
      'current', (select round(avg(resting_hr), 1) from public.daily_checkin where user_id = uid and date between p_today - 6 and p_today),
      'ref', (select round(avg(resting_hr), 1) from public.daily_checkin where user_id = uid and date between ref_end - 6 and ref_end),
      'good', 'down'),
    'sleep_hours', jsonb_build_object(
      'current', (select round(avg(sleep_hours), 1) from public.daily_checkin where user_id = uid and date between p_today - 6 and p_today),
      'ref', (select round(avg(sleep_hours), 1) from public.daily_checkin where user_id = uid and date between ref_end - 6 and ref_end),
      'good', 'up'));

  -- อาการเจ็บ: เฉลี่ย 7 วัน เทียบสัปดาห์ก่อน
  select coalesce(jsonb_agg(jsonb_build_object('part', part, 'current', c, 'ref', r, 'good', 'down') order by part), '[]') into pain from (
    select body_part as part,
           round(avg(score) filter (where date between p_today - 6 and p_today), 1) as c,
           round(avg(score) filter (where date between p_today - 13 and p_today - 7), 1) as r
    from public.pain_log where user_id = uid and date between p_today - 13 and p_today
    group by body_part) q;

  return jsonb_build_object('ref_date', p_ref, 'body', body, 'lifts', lifts, 'runs', runs, 'recovery', recovery, 'pain', pain);
end $$;

-- ---------------------------------------------------------------------------
-- 8) Achievements
-- ---------------------------------------------------------------------------
create or replace function public.achievements(p_today date default public.bkk_today())
returns jsonb language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  n_sessions int;
  total_km numeric;
  best_streak int;
  weight_done boolean;
  plans_done int;
begin
  select (select count(*) from public.weight_sessions where user_id = uid)
       + (select count(*) from public.runs where user_id = uid and completed <> 'skipped')
    into n_sessions;
  select coalesce(sum(distance_km), 0) into total_km from public.runs where user_id = uid and completed <> 'skipped';

  -- streak ยาวสุด (สัปดาห์ติดกันที่ออกกำลัง ≥ 5 วัน)
  select coalesce(max(cnt), 0) into best_streak from (
    select count(*) as cnt from (
      select week_start, week_start - (row_number() over (order by week_start) * 7)::int as grp
      from public.weekly_summary where user_id = uid and active_days >= 5) a
    group by grp) b;

  select exists (select 1 from public.goals where user_id = uid and metric = 'weight_kg' and status = 'done')
      or exists (select 1 from public.goal_progress(p_today) where metric = 'weight_kg' and state = 'done')
    into weight_done;

  select count(*) into plans_done from public.plan_enrollments e join public.run_plans p on p.id = e.plan_id
   where e.user_id = uid
     and ((case when e.status = 'done' then e.updated_at::date else p_today end) - e.start_date) + 1 - e.day_offset >= p.total_days;

  return jsonb_build_array(
    jsonb_build_object('key', 'sessions_10',  'title', 'ครบ 10 session',   'icon', '🥉', 'value', n_sessions, 'target', 10),
    jsonb_build_object('key', 'sessions_50',  'title', 'ครบ 50 session',   'icon', '🥈', 'value', n_sessions, 'target', 50),
    jsonb_build_object('key', 'sessions_100', 'title', 'ครบ 100 session',  'icon', '🥇', 'value', n_sessions, 'target', 100),
    jsonb_build_object('key', 'km_50',  'title', 'วิ่งรวม 50 กม.',  'icon', '👟', 'value', round(total_km, 1), 'target', 50),
    jsonb_build_object('key', 'km_100', 'title', 'วิ่งรวม 100 กม.', 'icon', '🏃', 'value', round(total_km, 1), 'target', 100),
    jsonb_build_object('key', 'km_500', 'title', 'วิ่งรวม 500 กม.', 'icon', '🚀', 'value', round(total_km, 1), 'target', 500),
    jsonb_build_object('key', 'streak_4', 'title', 'Streak 4 สัปดาห์', 'icon', '🔥', 'value', best_streak, 'target', 4),
    jsonb_build_object('key', 'weight_goal', 'title', 'ถึงเป้าน้ำหนัก', 'icon', '🎯', 'value', case when weight_done then 1 else 0 end, 'target', 1),
    jsonb_build_object('key', 'plan_done', 'title', 'จบแผนวิ่ง', 'icon', '🏅', 'value', plans_done, 'target', 1)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 9) ตัวเลขสำหรับสรุปรายสัปดาห์ + กฎคำแนะนำ (ข้อ 6)
-- ---------------------------------------------------------------------------
create or replace function public.weekly_review_stats(p_week_start date)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws date := p_week_start;
  we date := p_week_start + 6;
  d record;
  planned_w int := 0; planned_r int := 0; done_w int := 0; done_r int := 0; n_active int := 0; skipped int := 0;
  w0 numeric; w1 numeric; w2 numeric;
  km0 numeric; km1 numeric;
  rhr_week numeric; rhr_base numeric; sleep_week numeric;
  n int; wk date;
  res jsonb;
begin
  for d in select * from public.day_activity(ws, we) loop
    if d.planned = 'weight' then
      planned_w := planned_w + 1;
      if d.weight_done then done_w := done_w + 1; end if;
    elsif d.planned = 'run' then
      planned_r := planned_r + 1;
      if d.run_done then done_r := done_r + 1; end if;
    end if;
    if d.weight_done or d.run_done then n_active := n_active + 1; end if;
    if d.mark = 'skipped' then skipped := skipped + 1; end if;
  end loop;

  select avg(weight_kg) into w0 from public.body_weight where user_id = uid and date between ws and we;
  select avg(weight_kg) into w1 from public.body_weight where user_id = uid and date between ws - 7 and ws - 1;
  select avg(weight_kg) into w2 from public.body_weight where user_id = uid and date between ws - 14 and ws - 8;
  select coalesce(sum(distance_km), 0) into km0 from public.runs where user_id = uid and completed <> 'skipped' and date between ws and we;
  select coalesce(sum(distance_km), 0) into km1 from public.runs where user_id = uid and completed <> 'skipped' and date between ws - 7 and ws - 1;

  select avg(resting_hr), avg(sleep_hours) into rhr_week, sleep_week
    from public.daily_checkin where user_id = uid and date between ws and we;
  select avg(resting_hr) into rhr_base from public.daily_checkin where user_id = uid and date between ws - 28 and ws - 1;

  -- สัปดาห์ติดกันที่เล่นเวทโดยไม่มี deload (นับย้อนจากสัปดาห์นี้)
  n := 0; wk := ws;
  loop
    exit when n >= 52;
    exit when not exists (select 1 from public.weight_sessions where user_id = uid and date between wk and wk + 6);
    exit when exists (select 1 from public.weight_sessions where user_id = uid and date between wk and wk + 6 and is_deload);
    n := n + 1;
    wk := wk - 7;
  end loop;

  res := jsonb_build_object(
    'week_start', ws,
    'planned_weight', planned_w, 'done_weight', done_w,
    'planned_run', planned_r, 'done_run', done_r,
    'active_days', n_active, 'skipped_days', skipped,
    'weight_avg', round(w0, 2), 'weight_prev_avg', round(w1, 2), 'weight_prev2_avg', round(w2, 2),
    'run_km', round(km0, 1), 'run_km_prev', round(km1, 1),
    'resting_hr_avg', round(rhr_week, 1), 'resting_hr_baseline', round(rhr_base, 1),
    'sleep_avg', round(sleep_week, 1),
    'training_weeks_no_deload', n,
    'prs', (select count(*) from public.pr_events where user_id = uid and date between ws and we)
         + (select count(*) from public.run_pr_events where user_id = uid and date between ws and we),
    'protein_days_hit', (select count(*) from public.daily_nutrition where user_id = uid and date between ws and we and protein_hit),
    'food_days', (select count(*) from public.daily_nutrition where user_id = uid and date between ws and we),
    -- วันติดกันที่โปรตีนต่ำกว่าเป้า (ยาวสุดในสัปดาห์)
    'low_protein_streak', (select coalesce(max(cnt), 0) from (
        select count(*) as cnt from (
          select date, date - (row_number() over (order by date))::int as grp
          from public.daily_nutrition where user_id = uid and date between ws and we and protein_hit = false) a
        group by grp) b),
    -- วันติดกันที่ resting HR สูงกว่าค่าเฉลี่ย ≥ 5 bpm
    'high_rhr_streak', (select coalesce(max(cnt), 0) from (
        select count(*) as cnt from (
          select date, date - (row_number() over (order by date))::int as grp
          from public.daily_checkin where user_id = uid and date between ws - 2 and we
            and rhr_base is not null and resting_hr >= rhr_base + 5) a
        group by grp) b),
    -- วันติดกันที่นอน < 6 ชม.
    'low_sleep_streak', (select coalesce(max(cnt), 0) from (
        select count(*) as cnt from (
          select date, date - (row_number() over (order by date))::int as grp
          from public.daily_checkin where user_id = uid and date between ws - 2 and we and sleep_hours < 6) a
        group by grp) b),
    'pain', (select coalesce(jsonb_agg(jsonb_build_object(
                'part', bp,
                'avg', (select round(avg(score), 1) from public.pain_log where user_id = uid and body_part = bp and date between ws and we),
                'prev_avg', (select round(avg(score), 1) from public.pain_log where user_id = uid and body_part = bp and date between ws - 7 and ws - 1),
                'last3_high', (select count(*) = 3 and bool_and(score >= 4) from (
                                 select score from public.pain_log where user_id = uid and body_part = bp and date <= we
                                 order by date desc, created_at desc limit 3) t)
              ) order by bp), '[]')
             from (select distinct body_part as bp from public.pain_log where user_id = uid and date between ws - 7 and we) parts),
    -- ท่าที่ไม่พัฒนา 3 ครั้งติด (3 session ล่าสุดไม่ดีกว่าสถิติก่อนหน้า)
    'stalled_exercises', (select coalesce(jsonb_agg(e.name order by e.name), '[]')
        from public.exercises e
        where e.user_id = uid and e.active
          and exists (select 1 from public.exercise_progress p where p.exercise_id = e.id and p.date between we - 20 and we)
          and (select case when count(*) filter (where rn <= 3) = 3 and count(*) filter (where rn > 3) >= 1
                           then max(m) filter (where rn <= 3) <= max(m) filter (where rn > 3) else false end
               from (select coalesce(p.e1rm_lb, p.max_seconds, p.total_reps) as m,
                            row_number() over (order by p.date desc, p.session_id) as rn
                     from public.exercise_progress p where p.exercise_id = e.id and p.date <= we) q)),
    -- ท่าที่ใช้การบีบจับ (สำหรับกฎเจ็บศอก)
    'grip_exercises', (select coalesce(jsonb_agg(name order by name), '[]') from public.exercises
                       where user_id = uid and active and grip_intensive),
    'shoes_near_retire', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'km', round(s.start_km + coalesce(u.km, 0), 1), 'retire_km', s.retire_km)), '[]')
        from public.shoes s
        left join lateral (select sum(distance_km) as km from public.runs r where r.shoe_id = s.id and r.completed <> 'skipped') u on true
        where s.user_id = uid and s.active and s.start_km + coalesce(u.km, 0) >= s.retire_km * 0.9)
  );
  return res;
end $$;

revoke all on function public.best_time_for(numeric), public.personal_records(), public.day_activity(date, date),
  public.progress_compare(date, date), public.achievements(date), public.weekly_review_stats(date) from public, anon;
grant execute on function public.best_time_for(numeric), public.personal_records(), public.day_activity(date, date),
  public.progress_compare(date, date), public.achievements(date), public.weekly_review_stats(date) to authenticated;
