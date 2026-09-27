import { describe, expect, it } from 'vitest'
import type { WeeklyReviewStats } from '@/types/database'
import { evaluateWeek } from './rules'

const base: WeeklyReviewStats = {
  week_start: '2026-10-05', planned_weight: 3, done_weight: 3, planned_run: 3, done_run: 3, active_days: 6, skipped_days: 0,
  weight_avg: 77.6, weight_prev_avg: 77.9, weight_prev2_avg: 78.2, run_km: 15, run_km_prev: 14,
  resting_hr_avg: 55, resting_hr_baseline: 54, sleep_avg: 7.2, training_weeks_no_deload: 2, prs: 1,
  protein_days_hit: 6, food_days: 7, low_protein_streak: 0, high_rhr_streak: 0, low_sleep_streak: 0,
  pain: [], stalled_exercises: [], grip_exercises: ['One-arm DB row'], shoes_near_retire: [],
}
const keys = (l: { key: string }[]) => l.map((m) => m.key)

describe('สรุปรายสัปดาห์ (กฎข้อ 6)', () => {
  it('สัปดาห์ที่ดี: มีข้อดี ไม่มีข้อต้องปรับ และไม่เกิน 3 ข้อ', () => {
    const r = evaluateWeek(base)
    expect(r.improve).toEqual([])
    expect(r.good).toHaveLength(3)
    expect(keys(r.good)).toContain('all_done')
  })
  it('น้ำหนักลดเร็วกว่า 0.5 กก./สัปดาห์', () => {
    expect(keys(evaluateWeek({ ...base, weight_avg: 77.2 }).improve)).toContain('weight_fast')
  })
  it('น้ำหนักไม่ลด 2 สัปดาห์ติด', () => {
    const r = evaluateWeek({ ...base, weight_avg: 78, weight_prev_avg: 78, weight_prev2_avg: 77.9 })
    expect(keys(r.improve)).toContain('weight_stall')
  })
  it('ระยะวิ่งเพิ่มเกิน 10%', () => {
    expect(keys(evaluateWeek({ ...base, run_km: 16, run_km_prev: 14 }).improve)).toContain('run_jump')
    expect(keys(evaluateWeek({ ...base, run_km: 15.4, run_km_prev: 14 }).improve)).not.toContain('run_jump')
  })
  it('เจ็บ ≥ 4 ติดกัน 3 ครั้ง มาก่อนเรื่องอื่น', () => {
    const r = evaluateWeek({ ...base, run_km: 30, pain: [{ part: 'ศอกซ้าย', avg: 4.3, prev_avg: 4, last3_high: true }] })
    expect(r.improve[0].key).toBe('pain_high:ศอกซ้าย')
  })
  it('ความเจ็บศอกสูงขึ้น → ลดท่าบีบจับ', () => {
    const r = evaluateWeek({ ...base, pain: [{ part: 'ศอกซ้าย', avg: 3, prev_avg: 2, last3_high: false }] })
    expect(r.improve[0].text).toContain('One-arm DB row')
  })
  it('ท่าไม่พัฒนา / deload / ฟื้นตัว / โปรตีน / รองเท้า', () => {
    const r = evaluateWeek({
      ...base, stalled_exercises: ['Goblet squat'], training_weeks_no_deload: 7, low_sleep_streak: 3,
      low_protein_streak: 3, shoes_near_retire: [{ name: 'Pegasus', km: 650, retire_km: 700 }],
    })
    expect(r.improve).toHaveLength(3)
    expect(keys(r.improve)).toEqual(['recovery', 'deload', 'protein_low'])
  })
})
