-- =============================================================================
-- Views / Functions สำหรับสรุปข้อมูลฝั่ง database (Dashboard โหลดเร็ว ไม่ดึงข้อมูลดิบ)
-- ทุก view ใช้ security_invoker เพื่อให้ RLS ของผู้เรียกมีผล
-- =============================================================================

-- ---------------------------------------------------------------------------
-- เวท
-- ---------------------------------------------------------------------------

-- ผลครั้งล่าสุดของแต่ละท่า (ทุกเซ็ตของ session ล่าสุดที่เล่นท่านั้น)
create view public.last_performance with (security_invoker = true) as
with latest as (
  select distinct on (s.user_id, s.exercise_id)
         s.user_id, s.exercise_id, s.session_id, s.date
  from public.weight_sets s
  order by s.user_id, s.exercise_id, s.date desc, s.created_at desc
)
select l.user_id, l.exercise_id, l.session_id, l.date,
       (select jsonb_agg(jsonb_build_object(
                 'set_no', w.set_no, 'weight_lb', w.weight_lb, 'reps', w.reps,
                 'seconds', w.seconds, 'band_level', w.band_level, 'rpe', w.rpe)
               order by w.set_no)
        from public.weight_sets w
        where w.session_id = l.session_id and w.exercise_id = l.exercise_id) as sets
from latest l;

-- Estimated 1RM (Epley): w × (1 + reps/30), reps = 1 ใช้น้ำหนักจริง
create or replace function public.epley_1rm(p_weight numeric, p_reps int)
returns numeric language sql immutable as $$
  select case
    when p_weight is null or p_weight <= 0 or p_reps is null or p_reps <= 0 then null
    when p_reps = 1 then p_weight
    else round(p_weight * (1 + p_reps / 30.0), 1)
  end
$$;

-- น้ำหนักสูงสุด / e1RM / volume ต่อ session ต่อท่า
create view public.exercise_progress with (security_invoker = true) as
select s.user_id, s.exercise_id, s.session_id, s.date,
       max(s.weight_lb)                                        as max_weight_lb,
       max(public.epley_1rm(s.weight_lb, s.reps))              as e1rm_lb,
       sum(coalesce(s.weight_lb, 0) * coalesce(s.reps, 0))     as volume_lb,
       sum(coalesce(s.reps, 0))                                as total_reps,
       max(s.seconds)                                          as max_seconds,
       count(*)                                                as set_count
from public.weight_sets s
group by s.user_id, s.exercise_id, s.session_id, s.date;

-- ---------------------------------------------------------------------------
-- วิ่ง
-- ---------------------------------------------------------------------------
create view public.last_run_by_type with (security_invoker = true) as
select distinct on (r.user_id, r.run_type)
       r.user_id, r.run_type, r.id as run_id, r.date, r.distance_km, r.duration_sec,
       r.pace_sec_per_km, r.avg_hr, r.max_hr, r.temp_c, r.humidity_pct
from public.runs r
where r.completed <> 'skipped' and r.distance_km > 0
order by r.user_id, r.run_type, r.date desc, r.created_at desc;

-- วันในแผนที่ขยาย repeat_of_week แล้ว (คืน jsonb ของวันนั้น + ข้อมูลที่ resolve)
create or replace function public.resolve_plan_day(p_plan_id uuid, p_day_no int)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  d public.run_plan_days;
  src public.run_plan_days;
  res jsonb;
begin
  select * into d from public.run_plan_days where plan_id = p_plan_id and day_no = p_day_no;
  if not found then
    return null;
  end if;
  res := to_jsonb(d);
  if d.repeat_of_week is not null then
    select * into src from public.run_plan_days
     where plan_id = p_plan_id
       and day_no = d.day_no - (d.week_no - d.repeat_of_week) * 7;
    if found then
      res := res || jsonb_build_object(
        'workout_type', src.workout_type,
        'title', src.title,
        'segments', src.segments,
        'add_strides', d.add_strides or src.add_strides,
        'add_weights', d.add_weights or src.add_weights,
        'repeat_source_day_no', src.day_no,
        'repeat_source_description', src.description);
    end if;
  end if;
  return res;
end $$;

