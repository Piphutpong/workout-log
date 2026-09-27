// สำรองข้อมูลทั้งหมดเป็น JSON (ใช้ใน GitHub Actions ทุกสัปดาห์ — ห้าม commit ไฟล์ผลลัพธ์ลง repo)
// ต้องมี env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret key ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น)
import { writeFileSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ตรงกับ EXPORT_TABLES ใน src/lib/dataio.ts
const TABLES = [
  'settings', 'goals', 'exercises', 'weight_programs', 'program_exercises', 'weight_rotation', 'weekly_schedule',
  'warmup_routines', 'run_plans', 'run_plan_days', 'plan_enrollments', 'shoes', 'runs', 'run_intervals', 'run_splits',
  'day_marks', 'weight_sessions', 'weight_sets', 'body_weight', 'body_comp', 'progress_photos', 'daily_checkin', 'pain_log',
  'foods', 'recipes', 'recipe_items', 'meal_templates', 'food_log', 'water_log', 'supplements', 'supplement_log',
  'nutrition_targets', 'weekly_reviews', 'tdee_proposals',
]

const headers = { apikey: key, Authorization: `Bearer ${key}` }
const tables = {}
let total = 0
for (const t of TABLES) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const filter = t === 'run_plans' || t === 'run_plan_days' ? '&user_id=not.is.null' : ''
    const res = await fetch(`${url}/rest/v1/${t}?select=*&order=id${filter}`, {
      headers: { ...headers, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`${t}: HTTP ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  tables[t] = rows
  total += rows.length
}

const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const file = `backup-${stamp}.json`
writeFileSync(file, JSON.stringify({ format: 'workout-log/export@1', exported_at: new Date().toISOString(), tables }))
console.log(`wrote ${file}: ${total} rows in ${TABLES.length} tables`)
