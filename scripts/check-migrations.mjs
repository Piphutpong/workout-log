// ตรวจ migration + seed บน PGlite (Postgres ใน WASM) โดยไม่ต้องใช้ Docker
// จำลอง schema auth/storage ของ Supabase แล้วทดสอบ RLS, bootstrap_user, today_plan ฯลฯ
// รัน: npm run db:check
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new PGlite({ extensions: { pgcrypto } })

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`)

const migDir = join(root, 'supabase', 'migrations')
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migDir, f), 'utf8'))
    console.log('✓ migration', f)
  } catch (e) {
    console.error('✗ migration', f, e.message)
    process.exit(1)
  }
}
await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'))
console.log('✓ seed.sql')

// Supabase ให้สิทธิ์ตารางใน public แก่ authenticated โดยปริยาย
await db.exec(`
  grant usage on schema public to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant usage on all sequences in schema public to authenticated;
`)

const U1 = '11111111-1111-1111-1111-111111111111'
const U2 = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${U1}', 'me@example.com'), ('${U2}', 'other@example.com')`)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const as = async (uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`)
}

// ---- แผนระบบ -------------------------------------------------------------
const plans = await q(`select name, total_days, (select count(*) from run_plan_days d where d.plan_id = p.id)::int as n
                       from run_plans p order by name`)
for (const p of plans) assert.equal(p.n, p.total_days, `${p.name} days`)
console.log('✓ run plans', plans.map((p) => `${p.name}:${p.n}`).join(', '))

// ---- bootstrap ------------------------------------------------------------
await as(U1)
assert.equal((await one(`select public.bootstrap_user('2026-09-28') as r`)).r, true)
assert.equal((await one(`select public.bootstrap_user('2026-09-28') as r`)).r, false)
const counts = await one(`select (select count(*) from exercises)::int ex, (select count(*) from program_exercises)::int pe,
  (select count(*) from goals)::int g, (select count(*) from weekly_schedule)::int ws, (select count(*) from nutrition_targets)::int nt`)
// 16 ท่าเดิม + 19 ท่าจากโปรแกรมนายแบบ (Incline DB press ใช้ร่วมกัน)
assert.deepEqual(counts, { ex: 35, pe: 36, g: 5, ws: 7, nt: 4 })
console.log('✓ bootstrap_user', counts)

// ---- today_plan จาก weekly_schedule ---------------------------------------
const mon = await one(`select public.today_plan('2026-09-28') as p`)
assert.equal(mon.p.activity, 'weight')
assert.equal(mon.p.weight_program.name, 'A')
assert.equal(mon.p.day_type, 'weight')
const tue = await one(`select public.today_plan('2026-09-29') as p`)
assert.equal(tue.p.activity, 'run')
assert.equal(tue.p.day_type, 'run_easy')
const thu = await one(`select public.today_plan('2026-10-01') as p`)
assert.equal(thu.p.day_type, 'run_hard')
const sun = await one(`select public.today_plan('2026-10-04') as p`)
assert.equal(sun.p.activity, 'rest')
console.log('✓ today_plan (schedule)')

// rotation: หลังเล่น A วันจันทร์ วันพุธต้องเป็น B และวันจันทร์ยังคงเป็น A
const progA = (await one(`select id from weight_programs where name = 'A'`)).id
const sess = (await one(`insert into weight_sessions (date, program_id) values ('2026-09-28', $1) returning id`, [progA])).id
const goblet = (await one(`select id from exercises where name = 'Goblet squat'`)).id
await db.query(`insert into weight_sets (session_id, exercise_id, date, set_no, weight_lb, reps) values
  ($1, $2, '2026-09-28', 1, 25, 10), ($1, $2, '2026-09-28', 2, 25, 10), ($1, $2, '2026-09-28', 3, 25, 9)`, [sess, goblet])
assert.equal((await one(`select public.today_plan('2026-09-30') as p`)).p.weight_program.name, 'B')
assert.equal((await one(`select public.today_plan('2026-09-28') as p`)).p.weight_program.name, 'A')
const lp = await one(`select * from last_performance where exercise_id = $1`, [goblet])
assert.equal(lp.sets.length, 3)
const ep = await one(`select * from exercise_progress where exercise_id = $1`, [goblet])
assert.equal(Number(ep.e1rm_lb), 33.3)
assert.equal(Number(ep.volume_lb), 725)
console.log('✓ rotation, last_performance, exercise_progress')

// ---- enroll แผน + repeat_of_week ------------------------------------------
const plan21 = (await one(`select id from run_plans where slug = 'fastbull-21k-begin'`)).id
const enr = (await one(`insert into plan_enrollments (plan_id, start_date) values ($1, '2026-10-01') returning id`, [plan21])).id
const d1 = (await one(`select public.today_plan('2026-10-01') as p`)).p
assert.equal(d1.source, 'plan')
assert.equal(d1.plan.day_no, 1)
assert.equal(d1.plan_day.workout_type, 'easy')
const d22 = (await one(`select public.today_plan('2026-10-22') as p`)).p
assert.equal(d22.plan.day_no, 22)
assert.equal(d22.plan_day.repeat_source_day_no, 8)
assert.equal(d22.plan_day.segments[0].work_km, 8)
const d30 = (await one(`select public.today_plan('2026-10-30') as p`)).p
assert.equal(d30.plan_day.workout_type, 'interval')
assert.equal(d30.plan_day.add_weights, true)
assert.ok(d30.weight_program, 'weight program on add_weights day')
const before = (await one(`select public.today_plan('2026-09-30') as p`)).p
assert.equal(before.source, 'schedule')
assert.equal(before.plan.status, 'not_started')
// เลื่อนแผน 1 วัน
await db.query(`update plan_enrollments set day_offset = 1 where id = $1`, [enr])
assert.equal((await one(`select public.today_plan('2026-10-22') as p`)).p.plan.day_no, 21)
await db.query(`insert into day_marks (date, status, activity) values ('2026-10-21', 'postponed', 'run')`)
assert.equal((await one(`select public.today_plan('2026-10-21') as p`)).p.mark, 'postponed')
console.log('✓ enrollment, repeat_of_week, day_offset, day_marks')

// ---- runs / nutrition / goals / weekly ------------------------------------
await db.exec(`insert into runs (date, run_type, distance_km, duration_sec, avg_hr) values
  ('2026-09-29', 'easy', 6, 2160, 140), ('2026-10-01', 'interval', 5, 1650, 160)`)
const lr = await q(`select run_type, pace_sec_per_km from last_run_by_type order by run_type`)
assert.equal(Number(lr[0].pace_sec_per_km), 360)
for (const [d, w] of [['2026-09-28', 78.2], ['2026-09-30', 78.0], ['2026-10-02', 77.9], ['2026-10-05', 77.6], ['2026-10-07', 77.5]]) {
  await db.query(`insert into body_weight (date, weight_kg) values ($1, $2)
                  on conflict (user_id, date) do update set weight_kg = excluded.weight_kg`, [d, w])
}
await db.exec(`insert into food_log (date, meal, name, calories, protein_g, carb_g, fat_g) values
  ('2026-09-28', 'เช้า', 'test', 2400, 165, 260, 70)`)
const dn = await one(`select * from daily_nutrition where date = '2026-09-28'`)
assert.equal(dn.day_type, 'weight')
assert.equal(dn.protein_hit, true)
const gp = await q(`select * from goal_progress('2026-10-07')`)
const gw = gp.find((g) => g.metric === 'weight_kg')
assert.ok(Number(gw.current_value) < 78.3 && Number(gw.progress_pct) > 0, 'weight progress')
assert.ok(gw.forecast_date, 'forecast date')
const smm = gp.find((g) => g.metric === 'smm_kg')
assert.equal(smm.state, 'on_track')
console.log('✓ goal_progress', gw.current_value, gw.progress_pct + '%', gw.state, 'forecast', gw.forecast_date)
const ws = await q(`select * from weekly_summary order by week_start`)
assert.ok(ws.length >= 2)
console.log('✓ weekly_summary', ws.map((w) => `${w.week_start.toISOString?.().slice(0, 10) ?? w.week_start}:${w.active_days}d/${w.run_km}km`).join(' '))

// ---- Phase 2 ----------------------------------------------------------------
const toning = await q(`select p.name, count(pe.id)::int n, bool_and(pe.target_reps = 15 and pe.target_reps_max = 20 and pe.target_sets = 4) ok
                        from weight_programs p join program_exercises pe on pe.program_id = p.id
                        where p.name like 'นายแบบ%' group by p.name order by p.name`)
assert.deepEqual(toning.map((t) => t.n), [8, 6, 6])
assert.ok(toning.every((t) => t.ok))
// Incline DB press ใช้ท่าเดียวกับโปรแกรม B (ไม่สร้างซ้ำ)
assert.equal((await one(`select count(*)::int n from exercises where name = 'Incline DB press'`)).n, 1)
console.log('✓ โปรแกรมนายแบบ', toning.map((t) => `${t.name}:${t.n}`).join(', '))

// PR: session ที่ 2 หนักขึ้น
const sess2 = (await one(`insert into weight_sessions (date, program_id) values ('2026-10-05', $1) returning id`, [progA])).id
await db.query(`insert into weight_sets (session_id, exercise_id, date, set_no, weight_lb, reps) values
  ($1, $2, '2026-10-05', 1, 30, 10), ($1, $2, '2026-10-05', 2, 30, 10)`, [sess2, goblet])
const prs = await q(`select * from pr_events`)
assert.equal(prs.length, 1)
assert.equal(Number(prs[0].e1rm_lb), 40)

await db.exec(`insert into daily_checkin (date, sleep_hours, resting_hr) values
  ('2026-10-05', 5.5, 55), ('2026-10-06', 5, 56), ('2026-10-07', 5.5, 54)`)
await db.exec(`insert into pain_log (date, body_part, score) values
  ('2026-10-01', 'ศอกซ้าย', 5), ('2026-10-03', 'ศอกซ้าย', 4), ('2026-10-06', 'ศอกซ้าย', 4)`)
await db.exec(`insert into body_comp (date, weight_kg, smm_kg, pbf_pct, waist_cm) values ('2026-10-07', 77.5, 38.4, 14.1, 82)`)

const pr = (await one(`select public.personal_records() as r`)).r
assert.equal(Number(pr.exercises.find((e) => e.name === 'Goblet squat').best_e1rm_lb), 40)
assert.equal(pr.best_5k.sec, 1650)
assert.equal(pr.longest.distance_km, 6)
console.log('✓ personal_records 5K', pr.best_5k.sec, 's')

const cmp = (await one(`select public.progress_compare('2026-09-28', '2026-10-07') as r`)).r
assert.equal(Number(cmp.body.pbf_pct.current), 14.1)
assert.equal(Number(cmp.body.pbf_pct.ref), 14.8)
const firstCmp = (await one(`select public.progress_compare(null, '2026-10-07') as r`)).r
assert.ok(firstCmp.lifts.exercises.length >= 1)
assert.equal(firstCmp.pain[0].part, 'ศอกซ้าย')
console.log('✓ progress_compare')

const ach = (await one(`select public.achievements('2026-10-07') as r`)).r
assert.equal(ach.find((a) => a.key === 'sessions_10').value, 4)

const act = await q(`select * from public.day_activity('2026-09-28', '2026-10-04')`)
assert.equal(act.length, 7)
assert.equal(act[0].weight_done, true)

const st = (await one(`select public.weekly_review_stats('2026-10-05') as r`)).r
assert.equal(st.low_sleep_streak, 3)
assert.equal(st.pain[0].last3_high, true)
assert.equal(st.training_weeks_no_deload, 2)
assert.equal(st.prs, 1)
console.log('✓ achievements, day_activity, weekly_review_stats', JSON.stringify({ sleep: st.low_sleep_streak, weeks: st.training_weeks_no_deload }))
await db.query(`insert into weekly_reviews (week_start, good, improve, stats) values ('2026-10-05', '["a"]', '["b"]', $1)`, [st])

// ---- Phase 3 ----------------------------------------------------------------
const foods = await one(`select count(*)::int n, count(*) filter (where is_estimate)::int est, count(*) filter (where is_favorite)::int fav from foods where source = 'seed'`)
assert.equal(foods.n, 95)
assert.equal(foods.est, 95)
const egg = (await one(`select id, calories from foods where name = 'ไข่ต้ม'`))
await db.query(`insert into food_log (date, meal, food_id, servings, calories, protein_g, carb_g, fat_g) values
  ('2026-10-06', 'เช้า', $1, 2, 144, 12.6, 0.8, 9.6), ('2026-10-07', 'เช้า', $1, 1, 72, 6.3, 0.4, 4.8)`, [egg.id])
const usage = await one(`select uses::int, last_used from food_usage where food_id = $1`, [egg.id])
assert.equal(usage.uses, 2)
const ti = (await one(`select public.tdee_inputs('2026-10-07') as r`)).r
assert.equal(ti.w14.days_logged, 3)
assert.ok(ti.current_avg_target >= 2250 && ti.current_avg_target <= 2650, `avg target ${ti.current_avg_target}`)
assert.equal(ti.mode, 'cut')
await db.exec(`insert into tdee_proposals (week_start, mode, tdee, proposed_delta) values ('2026-10-05', 'cut', 2600, -100)`)
console.log('✓ foods seed', foods, '· tdee_inputs', JSON.stringify(ti.w14), 'target', ti.current_avg_target)

// ---- RLS ------------------------------------------------------------------
await as(U2)
assert.equal((await one(`select count(*)::int n from settings`)).n, 0)
assert.equal((await one(`select count(*)::int n from weight_sets`)).n, 0)
assert.equal((await one(`select count(*)::int n from goal_progress`)).n, 0)
assert.equal((await one(`select count(*)::int n from weekly_reviews`)).n, 0)
assert.equal((await one(`select count(*)::int n from pr_events`)).n, 0)
assert.equal((await one(`select count(*)::int n from foods`)).n, 0)
assert.equal((await one(`select count(*)::int n from tdee_proposals`)).n, 0)
assert.equal((await one(`select count(*)::int n from run_plans where user_id is null`)).n, 5)
await assert.rejects(db.query(`insert into body_weight (user_id, date, weight_kg) values ($1, '2026-10-01', 70)`, [U1]))
await assert.rejects(db.query(`update run_plan_days set title = 'hack' where day_no = 1 returning id`).then((r) => {
  if (r.rows.length === 0) throw new Error('no rows updated (RLS)')
}))
await assert.rejects(db.query(`insert into run_plans (user_id, name, level, total_days) values (null, 'x', 'begin', 1)`))
console.log('✓ RLS แยกข้อมูลผู้ใช้ และแผนระบบแก้ไม่ได้')
console.log('\nALL CHECKS PASSED')
