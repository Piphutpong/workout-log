import type { DayActivity, WeeklySummary } from '@/types/database'

export interface Consistency {
  weight: { done: number; planned: number }
  run: { done: number; planned: number }
  activeDays: number
}

/** นับจากแผนทั้งช่วง (รวมวันที่ยังไม่ถึง) เทียบกับที่ทำไปแล้ว */
export function consistencyOf(days: DayActivity[], from: string, to: string): Consistency {
  const inRange = days.filter((d) => d.date >= from && d.date <= to)
  return {
    weight: {
      planned: inRange.filter((d) => d.planned === 'weight').length,
      done: inRange.filter((d) => d.weight_done).length,
    },
    run: {
      planned: inRange.filter((d) => d.planned === 'run').length,
      done: inRange.filter((d) => d.run_done).length,
    },
    activeDays: inRange.filter((d) => d.weight_done || d.run_done).length,
  }
}

export const pct = (done: number, planned: number) => (planned ? Math.min(100, Math.round((done / planned) * 100)) : null)

/**
 * Streak = จำนวนสัปดาห์ติดต่อกันที่ออกกำลังกาย ≥ 5 วัน
 * นับย้อนจากสัปดาห์ที่แล้ว (สัปดาห์นี้นับด้วยถ้าได้ ≥ 5 วันแล้ว)
 */
export function streakWeeks(weeks: Pick<WeeklySummary, 'week_start' | 'active_days'>[], currentWeekStart: string, minDays = 5): number {
  const byWeek = new Map(weeks.map((w) => [w.week_start, Number(w.active_days)]))
  let n = (byWeek.get(currentWeekStart) ?? 0) >= minDays ? 1 : 0
  let wk = shift(currentWeekStart, -7)
  while ((byWeek.get(wk) ?? 0) >= minDays) {
    n++
    wk = shift(wk, -7)
  }
  return n
}

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
