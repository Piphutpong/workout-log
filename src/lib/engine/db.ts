// ชั้นข้อมูลสำหรับ engine: อ่านแถวของแต่ละตาราง (จาก store ในเครื่อง หรือจากข้อมูลที่ดึงมาใน GitHub Actions)
import type { RowOf, RunPlan, RunPlanDay, TableName } from '@/types/database'
import plansFile from '@/data/run-plans.json'

export interface Db {
  rows<T extends TableName>(t: T): RowOf<T>[]
}

/** สร้าง Db จาก object ธรรมดา (ใช้ใน test และสคริปต์) — รวมแผนวิ่งระบบให้อัตโนมัติ */
export function dbFrom(tables: Partial<Record<TableName, unknown[]>>): Db {
  return {
    rows<T extends TableName>(t: T) {
      const own = (tables[t] ?? []) as RowOf<T>[]
      if (t === 'run_plans') return [...(SYSTEM_PLANS as unknown as RowOf<T>[]), ...own]
      if (t === 'run_plan_days') return [...(SYSTEM_PLAN_DAYS as unknown as RowOf<T>[]), ...own]
      return own
    },
  }
}

// ---------------------------------------------------------------------------
// แผนวิ่งระบบ (FASTBULL) มากับแอป — อ่านอย่างเดียว id คงที่: sys:<slug> / sys:<slug>:<day_no>
// ---------------------------------------------------------------------------
interface PlanJson {
  slug: string; name: string; level: 'begin' | 'performance'; goal_distance_km: number; total_days: number; source: string; note: string
  days: (Omit<RunPlanDay, 'id' | 'plan_id' | 'user_id' | 'created_at' | 'updated_at'> & { review_reason?: string })[]
}
const EPOCH = '2026-09-27T00:00:00Z'
export const sysPlanId = (slug: string) => `sys:${slug}`
export const sysDayId = (slug: string, dayNo: number) => `sys:${slug}:${dayNo}`

export const SYSTEM_PLANS: RunPlan[] = (plansFile.plans as PlanJson[]).map((p) => ({
  id: sysPlanId(p.slug), user_id: null, created_at: EPOCH, updated_at: EPOCH, slug: p.slug, name: p.name, level: p.level,
  goal_distance_km: p.goal_distance_km, total_days: p.total_days, source: p.source, note: p.note, active: true,
}))

export const SYSTEM_PLAN_DAYS: RunPlanDay[] = (plansFile.plans as PlanJson[]).flatMap((p) =>
  p.days.map(({ review_reason: _r, ...d }) => ({
    ...d, id: sysDayId(p.slug, d.day_no), plan_id: sysPlanId(p.slug), user_id: null, created_at: EPOCH, updated_at: EPOCH,
  })))

export const isSystemId = (id: string | null | undefined) => Boolean(id?.startsWith('sys:'))

// ---------------------------------------------------------------------------
// ตัวช่วยคำนวณ (เลียนแบบ SQL: ค่า null ไม่นับ)
// ---------------------------------------------------------------------------
export const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
export const nums = (vs: unknown[]) => vs.map(num).filter((v): v is number => v != null)
export const sum = (vs: unknown[]) => nums(vs).reduce((a, b) => a + b, 0)
export const avg = (vs: unknown[]) => {
  const n = nums(vs)
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null
}
export const max = (vs: unknown[]) => {
  const n = nums(vs)
  return n.length ? Math.max(...n) : null
}
export const min = (vs: unknown[]) => {
  const n = nums(vs)
  return n.length ? Math.min(...n) : null
}
export const round = (v: number | null | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d)
/** a > b แบบ SQL (null → false) */
export const gt = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && a > b

export const byDesc = <T,>(...keys: ((r: T) => string | number | null | undefined)[]) => (a: T, b: T) => {
  for (const k of keys) {
    const x = k(a) ?? '', y = k(b) ?? ''
    if (x < y) return 1
    if (x > y) return -1
  }
  return 0
}
export const byAsc = <T,>(...keys: ((r: T) => string | number | null | undefined)[]) => (a: T, b: T) => -byDesc(...keys)(a, b)

export function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const l = m.get(k)
    if (l) l.push(r)
    else m.set(k, [r])
  }
  return m
}
