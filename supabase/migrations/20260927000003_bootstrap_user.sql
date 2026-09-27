-- =============================================================================
-- ข้อมูลตั้งต้นส่วนตัว (ข้อ 4.1, 4.2, 4.4, 4.5, 4.6)
-- เรียกครั้งแรกหลังล็อกอิน: select public.bootstrap_user('2026-09-27');
-- ทำงานครั้งเดียวต่อผู้ใช้ (ถ้ามี settings แล้วจะไม่ทำอะไร)
-- =============================================================================
create or replace function public.bootstrap_user(p_start_date date default public.bkk_today())
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  e jsonb;
  ex_ids jsonb := '{}';
  p_rehab uuid; p_a uuid; p_b uuid;
  i int;
begin
  if uid is null then
    raise exception 'ต้องล็อกอินก่อน';
  end if;
  if exists (select 1 from public.settings where user_id = uid) then
    return false;
  end if;

  -- 4.1 ผู้ใช้ -----------------------------------------------------------
  insert into public.settings (user_id, sex, height_cm, birth_date, max_hr, target_weight_kg, program_start_date,
                               default_rest_sec, weight_step_lb, pinned_pain_parts)
  values (uid, 'male', 178.6, make_date(extract(year from p_start_date)::int - 34, 1, 1), 186, 76.0, p_start_date,
          90, 2.5, '{ศอกซ้าย}');

  -- InBody 25/09/2026
  insert into public.body_comp (user_id, date, weight_kg, smm_kg, body_fat_kg, pbf_pct, visceral_fat, note)
  values (uid, '2026-09-25', 78.3, 38.3, 11.6, 14.8, 4, 'InBody');
  insert into public.body_weight (user_id, date, weight_kg, note)
  values (uid, '2026-09-25', 78.3, 'InBody') on conflict (user_id, date) do nothing;

  -- เป้าหมาย
  insert into public.goals (user_id, goal_type, title, metric, start_value, start_date, target_value, target_date, direction, sort_order) values
    (uid, 'body',        'น้ำหนัก 76.0 กก.',               'weight_kg',          78.3, p_start_date, 76.0, p_start_date + 56, 'down',       1),
    (uid, 'body',        'PBF 12%',                        'pbf_pct',            14.8, p_start_date, 12.0, null,              'down',       2),
    (uid, 'body',        'SMM ไม่ต่ำกว่า 38.0 กก.',          'smm_kg',             38.3, p_start_date, 38.0, null,              'keep_above', 3),
    (uid, 'consistency', 'ออกกำลังกาย 6 วัน/สัปดาห์',        'active_days_week',   0,    p_start_date, 6,    null,              'up',         4),
    (uid, 'body',        'เจ็บศอกซ้ายเฉลี่ย 7 วัน ≤ 2',      'pain_avg7:ศอกซ้าย',  null, p_start_date, 2,    null,              'keep_below', 5);

  -- 4.2 คลังท่า --------------------------------------------------------------
  for e in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('k','goblet','name','Goblet squat','m','reps','g','ขา'),
    jsonb_build_object('k','bench','name','DB bench press (neutral grip)','m','reps','g','อก','grip',true),
    jsonb_build_object('k','row','name','One-arm DB row','m','reps','g','หลัง','grip',true),
    jsonb_build_object('k','rdl','name','DB Romanian deadlift','m','reps','g','ขาหลัง/ก้น','grip',true),
    jsonb_build_object('k','lateral','name','Band lateral raise','m','band','g','ไหล่'),
    jsonb_build_object('k','plank','name','Plank','m','seconds','g','แกนกลาง'),
    jsonb_build_object('k','bss','name','Bulgarian split squat','m','reps','g','ขา'),
    jsonb_build_object('k','incline','name','Incline DB press','m','reps','g','อก','grip',true),
    jsonb_build_object('k','pulldown','name','Band pulldown/row','m','band','g','หลัง'),
    jsonb_build_object('k','thrust','name','Hip thrust','m','reps','g','ก้น'),
    jsonb_build_object('k','facepull','name','Band face pull','m','band','g','ไหล่หลัง'),
    jsonb_build_object('k','deadbug','name','Dead bug','m','reps','g','แกนกลาง'),
    jsonb_build_object('k','iso','name','Isometric wrist flexion','m','seconds','g','แขนท่อนล่าง'),
    jsonb_build_object('k','ecc_curl','name','Eccentric wrist curl','m','reps','g','แขนท่อนล่าง'),
    jsonb_build_object('k','ecc_pron','name','Eccentric pronation','m','reps','g','แขนท่อนล่าง'),
    jsonb_build_object('k','stretch','name','Forearm flexor stretch','m','seconds','g','แขนท่อนล่าง')
  )) loop
    insert into public.exercises (user_id, name, measure_type, muscle_group, grip_intensive)
    values (uid, e->>'name', e->>'m', e->>'g', coalesce((e->>'grip')::boolean, false))
    on conflict (user_id, name) do update set measure_type = excluded.measure_type
    returning jsonb_build_object(e->>'k', id) || ex_ids into ex_ids;
  end loop;

  -- โปรแกรม
  insert into public.weight_programs (user_id, name, description, color, is_warmup, sort_order)
  values (uid, 'Rehab', 'วอร์มอัพ/ฟื้นฟูศอกซ้าย ทำก่อนเล่นเวททุกครั้ง', '#10b981', true, 0) returning id into p_rehab;
  insert into public.weight_programs (user_id, name, description, color, sort_order)
  values (uid, 'A', 'Full body A', '#3b82f6', 1) returning id into p_a;
  insert into public.weight_programs (user_id, name, description, color, sort_order)
  values (uid, 'B', 'Full body B', '#f59e0b', 2) returning id into p_b;

  i := 0;
  for e in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('p','rehab','k','iso',     's',5,'sec',45,'rest',30),
    jsonb_build_object('p','rehab','k','ecc_curl','s',3,'r',15,  'rest',45),
    jsonb_build_object('p','rehab','k','ecc_pron','s',3,'r',15,  'rest',45),
    jsonb_build_object('p','rehab','k','stretch', 's',2,'sec',30,'rest',15),
    jsonb_build_object('p','a','k','goblet',  's',3,'r',10),
    jsonb_build_object('p','a','k','bench',   's',3,'r',10),
    jsonb_build_object('p','a','k','row',     's',3,'r',10),
    jsonb_build_object('p','a','k','rdl',     's',3,'r',10),
    jsonb_build_object('p','a','k','lateral', 's',3,'r',15,'rest',60),
    jsonb_build_object('p','a','k','plank',   's',3,'sec',40,'rest',60),
    jsonb_build_object('p','b','k','bss',     's',3,'r',8),
    jsonb_build_object('p','b','k','incline', 's',3,'r',10),
    jsonb_build_object('p','b','k','pulldown','s',3,'r',12,'rest',60),
    jsonb_build_object('p','b','k','thrust',  's',3,'r',12),
    jsonb_build_object('p','b','k','facepull','s',3,'r',15,'rest',60),
    jsonb_build_object('p','b','k','deadbug', 's',3,'r',10,'rest',60)
  )) loop
    i := i + 1;
    insert into public.program_exercises (user_id, program_id, exercise_id, sort_order, target_sets, target_reps, target_seconds, rest_sec)
    values (uid,
            case e->>'p' when 'rehab' then p_rehab when 'a' then p_a else p_b end,
            (ex_ids->>(e->>'k'))::uuid, i,
            (e->>'s')::int, (e->>'r')::int, (e->>'sec')::int,
            coalesce((e->>'rest')::int, 90));
  end loop;

  insert into public.weight_rotation (user_id, sort_order, program_id) values (uid, 1, p_a), (uid, 2, p_b);

  -- ตารางประจำสัปดาห์ (0 = อา.) + วิ่งไม่ใช้แผน (4.4)
  insert into public.weekly_schedule (user_id, day_of_week, activity, run_type, title, segments) values
    (uid, 0, 'rest', null, null, '[]'),
    (uid, 1, 'weight', null, null, '[]'),
    (uid, 2, 'run', 'easy', 'Easy 30-40 นาที',
       '[{"repeat":1,"work_sec":1800,"work_sec_max":2400,"work_type":"run","zone":2,"hr_min_pct":60,"hr_max_pct":70}]'),
    (uid, 3, 'weight', null, null, '[]'),
    (uid, 4, 'run', 'interval', 'Interval วิ่งเร็ว 1 นาที / ช้า 2 นาที × 6',
       '[{"repeat":6,"work_sec":60,"work_type":"run","hr_min_pct":80,"hr_max_pct":90,"recover_sec":120,"recover_type":"jog"}]'),
    (uid, 5, 'weight', null, null, '[]'),
    (uid, 6, 'run', 'long', 'Long 45-50 นาที',
       '[{"repeat":1,"work_sec":2700,"work_sec_max":3000,"work_type":"run","zone":2,"hr_min_pct":60,"hr_max_pct":70}]');

  -- 4.5 Warm-up
  insert into public.warmup_routines (user_id, name, activity_type, items) values
    (uid, 'ก่อนเวท', 'weight', jsonb_build_array(
       jsonb_build_object('name', 'Rehab ศอกซ้าย (ตามโปรแกรม Rehab)', 'program_id', p_rehab),
       jsonb_build_object('name', 'Mobility สะโพก/ไหล่/อก', 'sec', 300))),
    (uid, 'ก่อนวิ่งเบา', 'run_easy', jsonb_build_array(
       jsonb_build_object('name', 'เดินเร็ว/จ็อกเบาๆ', 'sec', 300))),
    (uid, 'ก่อนวิ่งเร็ว', 'run_hard', jsonb_build_array(
       jsonb_build_object('name', 'เดิน/จ็อกเบาๆ', 'sec', 600),
       jsonb_build_object('name', 'Drills: A-skip, B-skip, high knees, butt kicks'),
       jsonb_build_object('name', 'Strides 60-80 ม.', 'reps', 4)));

  -- 4.6 โภชนาการ
  insert into public.nutrition_targets (user_id, day_type, kcal, protein_g, carb_g, fat_g) values
    (uid, 'weight',   2450, 160, 270, 75),
    (uid, 'run_easy', 2450, 160, 270, 75),
    (uid, 'run_hard', 2650, 160, 320, 75),
    (uid, 'rest',     2250, 160, 220, 75);

  insert into public.supplements (user_id, name, dose, timing) values
    (uid, 'Whey protein', '1 scoop', 'หลังออกกำลัง'),
    (uid, 'Creatine', '5 g', 'ทุกวัน');

  return true;
end $$;

revoke all on function public.bootstrap_user(date) from public, anon;
grant execute on function public.bootstrap_user(date) to authenticated;
