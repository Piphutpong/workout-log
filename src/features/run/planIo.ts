// Import/Export แผนวิ่งเป็น JSON (รูปแบบเดียวกับ supabase/seed_run_plans.json)
import { z } from 'zod'
import { upsertRows, uuid } from '@/lib/offline/queue'
import type { RunPlan, RunPlanDay, Segment, WorkoutType } from '@/types/database'

const WORKOUT_TYPES = [
  'rest', 'active_recovery', 'walk_run', 'easy', 'long', 'interval', 'tempo', 'threshold', 'vo2max', 'strides', 'race_test', 'weights',
] as const

const segmentSchema = z.custom<Segment>(
  (v) => typeof v === 'object' && v !== null && typeof (v as Segment).repeat === 'number',
  'segment ต้องมี repeat',
)

const daySchema = z.object({
  day_no: z.number().int().min(1),
  week_no: z.number().int().min(1).optional(),
  workout_type: z.enum(WORKOUT_TYPES),
  title: z.string().min(1),
  description: z.string().nullish(),
  repeat_of_week: z.number().int().min(1).nullish(),
  add_strides: z.boolean().optional(),
  add_weights: z.boolean().optional(),
  segments: z.array(segmentSchema).default([]),
  note: z.string().nullish(),
})

const planSchema = z.object({
  name: z.string().min(1),
  level: z.enum(['begin', 'performance']),
  goal_distance_km: z.number().nullish(),
  total_days: z.number().int().min(1).max(400),
  source: z.string().nullish(),
  note: z.string().nullish(),
  days: z.array(daySchema).min(1),
})

export const fileSchema = z.union([
  z.object({ plans: z.array(planSchema).min(1) }).passthrough(),
  planSchema.transform((p) => ({ plans: [p] })),
])

export type PlanExport = z.infer<typeof planSchema>

export function exportPlan(plan: RunPlan, days: RunPlanDay[]) {
  return {
    format: 'workout-log/run-plans@1',
    exported_at: new Date().toISOString(),
    plans: [{
      name: plan.name,
      level: plan.level,
      goal_distance_km: plan.goal_distance_km,
      total_days: plan.total_days,
      source: plan.source,
      note: plan.note,
      days: days.map((d) => ({
        day_no: d.day_no, week_no: d.week_no, workout_type: d.workout_type, title: d.title, description: d.description,
        repeat_of_week: d.repeat_of_week, add_strides: d.add_strides, add_weights: d.add_weights, segments: d.segments, note: d.note,
      })),
    }],
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parsePlanFile(text: string): PlanExport[] {
  const json = JSON.parse(text)
  const res = fileSchema.safeParse(json)
  if (!res.success) {
    const issue = res.error.issues[0]
    throw new Error(`ไฟล์ไม่ถูกต้อง: ${issue.path.join('.')} ${issue.message}`)
  }
  for (const p of res.data.plans) {
    const nos = new Set(p.days.map((d) => d.day_no))
    if (nos.size !== p.days.length) throw new Error(`แผน ${p.name}: มี day_no ซ้ำ`)
  }
  return res.data.plans
}

/** บันทึกแผนเป็นของผู้ใช้ (ใช้ทั้งคัดลอกและนำเข้า) คืน id ของแผนใหม่ */
export async function savePlanAsMine(p: PlanExport, name = p.name): Promise<string> {
  const planId = uuid()
  await upsertRows('run_plans', [{
    id: planId, name, level: p.level, goal_distance_km: p.goal_distance_km ?? null, total_days: p.total_days,
    source: p.source ?? null, note: p.note ?? null,
  }])
  await upsertRows('run_plan_days', p.days.map((d) => ({
    plan_id: planId,
    day_no: d.day_no,
    week_no: d.week_no ?? Math.floor((d.day_no - 1) / 7) + 1,
    workout_type: d.workout_type as WorkoutType,
    title: d.title,
    description: d.description ?? null,
    repeat_of_week: d.repeat_of_week ?? null,
    add_strides: d.add_strides ?? false,
    add_weights: d.add_weights ?? false,
    segments: d.segments,
    note: d.note ?? null,
  })))
  return planId
}
