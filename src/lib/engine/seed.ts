// ข้อมูลตั้งต้นของผู้ใช้ใหม่ (แทน SQL bootstrap_user + seed_toning_programs + seed_foods)
import { addDays } from '@/lib/date'
import type { TableName } from '@/types/database'
import foodsSeed from '@/data/foods-seed.json'
import toningSeed from '@/data/toning-seed.json'

type Row = Record<string, unknown>
const uuid = () => crypto.randomUUID()

export function bootstrapRows(start: string): Partial<Record<TableName, Row[]>> {
  const ex: Row[] = []
  const exId = new Map<string, string>()
  const addEx = (name: string, measure_type: string, muscle_group: string, grip = false, note: string | null = null) => {
    if (exId.has(name)) return exId.get(name)!
    const id = uuid()
    exId.set(name, id)
    ex.push({ id, name, measure_type, muscle_group, grip_intensive: grip, note, active: true })
    return id
  }
  const programs: Row[] = []
  const pe: Row[] = []
  const addProgram = (name: string, description: string, color: string, sort_order: number, is_warmup = false) => {
    const id = uuid()
    programs.push({ id, name, description, color, is_warmup, sort_order, active: true })
    return id
  }

  // 4.2 โปรแกรม A / B / Rehab
  const rehab = addProgram('Rehab', 'วอร์มอัพ/ฟื้นฟูศอกซ้าย ทำก่อนเล่นเวททุกครั้ง', '#10b981', 0, true)
  const a = addProgram('A', 'Full body A', '#3b82f6', 1)
  const b = addProgram('B', 'Full body B', '#f59e0b', 2)
  let order = 0
  const add = (program: string, name: string, m: string, g: string, sets: number, reps: number | null, sec: number | null, rest = 90, grip = false) =>
    pe.push({ id: uuid(), program_id: program, exercise_id: addEx(name, m, g, grip), sort_order: ++order, target_sets: sets,
      target_reps: reps, target_seconds: sec, target_weight_lb: null, rest_sec: rest, superset_group: null, target_reps_max: null })
  add(rehab, 'Isometric wrist flexion', 'seconds', 'แขนท่อนล่าง', 5, null, 45, 30)
  add(rehab, 'Eccentric wrist curl', 'reps', 'แขนท่อนล่าง', 3, 15, null, 45)
  add(rehab, 'Eccentric pronation', 'reps', 'แขนท่อนล่าง', 3, 15, null, 45)
  add(rehab, 'Forearm flexor stretch', 'seconds', 'แขนท่อนล่าง', 2, null, 30, 15)
  add(a, 'Goblet squat', 'reps', 'ขา', 3, 10, null)
  add(a, 'DB bench press (neutral grip)', 'reps', 'อก', 3, 10, null, 90, true)
  add(a, 'One-arm DB row', 'reps', 'หลัง', 3, 10, null, 90, true)
  add(a, 'DB Romanian deadlift', 'reps', 'ขาหลัง/ก้น', 3, 10, null, 90, true)
  add(a, 'Band lateral raise', 'band', 'ไหล่', 3, 15, null, 60)
  add(a, 'Plank', 'seconds', 'แกนกลาง', 3, null, 40, 60)
  add(b, 'Bulgarian split squat', 'reps', 'ขา', 3, 8, null)
  add(b, 'Incline DB press', 'reps', 'อก', 3, 10, null, 90, true)
  add(b, 'Band pulldown/row', 'band', 'หลัง', 3, 12, null, 60)
  add(b, 'Hip thrust', 'reps', 'ก้น', 3, 12, null)
  add(b, 'Band face pull', 'band', 'ไหล่หลัง', 3, 15, null, 60)
  add(b, 'Dead bug', 'reps', 'แกนกลาง', 3, 10, null, 60)

  // โปรแกรม "กระชับกล้ามเนื้อ (นายแบบ)" จากหนังสือ หน้า 132
  const toning = [
    addProgram('นายแบบ 1: อก-หลัง-ท้อง', 'กระชับกล้ามเนื้อ (หนังสือ หน้า 132) วันที่ 1 · 4×15-20 ครั้ง ทำเป็น superset · วันถัดไป Cardio 60 นาทีก่อนอาหารเช้า', '#ec4899', 11),
    addProgram('นายแบบ 2: ขา-น่อง-ท้อง', 'กระชับกล้ามเนื้อ วันที่ 3 · ต้นขาด้านหน้า-หลัง, น่อง · 4×15-20 ครั้ง superset · วันถัดไป Cardio 60 นาทีก่อนอาหารเช้า', '#14b8a6', 12),
    addProgram('นายแบบ 3: ไหล่-แขน-ท้อง', 'กระชับกล้ามเนื้อ วันที่ 5 · ไหล่, ต้นแขนด้านหน้า-หลัง · 4×15-20 ครั้ง superset (หนังสือระบุ "ท้อง" แต่ไม่มีท่าท้องในหน้านี้)', '#8b5cf6', 13),
  ]
  ;(toningSeed as { p: number; ss: string; name: string; g: string; grip?: boolean; page: string }[]).forEach((t, i) => {
    const id = exId.get(t.name) ?? addEx(t.name, 'reps', t.g, t.grip ?? false, `หนังสือ ${t.page}`)
    pe.push({ id: uuid(), program_id: toning[t.p - 1], exercise_id: id, sort_order: 100 + i, target_sets: 4, target_reps: 15, target_reps_max: 20,
      target_seconds: null, target_weight_lb: null, rest_sec: i % 2 === 0 ? 0 : 60, superset_group: t.ss })
  })

  const run = (title: string, run_type: string, seg: Row) => ({ run_type, title, segments: [seg] })
  const schedule = [
    { day_of_week: 0, activity: 'rest' }, { day_of_week: 1, activity: 'weight' },
    { day_of_week: 2, activity: 'run', ...run('Easy 30-40 นาที', 'easy', { repeat: 1, work_sec: 1800, work_sec_max: 2400, work_type: 'run', zone: '2', hr_min_pct: 60, hr_max_pct: 70 }) },
    { day_of_week: 3, activity: 'weight' },
    { day_of_week: 4, activity: 'run', ...run('Interval วิ่งเร็ว 1 นาที / ช้า 2 นาที × 6', 'interval', { repeat: 6, work_sec: 60, work_type: 'run', hr_min_pct: 80, hr_max_pct: 90, recover_sec: 120, recover_type: 'jog' }) },
    { day_of_week: 5, activity: 'weight' },
    { day_of_week: 6, activity: 'run', ...run('Long 45-50 นาที', 'long', { repeat: 1, work_sec: 2700, work_sec_max: 3000, work_type: 'run', zone: '2', hr_min_pct: 60, hr_max_pct: 70 }) },
  ].map((s) => ({ id: uuid(), run_type: null, title: null, segments: [], ...s }))

  return {
    settings: [{
      id: uuid(), sex: 'male', height_cm: 178.6, birth_date: `${Number(start.slice(0, 4)) - 34}-01-01`, max_hr: 186, target_weight_kg: 76,
      program_start_date: start, default_rest_sec: 90, weight_step_lb: 2.5, pinned_pain_parts: ['ศอกซ้าย'], notify_email: false,
      notify_morning_time: '06:30', notify_evening_time: '20:30', notify_weekly: true, notify_push: false, nutrition_mode: 'cut',
      weather_lat: 13.7563, weather_lon: 100.5018, deload_week_start: null, onboarded_at: null, display_name: null,
    }],
    body_comp: [{ id: uuid(), date: '2026-09-25', weight_kg: 78.3, smm_kg: 38.3, body_fat_kg: 11.6, pbf_pct: 14.8, visceral_fat: 4, waist_cm: null, note: 'InBody' }],
    body_weight: [{ id: uuid(), date: '2026-09-25', weight_kg: 78.3, note: 'InBody' }],
    goals: [
      { goal_type: 'body', title: 'น้ำหนัก 76.0 กก.', metric: 'weight_kg', start_value: 78.3, target_value: 76, target_date: addDays(start, 56), direction: 'down' },
      { goal_type: 'body', title: 'PBF 12%', metric: 'pbf_pct', start_value: 14.8, target_value: 12, target_date: null, direction: 'down' },
      { goal_type: 'body', title: 'SMM ไม่ต่ำกว่า 38.0 กก.', metric: 'smm_kg', start_value: 38.3, target_value: 38, target_date: null, direction: 'keep_above' },
      { goal_type: 'consistency', title: 'ออกกำลังกาย 6 วัน/สัปดาห์', metric: 'active_days_week', start_value: 0, target_value: 6, target_date: null, direction: 'up' },
      { goal_type: 'body', title: 'เจ็บศอกซ้ายเฉลี่ย 7 วัน ≤ 2', metric: 'pain_avg7:ศอกซ้าย', start_value: null, target_value: 2, target_date: null, direction: 'keep_below' },
    ].map((g, i) => ({ id: uuid(), start_date: start, status: 'active', achieved_at: null, sort_order: i + 1, ...g })),
    exercises: ex,
    weight_programs: programs,
    program_exercises: pe,
    weight_rotation: [{ id: uuid(), sort_order: 1, program_id: a }, { id: uuid(), sort_order: 2, program_id: b }],
    weekly_schedule: schedule,
    warmup_routines: [
      { id: uuid(), name: 'ก่อนเวท', activity_type: 'weight', items: [{ name: 'Rehab ศอกซ้าย (ตามโปรแกรม Rehab)', program_id: rehab }, { name: 'Mobility สะโพก/ไหล่/อก', sec: 300 }] },
      { id: uuid(), name: 'ก่อนวิ่งเบา', activity_type: 'run_easy', items: [{ name: 'เดินเร็ว/จ็อกเบาๆ', sec: 300 }] },
      { id: uuid(), name: 'ก่อนวิ่งเร็ว', activity_type: 'run_hard', items: [{ name: 'เดิน/จ็อกเบาๆ', sec: 600 }, { name: 'Drills: A-skip, B-skip, high knees, butt kicks' }, { name: 'Strides 60-80 ม.', reps: 4 }] },
    ],
    nutrition_targets: [
      ['weight', 2450, 160, 270, 75], ['run_easy', 2450, 160, 270, 75], ['run_hard', 2650, 160, 320, 75], ['rest', 2250, 160, 220, 75],
    ].map(([day_type, kcal, protein_g, carb_g, fat_g]) => ({ id: uuid(), day_type, kcal, protein_g, carb_g, fat_g })),
    supplements: [
      { id: uuid(), name: 'Whey protein', dose: '1 scoop', timing: 'หลังออกกำลัง', active: true },
      { id: uuid(), name: 'Creatine', dose: '5 g', timing: 'ทุกวัน', active: true },
    ],
    foods: (foodsSeed as Record<string, unknown>[]).map((x) => ({
      id: uuid(), name: x.n, name_en: x.en ?? null, brand: null, serving_desc: x.s, serving_g: x.g, calories: x.k, protein_g: x.p, carb_g: x.c,
      fat_g: x.f, fiber_g: x.fb ?? null, sodium_mg: x.na ?? null, category: x.cat, source: 'seed', barcode: null, is_estimate: true, is_favorite: Boolean(x.fav),
    })),
  }
}
