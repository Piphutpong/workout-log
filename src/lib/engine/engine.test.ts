// ทดสอบ engine ด้วยสถานการณ์เดียวกับที่เคยทดสอบบน Postgres (scripts/check-migrations.mjs เดิม)
import { describe, expect, it } from 'vitest'
import type { TableName } from '@/types/database'
import { dbFrom, sysDayId, sysPlanId } from './db'
import { resolvePlanDay, todayPlan } from './plan'
import { bootstrapRows } from './seed'
import {
  achievements, dailyNutrition, dayActivity, exerciseProgress, foodUsage, goalProgress, lastPerformance, lastRunByType,
  notificationPayload, personalRecords, prEvents, progressCompare, shoeUsage, tdeeInputs, weeklyReviewStats, weeklySummary,
} from './stats'

type Row = Record<string, unknown>
let clock = 0
const stamp = () => new Date(Date.UTC(2026, 8, 28, 0, 0, clock++)).toISOString()

function makeDb() {
  const tables: Partial<Record<TableName, Row[]>> = {}
  const seed = bootstrapRows('2026-09-28')
  for (const [t, rows] of Object.entries(seed)) tables[t as TableName] = rows!.map((r) => ({ user_id: 'owner', created_at: stamp(), updated_at: stamp(), ...r }))
  const insert = (t: TableName, r: Row) => {
    const row = { id: crypto.randomUUID(), user_id: 'owner', created_at: stamp(), updated_at: stamp(), ...r }
    ;(tables[t] ??= []).push(row)
    return row
  }
  return { tables, insert, db: dbFrom(tables) }
}

