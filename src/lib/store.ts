// ที่เก็บข้อมูลในเครื่อง (IndexedDB) — แอปอ่าน/คำนวณจากที่นี่ทั้งหมด แล้วซิงก์กับ Google Sheet ผ่าน Apps Script
import { CASCADE, OWNER, SCHEMA, SET_NULL, TABLES, UNIQUE, type SheetTable } from './schema'
import { SYSTEM_PLANS, SYSTEM_PLAN_DAYS, isSystemId, type Db } from './engine/db'
import { todayIso } from './date'
import { offlineDb } from './offline/db'
import type { RowOf, TableName } from '@/types/database'

export type Row = Record<string, unknown> & { id: string }

/** ค่าเริ่มต้นของคอลัมน์ (แทน DEFAULT ของ Postgres) — 'today' = วันนี้ตามเวลาไทย */
const DEFAULTS: Partial<Record<SheetTable, Record<string, unknown>>> = {
  settings: { max_hr: 186, target_weight_kg: 76, default_rest_sec: 90, weight_step_lb: 2.5, pinned_pain_parts: ['ศอกซ้าย'], notify_email: false,
    notify_morning_time: '06:30', notify_evening_time: '20:30', notify_weekly: true, notify_push: false, nutrition_mode: 'cut', weather_lat: 13.7563, weather_lon: 100.5018 },
  goals: { start_date: 'today', status: 'active', sort_order: 0 },
  exercises: { measure_type: 'reps', grip_intensive: false, active: true },
  weight_programs: { color: '#3b82f6', is_warmup: false, sort_order: 0, active: true },
  program_exercises: { sort_order: 0, target_sets: 3 },
  weight_sessions: { date: 'today', is_deload: false },
  weekly_schedule: { segments: [] },
  warmup_routines: { items: [] },
  run_plans: { active: true },
  run_plan_days: { add_strides: false, add_weights: false, segments: [] },
  plan_enrollments: { status: 'active', day_offset: 0 },
  shoes: { start_date: 'today', start_km: 0, retire_km: 700, active: true },
  runs: { date: 'today', completed: 'full', source: 'manual' },
  body_weight: { date: 'today' }, body_comp: { date: 'today' }, progress_photos: { date: 'today' }, daily_checkin: { date: 'today' },
  pain_log: { date: 'today', pinned: false },
  foods: { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0, source: 'manual', is_estimate: false, is_favorite: false },
  recipes: { servings: 1 }, meal_templates: { items: [] },
  food_log: { date: 'today', servings: 1, calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 },
  water_log: { date: 'today' }, supplements: { active: true }, supplement_log: { date: 'today', taken: true },
  weekly_reviews: { good: [], improve: [] }, tdee_proposals: { status: 'pending' }, notification_log: { channels: [] },
}

export interface RemoteOp { table: SheetTable; op: 'upsert' | 'update' | 'delete'; rows?: Row[]; ids?: string[]; patch?: Record<string, unknown> }

type Listener = () => void

class Store {
  private tables = new Map<SheetTable, Map<string, Row>>()
  private listeners = new Set<Listener>()
  private cache = new Map<SheetTable, Row[]>()
  version = 0
  loaded = false
  ready: Promise<void>

  constructor() {
    for (const t of TABLES) this.tables.set(t, new Map())
    this.ready = this.hydrate()
  }

  private async hydrate() {
    try {
      const all = await offlineDb.records.toArray()
      for (const r of all) this.tables.get(r.t as SheetTable)?.set(r.id, r.row as Row)
    } catch {
      /* IndexedDB ใช้ไม่ได้ (เช่น private mode) → เริ่มว่าง */
    }
    this.loaded = true
    this.changed()
  }