-- ประเภทวันสำหรับเป้าโภชนาการ
create or replace function public.day_type_of(p_activity text, p_workout text)
returns text language sql immutable as $$
  select case
    when p_activity = 'weight' then 'weight'
    when p_activity = 'run' then
      case when p_workout in ('interval','tempo','threshold','vo2max','race_test','long')
           then 'run_hard' else 'run_easy' end
    else 'rest'
  end
$$;

-- โปรแกรมเวทสำหรับวันที่กำหนดตาม weight_rotation
-- ถ้าวันนั้นมี session แล้ว คืนโปรแกรมของ session นั้น ไม่งั้นคืนโปรแกรมถัดจาก session ล่าสุด
create or replace function public.weight_program_for(p_date date default public.bkk_today())
returns uuid language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_prog uuid;
  v_last uuid;
  v_n int;
  v_pos int;
begin
  select ws.program_id into v_prog
    from public.weight_sessions ws join public.weight_programs p on p.id = ws.program_id
   where ws.user_id = uid and ws.date = p_date and not p.is_warmup
   order by ws.created_at desc limit 1;
  if v_prog is not null then
    return v_prog;
  end if;

  select count(*) into v_n from public.weight_rotation where user_id = uid;
  if v_n = 0 then
    return null;
  end if;

  select ws.program_id into v_last
    from public.weight_sessions ws
    join public.weight_rotation r on r.program_id = ws.program_id and r.user_id = uid
   where ws.user_id = uid and ws.date < p_date
   order by ws.date desc, ws.created_at desc limit 1;

  with rot as (
    select program_id, row_number() over (order by sort_order, created_at) as rn
    from public.weight_rotation where user_id = uid
  )
  select rn into v_pos from rot where program_id = v_last limit 1;

  with rot as (
    select program_id, row_number() over (order by sort_order, created_at) as rn
    from public.weight_rotation where user_id = uid
  )
  select program_id into v_prog from rot where rn = coalesce(v_pos % v_n + 1, 1);
  return v_prog;
end $$;

-- กิจกรรมของวันนั้น
create or replace function public.today_plan(p_date date default public.bkk_today())
returns jsonb language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  enr record;
  sch record;
  prog record;
  mark record;
  v_day jsonb;
  v_day_no int;
  v_activity text := 'rest';
  v_workout text;
  v_source text := 'schedule';
  v_plan jsonb;
  v_prog jsonb;
  v_prog_id uuid;
begin
  select e.id, e.plan_id, e.start_date, e.day_offset, p.name as plan_name, p.total_days
    into enr
    from public.plan_enrollments e join public.run_plans p on p.id = e.plan_id
   where e.user_id = uid and e.status = 'active'
   order by e.created_at desc limit 1;

  if found then
    v_day_no := (p_date - enr.start_date) + 1 - enr.day_offset;
    v_plan := jsonb_build_object(
      'enrollment_id', enr.id, 'plan_id', enr.plan_id, 'plan_name', enr.plan_name,
      'day_no', v_day_no, 'total_days', enr.total_days,
      'status', case when v_day_no < 1 then 'not_started'
                     when v_day_no > enr.total_days then 'finished' else 'in_progress' end);
    if v_day_no between 1 and enr.total_days then
      v_day := public.resolve_plan_day(enr.plan_id, v_day_no);
      if v_day is not null then
        v_source := 'plan';
        v_workout := v_day->>'workout_type';
        v_activity := case v_workout
          when 'rest' then 'rest'
          when 'active_recovery' then 'active_recovery'
          when 'weights' then 'weight'
          else 'run' end;
      end if;
    end if;
  end if;

  if v_source = 'schedule' then
    select * into sch from public.weekly_schedule
     where user_id = uid and day_of_week = extract(dow from p_date)::int;
    if found then
      v_activity := sch.activity;
      v_workout := sch.run_type;
      if sch.activity = 'run' then
        v_day := jsonb_build_object(
          'workout_type', coalesce(sch.run_type, 'easy'),
          'title', coalesce(sch.title, 'วิ่ง'),
          'segments', sch.segments,
          'add_weights', false, 'add_strides', false);
      end if;
    end if;
  end if;

  if v_activity = 'weight' or coalesce((v_day->>'add_weights')::boolean, false) then
    v_prog_id := public.weight_program_for(p_date);
    if v_prog_id is not null then
      select id, name, color into prog from public.weight_programs where id = v_prog_id;
      v_prog := jsonb_build_object('id', prog.id, 'name', prog.name, 'color', prog.color);
    end if;
  end if;

  select status, note into mark from public.day_marks where user_id = uid and date = p_date;

  return jsonb_build_object(
    'date', p_date,
    'source', v_source,
    'activity', v_activity,
    'workout_type', v_workout,
    'day_type', public.day_type_of(v_activity, v_workout),
    'plan', v_plan,
    'plan_day', v_day,
    'weight_program', v_prog,
    'mark', case when mark.status is null then null else mark.status end);
