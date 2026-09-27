import { describe, expect, it } from 'vitest'
import type { DayActivity } from '@/types/database'
import { consistencyOf, pct, streakWeeks } from './consistency'

const day = (date: string, planned: DayActivity['planned'], w = false, r = false): DayActivity =>
  ({ date, planned, planned_workout: null, weight_done: w, run_done: r, run_km: null, mark: null })

describe('ความสม่ำเสมอ', () => {
  it('นับแผนทั้งสัปดาห์ เทียบกับที่ทำแล้ว', () => {
    const days = [
      day('2026-10-05', 'weight', true), day('2026-10-06', 'run', false, true), day('2026-10-07', 'weight'),
      day('2026-10-08', 'run'), day('2026-10-09', 'weight'), day('2026-10-10', 'run'), day('2026-10-11', 'rest'),
    ]
    const c = consistencyOf(days, '2026-10-05', '2026-10-11')
    expect(c.weight).toEqual({ planned: 3, done: 1 })
    expect(c.run).toEqual({ planned: 3, done: 1 })
    expect(c.activeDays).toBe(2)
    expect(pct(1, 3)).toBe(33)
    expect(pct(0, 0)).toBeNull()
  })
  it('streak สัปดาห์ที่ ≥ 5 วัน', () => {
    const weeks = [
      { week_start: '2026-09-14', active_days: 6 },
      { week_start: '2026-09-21', active_days: 3 },
      { week_start: '2026-09-28', active_days: 5 },
      { week_start: '2026-10-05', active_days: 6 },
      { week_start: '2026-10-12', active_days: 2 },
    ]
    expect(streakWeeks(weeks, '2026-10-12')).toBe(2)
    expect(streakWeeks(weeks, '2026-10-05')).toBe(2)
    expect(streakWeeks([...weeks, { week_start: '2026-10-19', active_days: 5 }], '2026-10-19')).toBe(1)
  })
})