  get hasData() {
    return (this.tables.get('settings')?.size ?? 0) > 0
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private changed(touched?: SheetTable[]) {
    this.version++
    if (touched) touched.forEach((t) => this.cache.delete(t))
    else this.cache.clear()
    this.listeners.forEach((l) => l())
  }

  private persist(t: SheetTable, put: Row[], del: string[] = []) {
    void offlineDb.transaction('rw', offlineDb.records, async () => {
      if (put.length) await offlineDb.records.bulkPut(put.map((row) => ({ t, id: row.id, row })))
      if (del.length) await offlineDb.records.bulkDelete(del.map((id) => [t, id] as [string, string]))
    }).catch(() => undefined)
  }

  /** แถวของตาราง (รวมแผนวิ่งระบบ) */
  rows<T extends TableName>(t: T): RowOf<T>[] {
    const key = t as SheetTable
    let list = this.cache.get(key)
    if (!list) {
      list = [...(this.tables.get(key)?.values() ?? [])]
      this.cache.set(key, list)
    }
    if (t === 'run_plans') return [...(SYSTEM_PLANS as unknown as RowOf<T>[]), ...(list as unknown as RowOf<T>[])]
    if (t === 'run_plan_days') return [...(SYSTEM_PLAN_DAYS as unknown as RowOf<T>[]), ...(list as unknown as RowOf<T>[])]
    return list as unknown as RowOf<T>[]
  }

  readonly db: Db = { rows: (t) => this.rows(t) }

  private normalize(t: SheetTable, row: Row, existing?: Row): Row {
    const now = new Date().toISOString()
    const cols = SCHEMA[t] as Record<string, string>
    const out: Row = existing ? { ...existing } : { id: row.id }
    if (!existing) {
      for (const [k, v] of Object.entries(DEFAULTS[t] ?? {})) out[k] = v === 'today' ? todayIso() : v
      out.created_at = now
    }
    for (const [k, v] of Object.entries(row)) if (k in cols && v !== undefined) out[k] = v
    out.user_id = OWNER
    out.updated_at = now
    if (!existing && row.created_at) out.created_at = row.created_at
    if (t === 'runs') {
      const d = Number(out.distance_km), s = Number(out.duration_sec)
      out.pace_sec_per_km = d > 0 && s > 0 ? Math.round((s / d) * 10) / 10 : null
    }
    return out
  }

  /** เพิ่ม/แก้ในเครื่อง คืนแถวสุดท้ายที่มี id จริง (ใช้ส่งต่อไปที่ Sheet) */
  applyUpsert(t: SheetTable, rows: (Partial<Row> & { id?: string })[], onConflict?: string): Row[] {
    if (t === 'run_plans' || t === 'run_plan_days') rows = rows.filter((r) => !isSystemId(r.id))
    const map = this.tables.get(t)!
    const uniq = onConflict ? onConflict.split(',').filter((c) => c !== 'user_id') : (UNIQUE[t] ?? []).filter((c) => c !== 'user_id')
    const out: Row[] = []
    for (const r of rows) {
      let existing = r.id ? map.get(r.id) : undefined
      if (!existing && uniq.length) {
        const k = uniq.map((c) => String(r[c] ?? '')).join('|')
        existing = [...map.values()].find((x) => uniq.map((c) => String(x[c] ?? '')).join('|') === k)
      }
      if (!existing && t === 'settings') existing = [...map.values()][0]
      const id = existing?.id ?? r.id ?? crypto.randomUUID()
      const row = this.normalize(t, { ...r, id } as Row, existing)
      row.id = id
      map.set(id, row)
      out.push(row)
    }
    this.persist(t, out)
    this.changed([t])
    return out
  }

  applyUpdate(t: SheetTable, ids: string[], patch: Record<string, unknown>): Row[] {
    const map = this.tables.get(t)!
    const out: Row[] = []
    for (const id of ids) {
      const ex = map.get(id)
      if (!ex) continue
      const row = this.normalize(t, { ...patch, id } as Row, ex)
      map.set(id, row)
      out.push(row)
    }
    this.persist(t, out)
    this.changed([t])
    return out
  }

  /** ลบ (รวมลูกตาม CASCADE และตั้ง null ตาม SET_NULL) คืน op ทั้งหมดที่ต้องส่งไป Sheet */
  applyDelete(t: SheetTable, ids: string[]): RemoteOp[] {
    const ops: RemoteOp[] = []
    const touched = new Set<SheetTable>()
    const del = (table: SheetTable, list: string[]) => {
      const map = this.tables.get(table)!
      const real = list.filter((id) => map.has(id))
      if (!real.length) return
      for (const c of CASCADE[table] ?? []) {
        del(c.table, [...this.tables.get(c.table)!.values()].filter((r) => real.includes(r[c.col] as string)).map((r) => r.id))
      }
      for (const s of SET_NULL[table] ?? []) {
        const hit = [...this.tables.get(s.table)!.values()].filter((r) => real.includes(r[s.col] as string)).map((r) => r.id)
        if (hit.length) {
          const patch = { [s.col]: null }
          this.applyUpdate(s.table, hit, patch)
          ops.push({ table: s.table, op: 'update', ids: hit, patch })
        }
      }
      real.forEach((id) => map.delete(id))
      this.persist(table, [], real)
      touched.add(table)
      ops.push({ table, op: 'delete', ids: real })
    }
    del(t, ids)
    this.changed([...touched])
    return ops
  }

  /** แทนที่ข้อมูลทั้งหมดด้วยข้อมูลจาก Sheet */
  async replaceAll(tables: Partial<Record<string, Row[]>>) {
    for (const t of TABLES) {
      const map = new Map<string, Row>()
      for (const r of tables[t] ?? []) if (r && r.id) map.set(r.id, r)
      this.tables.set(t, map)
    }
    await offlineDb.transaction('rw', offlineDb.records, async () => {
      await offlineDb.records.clear()
      for (const t of TABLES) {
        const rows = [...this.tables.get(t)!.values()]
        if (rows.length) await offlineDb.records.bulkPut(rows.map((row) => ({ t, id: row.id, row })))
      }
    }).catch(() => undefined)
    this.changed()
  }

  /** ใช้ op ที่ยังค้างในคิวซ้ำหลังดึงข้อมูลใหม่ (ให้การแก้ที่ยังไม่ได้ส่งยังเห็นอยู่) */
  reapply(ops: RemoteOp[]) {
    for (const op of ops) {
      if (op.op === 'upsert') this.applyUpsert(op.table, op.rows ?? [])
      else if (op.op === 'update') this.applyUpdate(op.table, op.ids ?? [], op.patch ?? {})
      else this.applyDelete(op.table, op.ids ?? [])
    }
  }

  async clear() {
    for (const t of TABLES) this.tables.set(t, new Map())
    await offlineDb.records.clear().catch(() => undefined)
    this.changed()
  }

  snapshot(): Record<SheetTable, Row[]> {
    return Object.fromEntries(TABLES.map((t) => [t, [...this.tables.get(t)!.values()]])) as Record<SheetTable, Row[]>
  }
}

export const store = new Store()