describe('engine (แทน SQL)', () => {
  const { tables, insert, db } = makeDb()
  const prog = (name: string) => tables.weight_programs!.find((p) => p.name === name)!.id as string
  const ex = (name: string) => tables.exercises!.find((e) => e.name === name)!.id as string

  it('bootstrap: ท่า โปรแกรม เป้าหมาย ตาราง เป้าโภชนาการ อาหาร', () => {
    expect(tables.exercises).toHaveLength(35) // 16 + 19 (Incline DB press ใช้ร่วม)
    expect(tables.program_exercises).toHaveLength(36)
    expect(tables.goals).toHaveLength(5)
    expect(tables.weekly_schedule).toHaveLength(7)
    expect(tables.nutrition_targets).toHaveLength(4)
    expect(tables.foods).toHaveLength(95)
    expect(tables.foods!.every((f) => f.is_estimate)).toBe(true)
    expect(db.rows('run_plans').filter((p) => p.user_id === null)).toHaveLength(5)
    const counts = Object.fromEntries(db.rows('run_plans').map((p) => [p.name, db.rows('run_plan_days').filter((d) => d.plan_id === p.id).length]))
    expect(counts).toEqual({ '5KM Begin': 90, '10KM Begin': 90, '10KM Performance': 90, '21KM Begin': 90, '21KM Performance': 74 })
  })

  it('today_plan จากตารางประจำสัปดาห์', () => {
    const mon = todayPlan(db, '2026-09-28')
    expect(mon.activity).toBe('weight')
    expect(mon.weight_program?.name).toBe('A')
    expect(mon.day_type).toBe('weight')
    expect(todayPlan(db, '2026-09-29').day_type).toBe('run_easy')
    expect(todayPlan(db, '2026-10-01').day_type).toBe('run_hard')
    expect(todayPlan(db, '2026-10-04').activity).toBe('rest')
  })

  it('rotation, last_performance, exercise_progress', () => {
    const s = insert('weight_sessions', { date: '2026-09-28', program_id: prog('A'), is_deload: false })
    for (const [i, reps] of [10, 10, 9].entries()) {
      insert('weight_sets', { session_id: s.id, exercise_id: ex('Goblet squat'), date: '2026-09-28', set_no: i + 1, weight_lb: 25, reps })
    }
    expect(todayPlan(db, '2026-09-30').weight_program?.name).toBe('B')
    expect(todayPlan(db, '2026-09-28').weight_program?.name).toBe('A')
    expect(lastPerformance(db).get(ex('Goblet squat'))!.sets).toHaveLength(3)
    const ep = exerciseProgress(db, ex('Goblet squat'))[0]
    expect(ep.e1rm_lb).toBe(33.3)
    expect(ep.volume_lb).toBe(725)
  })

  it('enroll แผน, ทำซ้ำ Week, เลื่อนแผน, day_marks', () => {
    const enr = insert('plan_enrollments', { plan_id: sysPlanId('fastbull-21k-begin'), start_date: '2026-10-01', status: 'active', day_offset: 0 })
    const d1 = todayPlan(db, '2026-10-01')
    expect(d1.source).toBe('plan')
    expect(d1.plan?.day_no).toBe(1)
    const d22 = todayPlan(db, '2026-10-22')
    expect(d22.plan_day?.repeat_source_day_no).toBe(8)
    expect(d22.plan_day?.segments[0].work_km).toBe(8)
    const d30 = todayPlan(db, '2026-10-30')
    expect(d30.plan_day?.workout_type).toBe('interval')
    expect(d30.plan_day?.add_weights).toBe(true)
    expect(d30.weight_program).not.toBeNull()
    const before = todayPlan(db, '2026-09-30')
    expect(before.source).toBe('schedule')
    expect(before.plan?.status).toBe('not_started')
    ;(enr as Row).day_offset = 1
    expect(todayPlan(db, '2026-10-22').plan?.day_no).toBe(21)
    insert('day_marks', { date: '2026-10-21', status: 'postponed', activity: 'run' })
    expect(todayPlan(db, '2026-10-21').mark).toBe('postponed')
    expect(resolvePlanDay(db, sysPlanId('fastbull-21k-begin'), 22)?.id).toBe(sysDayId('fastbull-21k-begin', 22))
  })

  it('runs, โภชนาการ, goal_progress, weekly_summary', () => {
    insert('runs', { date: '2026-09-29', run_type: 'easy', distance_km: 6, duration_sec: 2160, pace_sec_per_km: 360, avg_hr: 140, completed: 'full' })
    insert('runs', { date: '2026-10-01', run_type: 'interval', distance_km: 5, duration_sec: 1650, pace_sec_per_km: 330, avg_hr: 160, completed: 'full' })
    expect(lastRunByType(db).get('easy')!.pace_sec_per_km).toBe(360)
    for (const [date, w] of [['2026-09-28', 78.2], ['2026-09-30', 78.0], ['2026-10-02', 77.9], ['2026-10-05', 77.6], ['2026-10-07', 77.5]] as const) {
      insert('body_weight', { date, weight_kg: w })
    }
    insert('food_log', { date: '2026-09-28', meal: 'เช้า', name: 'test', servings: 1, calories: 2400, protein_g: 165, carb_g: 260, fat_g: 70 })
    const dn = dailyNutrition(db).find((d) => d.date === '2026-09-28')!
    expect(dn.day_type).toBe('weight')
    expect(dn.protein_hit).toBe(true)
    const gw = goalProgress(db, '2026-10-07').find((g) => g.metric === 'weight_kg')!
    expect(gw.current_value).toBe(77.67)
    expect(gw.progress_pct).toBe(27.4)
    expect(gw.state).toBe('on_track')
    expect(gw.forecast_date).toBe('2026-10-31')
    expect(goalProgress(db, '2026-10-07').find((g) => g.metric === 'smm_kg')!.state).toBe('on_track')
    const w = weeklySummary(db).find((x) => x.week_start === '2026-09-28')!
    expect(w.active_days).toBe(3)
    expect(w.run_km).toBe(11)
  })

  it('PR, personal records, compare, achievements, day_activity, weekly_review_stats', () => {
    const s2 = insert('weight_sessions', { date: '2026-10-05', program_id: prog('A'), is_deload: false })
    insert('weight_sets', { session_id: s2.id, exercise_id: ex('Goblet squat'), date: '2026-10-05', set_no: 1, weight_lb: 30, reps: 10 })
    insert('weight_sets', { session_id: s2.id, exercise_id: ex('Goblet squat'), date: '2026-10-05', set_no: 2, weight_lb: 30, reps: 10 })
    const prs = prEvents(db)
    expect(prs).toHaveLength(1)
    expect(prs[0].e1rm_lb).toBe(40)
    for (const [date, sleep, rhr] of [['2026-10-05', 5.5, 55], ['2026-10-06', 5, 56], ['2026-10-07', 5.5, 54]] as const) {
      insert('daily_checkin', { date, sleep_hours: sleep, resting_hr: rhr })
    }
    for (const [date, score] of [['2026-10-01', 5], ['2026-10-03', 4], ['2026-10-06', 4]] as const) insert('pain_log', { date, body_part: 'ศอกซ้าย', score })
    insert('body_comp', { date: '2026-10-07', weight_kg: 77.5, smm_kg: 38.4, pbf_pct: 14.1, waist_cm: 82 })

    const pr = personalRecords(db)
    expect(pr.exercises.find((e) => e.name === 'Goblet squat')!.best_e1rm_lb).toBe(40)
    expect(pr.best_5k?.sec).toBe(1650)
    expect(pr.longest?.distance_km).toBe(6)
    const cmp = progressCompare(db, '2026-09-28', '2026-10-07')
    expect(cmp.body.pbf_pct).toMatchObject({ current: 14.1, ref: 14.8 })
    const first = progressCompare(db, null, '2026-10-07')
    expect(first.lifts.exercises.length).toBeGreaterThanOrEqual(1)
    expect(first.pain[0].part).toBe('ศอกซ้าย')
    expect(achievements(db, '2026-10-07').find((a) => a.key === 'sessions_10')!.value).toBe(4)
    const act = dayActivity(db, '2026-09-28', '2026-10-04')
    expect(act).toHaveLength(7)
    expect(act[0].weight_done).toBe(true)
    const st = weeklyReviewStats(db, '2026-10-05')
    expect(st.low_sleep_streak).toBe(3)
    expect(st.pain[0].last3_high).toBe(true)
    expect(st.training_weeks_no_deload).toBe(2)
    expect(st.prs).toBe(1)
  })

  it('อาหาร, TDEE, รองเท้า, ข้อมูลแจ้งเตือน', () => {
    const egg = tables.foods!.find((f) => f.name === 'ไข่ต้ม')!
    insert('food_log', { date: '2026-10-06', meal: 'เช้า', food_id: egg.id, servings: 2, calories: 144, protein_g: 12.6, carb_g: 0.8, fat_g: 9.6 })
    insert('food_log', { date: '2026-10-07', meal: 'เช้า', food_id: egg.id, servings: 1, calories: 72, protein_g: 6.3, carb_g: 0.4, fat_g: 4.8 })
    expect(foodUsage(db).find((u) => u.food_id === egg.id)!.uses).toBe(2)
    const ti = tdeeInputs(db, '2026-10-07')
    expect(ti.w14).toEqual({ days_logged: 3, avg_kcal: 872, weight_first: 78.17, weight_last: 77.67 })
    expect(ti.current_avg_target).toBeGreaterThanOrEqual(2250)
    expect(ti.current_avg_target).toBeLessThanOrEqual(2650)
    expect(ti.mode).toBe('cut')
    const shoe = insert('shoes', { name: 'Pegasus', start_km: 620, retire_km: 700, active: true })
    for (const r of tables.runs!) r.shoe_id = shoe.id
    expect(shoeUsage(db).get(shoe.id as string)).toMatchObject({ km: 631, runs: 2 })
    const np = notificationPayload(db, '2026-10-06', true) as ReturnType<typeof notificationPayload> & { week_start: string; stats: { active_days: number } }
    expect(np.plan.date).toBe('2026-10-06')
    expect(np.food_items).toBe(1)
    expect(np.weighed).toBe(false)
    expect(np.goals.length).toBeGreaterThanOrEqual(4)
    expect(np.week_start).toBe('2026-09-28')
    expect(np.stats.active_days).toBe(3)
  })
})
