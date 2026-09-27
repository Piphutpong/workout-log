// Export / Import ข้อมูลทั้งหมด (JSON กู้คืนได้, CSV เปิดใน Excel) — มี unit test ใน dataio.test.ts
import type { TableName } from '@/types/database'

export const EXPORT_FORMAT = 'workout-log/export@1'

/** ลำดับตาราง (ตารางแม่ก่อนตารางลูก เพื่อให้ foreign key ผ่านตอนนำเข้า) */
export const EXPORT_TABLES: TableName[] = [
  'settings', 'goals', 'exercises', 'weight_programs', 'program_exercises', 'weight_rotation', 'weekly_schedule',
  'warmup_routines', 'run_plans', 'run_plan_days', 'plan_enrollments', 'shoes', 'runs', 'run_intervals', 'run_splits',
  'day_marks', 'weight_sessions', 'weight_sets', 'body_weight', 'body_comp', 'progress_photos', 'daily_checkin', 'pain_log',
  'foods', 'recipes', 'recipe_items', 'meal_templates', 'food_log', 'water_log', 'supplements', 'supplement_log',
  'nutrition_targets', 'weekly_reviews', 'tdee_proposals',
]

/** คอลัมน์ที่ฐานข้อมูลคำนวณเอง (ห้ามใส่ตอน insert) */
export const GENERATED: Partial<Record<TableName, string[]>> = { runs: ['pace_sec_per_km'] }

/** unique key ตามธรรมชาติ (นอกจาก id) ใช้ตรวจข้อมูลซ้ำ */
export const NATURAL_KEYS: Partial<Record<TableName, string[]>> = {
  settings: [],
  body_weight: ['date'],
  daily_checkin: ['date'],
  weekly_schedule: ['day_of_week'],
  nutrition_targets: ['day_type'],
  supplement_log: ['date', 'supplement_id'],
  weekly_reviews: ['week_start'],
  tdee_proposals: ['week_start'],
  run_plan_days: ['plan_id', 'day_no'],
  exercises: ['name'],
}

export interface ExportFile {
  format: string
  exported_at: string
  tables: Partial<Record<TableName, Record<string, unknown>[]>>
}

type Row = Record<string, unknown>

const keyOf = (r: Row, cols: string[]) => cols.map((c) => String(r[c] ?? '')).join('|')

export interface ImportPlan { table: TableName; total: number; add: Row[]; duplicates: number }

/** แยกแถวที่ยังไม่มี (เพิ่มได้) กับแถวที่ซ้ำ (มี id เดิม หรือ key ธรรมชาติซ้ำ) */
export function planImport(file: ExportFile, existing: Partial<Record<TableName, Row[]>>): ImportPlan[] {
  if (file.format !== EXPORT_FORMAT) throw new Error('ไม่ใช่ไฟล์ export ของ Workout Log')
  return EXPORT_TABLES.filter((t) => file.tables[t]?.length).map((table) => {
    const rows = file.tables[table] ?? []
    const have = existing[table] ?? []
    const ids = new Set(have.map((r) => String(r.id)))
    const nk = NATURAL_KEYS[table]
    const keys = nk && nk.length ? new Set(have.map((r) => keyOf(r, nk))) : null
    const singleton = nk && nk.length === 0 && have.length > 0 // settings: มีได้แถวเดียว
    const add = rows.filter((r) => !ids.has(String(r.id)) && !(keys && keys.has(keyOf(r, nk!))) && !singleton)
    return { table, total: rows.length, add, duplicates: rows.length - add.length }
  })
}

/** เตรียมแถวสำหรับ insert: ลบคอลัมน์ที่คำนวณเอง และ user_id (จะใส่ของผู้ใช้ปัจจุบัน) */
export function cleanRow(table: TableName, r: Row): Row {
  const out: Row = { ...r }
  delete out.user_id
  delete out.created_at
  delete out.updated_at
  for (const c of GENERATED[table] ?? []) delete out[c]
  return out
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV + BOM (ให้ Excel อ่านภาษาไทยถูก) */
export function toCsv(rows: Row[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== 'user_id')
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}