end $$;

-- ---------------------------------------------------------------------------
-- โภชนาการ
-- ---------------------------------------------------------------------------
create view public.daily_nutrition with (security_invoker = true) as
with f as (
  select user_id, date,
         sum(calories) as kcal, sum(protein_g) as protein_g, sum(carb_g) as carb_g,
         sum(fat_g) as fat_g, sum(fiber_g) as fiber_g, sum(sodium_mg) as sodium_mg,
         count(*) as items
  from public.food_log group by user_id, date
)
select f.user_id, f.date, f.kcal, f.protein_g, f.carb_g, f.fat_g, f.fiber_g, f.sodium_mg, f.items,
       dt.day_type,
       t.kcal as target_kcal, t.protein_g as target_protein_g, t.carb_g as target_carb_g, t.fat_g as target_fat_g,
       (f.protein_g >= t.protein_g) as protein_hit,
       (f.kcal between t.kcal * 0.9 and t.kcal * 1.1) as kcal_in_range,
       (select coalesce(sum(w.ml), 0) from public.water_log w where w.user_id = f.user_id and w.date = f.date) as water_ml
from f
cross join lateral (select public.today_plan(f.date)->>'day_type' as day_type) dt
left join public.nutrition_targets t on t.user_id = f.user_id and t.day_type = dt.day_type;

-- ---------------------------------------------------------------------------
-- เป้าหมาย
-- ---------------------------------------------------------------------------

-- ค่าปัจจุบันของ metric
create or replace function public.metric_current(p_metric text, p_date date default public.bkk_today())
returns numeric language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  v numeric;
  wk_start date := date_trunc('week', p_date)::date;
begin
  if p_metric = 'weight_kg' then
    select avg(weight_kg) into v from public.body_weight
     where user_id = uid and date between p_date - 6 and p_date;
    if v is null then -- ไม่มีข้อมูล 7 วันล่าสุด ใช้ค่าล่าสุด
      select weight_kg into v from public.body_weight where user_id = uid and date <= p_date order by date desc limit 1;
    end if;
  elsif p_metric in ('pbf_pct','smm_kg','waist_cm','body_fat_kg','visceral_fat') then
    execute format('select %I from public.body_comp where user_id = $1 and date <= $2 and %I is not null order by date desc limit 1', p_metric, p_metric)
      into v using uid, p_date;
  elsif p_metric = 'active_days_week' then
    select count(distinct d) into v from (
      select date as d from public.weight_sessions where user_id = uid and date between wk_start and p_date
      union
      select date from public.runs where user_id = uid and completed <> 'skipped' and date between wk_start and p_date
    ) x;
  elsif p_metric like 'pain_avg7:%' then
    select avg(score) into v from public.pain_log
     where user_id = uid and body_part = split_part(p_metric, ':', 2) and date between p_date - 6 and p_date;
  elsif p_metric like 'e1rm:%' then
    select max(e1rm_lb) into v from public.exercise_progress
     where user_id = uid and exercise_id = split_part(p_metric, ':', 2)::uuid and date between p_date - 29 and p_date;
  elsif p_metric = 'run_distance_week' then
    select coalesce(sum(distance_km), 0) into v from public.runs
     where user_id = uid and completed <> 'skipped' and date between wk_start and p_date;
  elsif p_metric like 'run_pace:%' then
    select avg(pace_sec_per_km) into v from (
      select pace_sec_per_km from public.runs
       where user_id = uid and run_type = split_part(p_metric, ':', 2) and pace_sec_per_km is not null and date <= p_date
       order by date desc limit 3) x;
  end if;
  return round(v, 2);
end $$;

