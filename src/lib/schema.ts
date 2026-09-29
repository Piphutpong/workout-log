// โครงสร้างตารางใน Google Sheet (1 ตาราง = 1 แท็บ, แถวแรกเป็นชื่อคอลัมน์)
// ไฟล์เดียวนี้ใช้ร่วมกันทั้งแอป, Apps Script (gas/Code.gs ถูกสร้างจากไฟล์นี้ด้วย npm run gas:build) และสคริปต์ย้ายข้อมูล
// ชนิด: s = ข้อความ, d = วันที่ YYYY-MM-DD (เก็บเป็นข้อความ), n = ตัวเลข, b = true/false, j = JSON
export type ColType = 's' | 'd' | 'n' | 'b' | 'j'

const base = { id: 's', user_id: 's', created_at: 's', updated_at: 's' } as const

export const SCHEMA = {
  settings: { ...base, display_name: 's', sex: 's', height_cm: 'n', birth_date: 'd', max_hr: 'n', target_weight_kg: 'n', program_start_date: 'd',
    default_rest_sec: 'n', weight_step_lb: 'n', pinned_pain_parts: 'j', notify_email: 'b', notify_morning_time: 's', notify_evening_time: 's',
    notify_weekly: 'b', notify_push: 'b', onboarded_at: 's', nutrition_mode: 's', deload_week_start: 'd', weather_lat: 'n', weather_lon: 'n' },
  goals: { ...base, goal_type: 's', title: 's', metric: 's', start_value: 'n', start_date: 'd', target_value: 'n', target_date: 'd', direction: 's',
    status: 's', achieved_at: 's', sort_order: 'n' },
  exercises: { ...base, name: 's', measure_type: 's', muscle_group: 's', grip_intensive: 'b', note: 's', active: 'b' },
  weight_programs: { ...base, name: 's', description: 's', color: 's', is_warmup: 'b', sort_order: 'n', active: 'b' },
  program_exercises: { ...base, program_id: 's', exercise_id: 's', sort_order: 'n', target_sets: 'n', target_reps: 'n', target_seconds: 'n',
    target_weight_lb: 'n', rest_sec: 'n', note: 's', superset_group: 's', target_reps_max: 'n' },
  weight_sessions: { ...base, date: 'd', program_id: 's', duration_min: 'n', is_deload: 'b', note: 's' },
  weight_sets: { ...base, session_id: 's', exercise_id: 's', date: 'd', set_no: 'n', weight_lb: 'n', reps: 'n', seconds: 'n', band_level: 's', rpe: 'n' },
  weekly_schedule: { ...base, day_of_week: 'n', activity: 's', run_type: 's', title: 's', segments: 'j' },
  weight_rotation: { ...base, sort_order: 'n', program_id: 's' },
  warmup_routines: { ...base, name: 's', activity_type: 's', items: 'j' },
  run_plans: { ...base, slug: 's', name: 's', level: 's', goal_distance_km: 'n', total_days: 'n', source: 's', note: 's', active: 'b' },
  run_plan_days: { ...base, plan_id: 's', day_no: 'n', week_no: 'n', workout_type: 's', title: 's', description: 's', repeat_of_week: 'n',
    add_strides: 'b', add_weights: 'b', segments: 'j', note: 's' },
  plan_enrollments: { ...base, plan_id: 's', start_date: 'd', status: 's', day_offset: 'n' },
  day_marks: { ...base, date: 'd', status: 's', activity: 's', plan_day_id: 's', note: 's' },
  shoes: { ...base, name: 's', start_date: 'd', start_km: 'n', retire_km: 'n', active: 'b' },
  runs: { ...base, date: 'd', time_of_day: 's', plan_day_id: 's', run_type: 's', distance_km: 'n', duration_sec: 'n', pace_sec_per_km: 'n',
    avg_hr: 'n', max_hr: 'n', rpe: 'n', feeling: 'n', completed: 's', shoe_id: 's', temp_c: 'n', humidity_pct: 'n', source: 's', external_id: 's', note: 's' },
  run_intervals: { ...base, run_id: 's', rep_no: 'n', distance_m: 'n', duration_sec: 'n', avg_hr: 'n' },
  run_splits: { ...base, run_id: 's', km_no: 'n', duration_sec: 'n', avg_hr: 'n', elevation_gain_m: 'n' },
  body_weight: { ...base, date: 'd', weight_kg: 'n', note: 's' },
  body_comp: { ...base, date: 'd', weight_kg: 'n', smm_kg: 'n', body_fat_kg: 'n', pbf_pct: 'n', visceral_fat: 'n', waist_cm: 'n', note: 's' },
  progress_photos: { ...base, date: 'd', angle: 's', storage_path: 's', weight_kg: 'n', note: 's' },
  daily_checkin: { ...base, date: 'd', sleep_hours: 'n', energy: 'n', soreness: 'n', resting_hr: 'n', steps: 'n', note: 's' },
  pain_log: { ...base, date: 'd', body_part: 's', side: 's', score: 'n', context: 's', linked_session_id: 's', linked_run_id: 's', pinned: 'b', note: 's' },
  foods: { ...base, name: 's', name_en: 's', brand: 's', serving_desc: 's', serving_g: 'n', calories: 'n', protein_g: 'n', carb_g: 'n', fat_g: 'n',
    fiber_g: 'n', sodium_mg: 'n', category: 's', source: 's', barcode: 's', is_estimate: 'b', is_favorite: 'b' },
  recipes: { ...base, name: 's', servings: 'n', note: 's' },
  recipe_items: { ...base, recipe_id: 's', food_id: 's', amount_g: 'n' },
  meal_templates: { ...base, name: 's', items: 'j' },
  food_log: { ...base, date: 'd', meal: 's', food_id: 's', recipe_id: 's', name: 's', servings: 'n', calories: 'n', protein_g: 'n', carb_g: 'n',
    fat_g: 'n', fiber_g: 'n', sodium_mg: 'n', time: 's', note: 's' },
  water_log: { ...base, date: 'd', ml: 'n' },
  supplements: { ...base, name: 's', dose: 's', timing: 's', active: 'b' },
  supplement_log: { ...base, date: 'd', supplement_id: 's', taken: 'b' },
  nutrition_targets: { ...base, day_type: 's', kcal: 'n', protein_g: 'n', carb_g: 'n', fat_g: 'n' },
  weekly_reviews: { ...base, week_start: 'd', good: 'j', improve: 'j', stats: 'j' },
  tdee_proposals: { ...base, week_start: 'd', mode: 's', tdee: 'n', avg_kcal: 'n', weight_change_kg: 'n', window_days: 'n', days_logged: 'n',
    current_avg_target: 'n', proposed_delta: 'n', status: 's' },
  push_subscriptions: { ...base, endpoint: 's', p256dh: 's', auth: 's', user_agent: 's' },
  notification_log: { ...base, date: 'd', kind: 's', channels: 'j', title: 's', body: 's' },
} as const satisfies Record<string, Record<string, ColType>>

