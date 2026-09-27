// สร้าง supabase/seed.sql จาก supabase/seed_run_plans.json
// แผนวิ่งเป็น "แผนระบบ" (user_id = null) ทุกคนอ่านได้ ถ้าต้องการแก้ให้คัดลอกเป็นแผนของตัวเองในแอป
// รันซ้ำได้ (upsert ตาม slug / day_no)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(join(root, 'supabase', 'seed_run_plans.json'), 'utf8'))

const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

let sql = `-- สร้างอัตโนมัติจาก supabase/seed_run_plans.json ด้วย npm run seed:build — ห้ามแก้ด้วยมือ
-- แผนวิ่ง FASTBULL RUN (ใช้ส่วนตัว) เป็นแผนระบบ user_id = null
`
for (const p of data.plans) {
  const days = p.days.map(({ review_reason, ...d }) => d)
  sql += `
-- ${p.name} (${p.total_days} วัน)
with plan as (
  insert into public.run_plans (user_id, slug, name, level, goal_distance_km, total_days, source, note)
  values (null, ${lit(p.slug)}, ${lit(p.name)}, ${lit(p.level)}, ${lit(p.goal_distance_km)}, ${lit(p.total_days)}, ${lit(p.source)}, ${lit(p.note)})
  on conflict (slug) where user_id is null do update
    set name = excluded.name, level = excluded.level, goal_distance_km = excluded.goal_distance_km,
        total_days = excluded.total_days, source = excluded.source, note = excluded.note
  returning id
)
insert into public.run_plan_days (user_id, plan_id, day_no, week_no, workout_type, title, description,
                                  repeat_of_week, add_strides, add_weights, segments, note)
select null, plan.id, d.day_no, d.week_no, d.workout_type, d.title, d.description,
       d.repeat_of_week, d.add_strides, d.add_weights, coalesce(d.segments, '[]'), d.note
from plan, jsonb_to_recordset($json$${JSON.stringify(days)}$json$::jsonb) as d(
  day_no int, week_no int, workout_type text, title text, description text,
  repeat_of_week int, add_strides boolean, add_weights boolean, segments jsonb, note text)
on conflict (plan_id, day_no) do update
  set week_no = excluded.week_no, workout_type = excluded.workout_type, title = excluded.title,
      description = excluded.description, repeat_of_week = excluded.repeat_of_week,
      add_strides = excluded.add_strides, add_weights = excluded.add_weights,
      segments = excluded.segments, note = excluded.note;
`
}
writeFileSync(join(root, 'supabase', 'seed.sql'), sql)
console.log(`wrote supabase/seed.sql (${data.plans.length} plans, ${(sql.length / 1024).toFixed(0)} KB)`)