-- ความชันต่อวันของ metric (linear regression 28 วันล่าสุด, ต้องมี ≥ 4 จุดและกว้าง ≥ 7 วัน)
create or replace function public.metric_slope(p_metric text, p_date date default public.bkk_today())
returns numeric language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  v numeric;
begin
  if p_metric = 'weight_kg' then
    select case when count(*) >= 4 and max(date) - min(date) >= 7
                then regr_slope(weight_kg, date - p_date) end
      into v from public.body_weight where user_id = uid and date between p_date - 27 and p_date;
  elsif p_metric in ('pbf_pct','smm_kg','waist_cm','body_fat_kg') then
    execute format($q$select case when count(*) >= 2 and max(date) - min(date) >= 7
                                  then regr_slope(%I, date - $2) end
                        from public.body_comp where user_id = $1 and %I is not null and date between $2 - 90 and $2$q$,
                   p_metric, p_metric)
      into v using uid, p_date;
  elsif p_metric like 'pain_avg7:%' then
    select case when count(*) >= 4 then regr_slope(score, date - p_date) end into v
      from public.pain_log where user_id = uid and body_part = split_part(p_metric, ':', 2) and date between p_date - 27 and p_date;
  end if;
  return v;
end $$;

create or replace function public.goal_progress(p_date date default public.bkk_today())
returns table (
  goal_id uuid, goal_type text, title text, metric text, direction text,
  start_value numeric, start_date date, target_value numeric, target_date date, status text,
  current_value numeric, progress_pct numeric, expected_value numeric, slope_per_day numeric,
  forecast_date date, days_left int, remaining numeric, state text
) language plpgsql stable set search_path = public as $$
declare
  g public.goals;
  v_start numeric;
begin
  for g in select gg.* from public.goals gg
            where gg.user_id = auth.uid() and gg.status <> 'archived'
            order by gg.sort_order, gg.created_at loop
    goal_id := g.id; goal_type := g.goal_type; title := g.title; metric := g.metric; direction := g.direction;
    start_date := g.start_date; target_value := g.target_value; target_date := g.target_date; status := g.status;
    current_value := public.metric_current(g.metric, p_date);
    slope_per_day := public.metric_slope(g.metric, p_date);
    v_start := coalesce(g.start_value, current_value);
    start_value := v_start;
    days_left := case when g.target_date is not null then g.target_date - p_date end;
    remaining := case when current_value is not null then round(g.target_value - current_value, 2) end;

    -- % ความคืบหน้า: (start − current) ÷ (start − target) × 100 จำกัด 0-100
    progress_pct := case
      when current_value is null then null
      when g.direction = 'keep_above' then case when current_value >= g.target_value then 100 else 0 end
      when g.direction = 'keep_below' then case when current_value <= g.target_value then 100 else 0 end
      when v_start = g.target_value then 100
      else greatest(0, least(100, round((v_start - current_value) / (v_start - g.target_value) * 100, 1)))
    end;

    -- ค่าที่ควรเป็นตามเส้นตรงจากวันเริ่มถึงวันเป้าหมาย
    expected_value := case
      when g.direction in ('down','up') and g.target_date is not null and g.target_date > g.start_date then
        round(v_start + (g.target_value - v_start)
              * least(1, greatest(0, (p_date - g.start_date)::numeric / (g.target_date - g.start_date))), 2)
    end;

    forecast_date := case
      when current_value is null or slope_per_day is null or slope_per_day = 0 then null
      when (g.target_value - current_value) / slope_per_day < 0 then null
      when (g.target_value - current_value) / slope_per_day > 3650 then null
      else p_date + ceil((g.target_value - current_value) / slope_per_day)::int
    end;

    state := case
      when current_value is null then 'no_data'
      when g.status = 'done' then 'done'
      when g.direction = 'down' and current_value <= g.target_value then 'done'
      when g.direction = 'up' and current_value >= g.target_value then 'done'
      when g.direction = 'keep_above' then case when current_value >= g.target_value then 'on_track' else 'behind' end
      when g.direction = 'keep_below' then case when current_value <= g.target_value then 'on_track' else 'behind' end
      when expected_value is not null then
        case when (g.direction = 'down' and current_value <= expected_value + 0.1)
                or (g.direction = 'up' and current_value >= expected_value - 0.1)
             then 'on_track' else 'behind' end
      when slope_per_day is not null then
        case when (g.direction = 'down' and slope_per_day < 0) or (g.direction = 'up' and slope_per_day > 0)
             then 'on_track' else 'behind' end
      else 'on_track'
    end;
    return next;
  end loop;