export type SheetTable = keyof typeof SCHEMA
export const TABLES = Object.keys(SCHEMA) as SheetTable[]

/** unique key ตามธรรมชาติ (upsert ด้วย key นี้ถ้าไม่ได้ส่ง id ที่มีอยู่) */
export const UNIQUE: Partial<Record<SheetTable, string[]>> = {
  settings: ['user_id'],
  body_weight: ['date'],
  daily_checkin: ['date'],
  weekly_schedule: ['day_of_week'],
  nutrition_targets: ['day_type'],
  supplement_log: ['date', 'supplement_id'],
  weekly_reviews: ['week_start'],
  tdee_proposals: ['week_start'],
  run_plan_days: ['plan_id', 'day_no'],
  exercises: ['name'],
  push_subscriptions: ['endpoint'],
  notification_log: ['date', 'kind'],
}

/** ลบแม่แล้วลบลูกตาม (แทน ON DELETE CASCADE) */
export const CASCADE: Partial<Record<SheetTable, { table: SheetTable; col: string }[]>> = {
  weight_sessions: [{ table: 'weight_sets', col: 'session_id' }],
  weight_programs: [{ table: 'program_exercises', col: 'program_id' }, { table: 'weight_rotation', col: 'program_id' }],
  runs: [{ table: 'run_intervals', col: 'run_id' }, { table: 'run_splits', col: 'run_id' }],
  recipes: [{ table: 'recipe_items', col: 'recipe_id' }],
  run_plans: [{ table: 'run_plan_days', col: 'plan_id' }, { table: 'plan_enrollments', col: 'plan_id' }],
  supplements: [{ table: 'supplement_log', col: 'supplement_id' }],
}

/** ลบแม่แล้วตั้งค่าคอลัมน์ลูกเป็น null (แทน ON DELETE SET NULL) */
export const SET_NULL: Partial<Record<SheetTable, { table: SheetTable; col: string }[]>> = {
  weight_programs: [{ table: 'weight_sessions', col: 'program_id' }],
  shoes: [{ table: 'runs', col: 'shoe_id' }],
  foods: [{ table: 'food_log', col: 'food_id' }],
  weight_sessions: [{ table: 'pain_log', col: 'linked_session_id' }],
  run_plan_days: [{ table: 'runs', col: 'plan_day_id' }, { table: 'day_marks', col: 'plan_day_id' }],
}

export const OWNER = 'owner'
