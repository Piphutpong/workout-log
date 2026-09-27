import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEvening, buildMorning, buildWeekly, dueKinds, type NotifySettings, type Payload } from './messages.ts'

const settings: NotifySettings = { notify_email: true, notify_push: false, notify_weekly: true, notify_morning_time: '06:30:00', notify_evening_time: '20:30:00' }
const base: Payload = {
  date: '2026-10-12',
  plan: {
    activity: 'run', day_type: 'run_easy', source: 'plan', mark: null,
    plan: { plan_name: '21KM Begin', day_no: 11, total_days: 90 },
    plan_day: { title: 'Interval 20×100 ม. จ็อก 100 ม.', description: 'Interval 20x100m จ็อก 100m 85-90% Maxhr' },
    weight_program: null,
  },
  weighed: false, last_weight: 77.6, food_items: 0, kcal: 0, protein_g: 0,
  weight_done: false, run_done: false, checkin_done: false,
  goals: [{ title: 'น้ำหนัก 76.0 กก.', current: 77.6, target: 76, pct: 30.4, state: 'on_track' }],
}

describe('เวลาแจ้งเตือน', () => {
  it('หน้าต่าง 15 นาที + สรุปสัปดาห์เฉพาะวันจันทร์', () => {
    expect(dueKinds(settings, { hhmm: '06:30', dow: 1 })).toEqual(['morning', 'weekly'])
    expect(dueKinds(settings, { hhmm: '06:44', dow: 2 })).toEqual(['morning'])
    expect(dueKinds(settings, { hhmm: '06:45', dow: 2 })).toEqual([])
    expect(dueKinds(settings, { hhmm: '20:35', dow: 3 })).toEqual(['evening'])
    expect(dueKinds({ ...settings, notify_email: false }, { hhmm: '06:30', dow: 1 })).toEqual([])
    expect(dueKinds({ ...settings, notify_weekly: false }, { hhmm: '06:30', dow: 1 })).toEqual(['morning'])
  })
})

describe('ข้อความ', () => {
  it('เช้า: ชั่งน้ำหนัก + แผนวันนี้', () => {
    const m = buildMorning(base, 'https://x/app/')
    expect(m.body).toContain('ชั่งน้ำหนัก')
    expect(m.body).toContain('21KM Begin วันที่ 11/90: Interval 20×100 ม.')
    expect(m.url).toBe('https://x/app/#/today')
    expect(m.html).toContain('<h2')
  })
  it('ค่ำ: เตือนเฉพาะที่ยังขาด และไม่ส่งถ้าครบ', () => {
    const m = buildEvening(base, 'https://x/')!
    expect(m.body).toContain('ยังไม่ได้บันทึกอาหาร')
    expect(m.body).toContain('ยังไม่ได้บันทึกวิ่ง')
    expect(buildEvening({ ...base, food_items: 5, run_done: true, weighed: true }, 'https://x/')).toBeNull()
    // ข้ามวันแล้ว ไม่ต้องเตือนเรื่องออกกำลังกาย
    const skipped = buildEvening({ ...base, food_items: 3, weighed: true, plan: { ...base.plan, mark: 'skipped' } }, 'https://x/')
    expect(skipped).toBeNull()
  })
  it('สรุปสัปดาห์: ใช้ review ที่เก็บไว้ ถ้าไม่มีคำนวณจากกฎ', () => {
    const w1 = buildWeekly({ ...base, week_start: '2026-10-05', review: { good: ['A'], improve: ['B'] } }, 'https://x/')
    expect(w1.body).toContain('✅ A')
    const w2 = buildWeekly({
      ...base, week_start: '2026-10-05', review: null,
      stats: {
        week_start: '2026-10-05', planned_weight: 3, done_weight: 3, planned_run: 3, done_run: 3, active_days: 6, skipped_days: 0,
        weight_avg: 77.6, weight_prev_avg: 77.9, weight_prev2_avg: 78.2, run_km: 30, run_km_prev: 20, resting_hr_avg: null,
        resting_hr_baseline: null, sleep_avg: null, training_weeks_no_deload: 1, prs: 0, protein_days_hit: 0, food_days: 0,
        low_protein_streak: 0, high_rhr_streak: 0, low_sleep_streak: 0, pain: [], stalled_exercises: [], grip_exercises: [], shoes_near_retire: [],
      },
    }, 'https://x/')
    expect(w2.improve[0]).toContain('ระยะวิ่งเพิ่ม 50%')
  })
})

describe('กฎชุดเดียวกับแอป', () => {
  it('supabase/functions/_shared/rules.ts ตรงกับ src/lib/rules.ts (รัน npm run shared:sync)', () => {
    const a = readFileSync('src/lib/rules.ts', 'utf8')
    const b = readFileSync('supabase/functions/_shared/rules.ts', 'utf8')
    expect(b).toBe(a)
  })
})