end $$;

create view public.goal_progress with (security_invoker = true) as
select * from public.goal_progress();

-- ---------------------------------------------------------------------------
-- สรุปรายสัปดาห์ (สัปดาห์เริ่มวันจันทร์)
-- ---------------------------------------------------------------------------
create view public.weekly_summary with (security_invoker = true) as
with ws as (
  select user_id, date_trunc('week', date)::date as week_start,
         count(*) as weight_sessions, count(distinct date) as weight_days
  from public.weight_sessions group by 1, 2
), rn as (
  select user_id, date_trunc('week', date)::date as week_start,
         count(*) filter (where completed <> 'skipped') as runs,
         count(distinct date) filter (where completed <> 'skipped') as run_days,
         coalesce(sum(distance_km) filter (where completed <> 'skipped'), 0) as run_km,
         coalesce(sum(duration_sec) filter (where completed <> 'skipped'), 0) as run_sec
  from public.runs group by 1, 2
), act as (
  select user_id, date_trunc('week', d)::date as week_start, count(distinct d) as active_days
  from (select user_id, date as d from public.weight_sessions
        union select user_id, date from public.runs where completed <> 'skipped') x
  group by 1, 2
), bw as (
  select user_id, date_trunc('week', date)::date as week_start, round(avg(weight_kg), 2) as avg_weight_kg, count(*) as weigh_ins
  from public.body_weight group by 1, 2
), nu as (
  select user_id, date_trunc('week', date)::date as week_start,
         round(avg(kcal)) as avg_kcal, round(avg(protein_g)) as avg_protein_g,
         round(avg(carb_g)) as avg_carb_g, round(avg(fat_g)) as avg_fat_g,
         count(*) as food_days,
         count(*) filter (where protein_hit) as protein_days_hit,
         count(*) filter (where kcal_in_range) as kcal_days_in_range
  from public.daily_nutrition group by 1, 2
), ck as (
  select user_id, date_trunc('week', date)::date as week_start,
         round(avg(sleep_hours), 1) as avg_sleep_hours, round(avg(resting_hr)) as avg_resting_hr
  from public.daily_checkin group by 1, 2
), weeks as (
  select user_id, week_start from ws union select user_id, week_start from rn
  union select user_id, week_start from bw union select user_id, week_start from nu
  union select user_id, week_start from ck
)
select w.user_id, w.week_start, w.week_start + 6 as week_end,
       coalesce(ws.weight_sessions, 0) as weight_sessions,
       coalesce(rn.runs, 0) as runs,
       coalesce(rn.run_km, 0) as run_km,
       coalesce(rn.run_sec, 0) as run_sec,
       coalesce(act.active_days, 0) as active_days,
       bw.avg_weight_kg, bw.weigh_ins,
       bw.avg_weight_kg - lag(bw.avg_weight_kg) over (partition by w.user_id order by w.week_start) as weight_change_kg,
       rn.run_km - lag(rn.run_km) over (partition by w.user_id order by w.week_start) as run_km_change,
       nu.avg_kcal, nu.avg_protein_g, nu.avg_carb_g, nu.avg_fat_g, nu.food_days, nu.protein_days_hit, nu.kcal_days_in_range,
       ck.avg_sleep_hours, ck.avg_resting_hr
from weeks w
left join ws  on ws.user_id = w.user_id  and ws.week_start = w.week_start
left join rn  on rn.user_id = w.user_id  and rn.week_start = w.week_start
left join act on act.user_id = w.user_id and act.week_start = w.week_start
left join bw  on bw.user_id = w.user_id  and bw.week_start = w.week_start
left join nu  on nu.user_id = w.user_id  and nu.week_start = w.week_start
left join ck  on ck.user_id = w.user_id  and ck.week_start = w.week_start;

-- ---------------------------------------------------------------------------
-- สิทธิ์
-- ---------------------------------------------------------------------------
revoke all on function public.today_plan(date), public.goal_progress(date), public.weight_program_for(date),
  public.metric_current(text, date), public.metric_slope(text, date), public.resolve_plan_day(uuid, int) from public, anon;
grant execute on function public.today_plan(date), public.goal_progress(date), public.weight_program_for(date),
  public.metric_current(text, date), public.metric_slope(text, date), public.resolve_plan_day(uuid, int) to authenticated;
