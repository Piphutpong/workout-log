// แผนประจำวัน (แทน SQL today_plan / resolve_plan_day / weight_program_for)
import { dayOfWeek } from '@/lib/date'
import { planDayNo, repeatSourceDayNo } from '@/lib/calc'
import type { Activity, DayType, ResolvedPlanDay, TodayPlan } from '@/types/database'
import { byDesc, type Db } from './db'

/** วันในแผนที่ขยาย "ทำซ้ำ Week X" แล้ว */
export function resolvePlanDay(db: Db, planId: string, dayNo: number): ResolvedPlanDay | null {
  const days = db.rows('run_plan_days').filter((d) => d.plan_id === planId)
  const d = days.find((x) => x.day_no === dayNo)
  if (!d) return null
  const res: ResolvedPlanDay = { ...d, segments: d.segments ?? [] }
  if (d.repeat_of_week) {
    const src = days.find((x) => x.day_no === repeatSourceDayNo(d.day_no, d.week_no, d.repeat_of_week!))
    if (src) {
      Object.assign(res, {
        workout_type: src.workout_type,
        title: src.title,
        segments: src.segments ?? [],
        add_strides: d.add_strides || src.add_strides,
        add_weights: d.add_weights || src.add_weights,
        repeat_source_day_no: src.day_no,
        repeat_source_description: src.description ?? undefined,
      })
    }
  }
  return res
}

export function dayTypeOf(activity: Activity, workout: string | null | undefined): DayType {
  if (activity === 'weight') return 'weight'
  if (activity === 'run') return ['interval', 'tempo', 'threshold', 'vo2max', 'race_test', 'long'].includes(workout ?? '') ? 'run_hard' : 'run_easy'
  return 'rest'
}

/** โปรแกรมเวทของวันนั้น: ถ้าเล่นแล้วคืนโปรแกรมที่เล่น ไม่งั้นคืนโปรแกรมถัดจาก session ล่าสุดตาม rotation */
export function weightProgramFor(db: Db, date: string): string | null {
  const programs = new Map(db.rows('weight_programs').map((p) => [p.id, p]))
  const sessions = db.rows('weight_sessions')
  const today = sessions
    .filter((s) => s.date === date && s.program_id && programs.get(s.program_id) && !programs.get(s.program_id)!.is_warmup)
    .sort(byDesc((s) => s.created_at))[0]
  if (today) return today.program_id
  const rot = [...db.rows('weight_rotation')].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  if (!rot.length) return null
  const inRot = new Set(rot.map((r) => r.program_id))
  const last = sessions
    .filter((s) => s.date < date && s.program_id && inRot.has(s.program_id))
    .sort(byDesc((s) => s.date, (s) => s.created_at))[0]
  const pos = last ? rot.findIndex((r) => r.program_id === last.program_id) : -1
  return rot[pos >= 0 ? (pos + 1) % rot.length : 0].program_id
}

export function todayPlan(db: Db, date: string): TodayPlan {
  let source: TodayPlan['source'] = 'schedule'
  let activity: Activity = 'rest'
  let workout: string | null = null
  let day: ResolvedPlanDay | null = null
  let plan: TodayPlan['plan'] = null

  const enr = db.rows('plan_enrollments').filter((e) => e.status === 'active').sort(byDesc((e) => e.created_at))[0]
  const p = enr && db.rows('run_plans').find((x) => x.id === enr.plan_id)
  if (enr && p) {
    const dayNo = planDayNo(date, enr.start_date, enr.day_offset)
    plan = {
      enrollment_id: enr.id, plan_id: p.id, plan_name: p.name, day_no: dayNo, total_days: p.total_days,
      status: dayNo < 1 ? 'not_started' : dayNo > p.total_days ? 'finished' : 'in_progress',
    }
    if (dayNo >= 1 && dayNo <= p.total_days) {
      day = resolvePlanDay(db, p.id, dayNo)
      if (day) {
        source = 'plan'
        workout = day.workout_type
        activity = workout === 'rest' ? 'rest' : workout === 'active_recovery' ? 'active_recovery' : workout === 'weights' ? 'weight' : 'run'
      }
    }
  }

  if (source === 'schedule') {
    const sch = db.rows('weekly_schedule').find((s) => s.day_of_week === dayOfWeek(date))
    if (sch) {
      activity = sch.activity
      workout = sch.run_type
      if (sch.activity === 'run') {
        day = { workout_type: (sch.run_type ?? 'easy') as ResolvedPlanDay['workout_type'], title: sch.title ?? 'วิ่ง', segments: sch.segments ?? [], add_weights: false, add_strides: false }
      }
    }
  }

  let weightProgram: TodayPlan['weight_program'] = null
  if (activity === 'weight' || day?.add_weights) {
    const id = weightProgramFor(db, date)
    const prog = id ? db.rows('weight_programs').find((x) => x.id === id) : undefined
    if (prog) weightProgram = { id: prog.id, name: prog.name, color: prog.color }
  }

  const mark = db.rows('day_marks').find((m) => m.date === date)
  return {
    date, source, activity, workout_type: workout, day_type: dayTypeOf(activity, workout),
    plan, plan_day: day, weight_program: weightProgram, mark: mark?.status ?? null,
  }
}
