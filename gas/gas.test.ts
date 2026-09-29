// ทดสอบ gas/Code.gs กับ SpreadsheetApp จำลอง (Sheets ตัด ' นำหน้าข้อความออกเวลาอ่านกลับ)
import { beforeEach, describe, expect, it } from 'vitest'

import { loadGas } from './emulator'

const load = () => loadGas('secret')

describe('Apps Script backend', () => {
  let g: ReturnType<typeof load>
  beforeEach(() => { g = load() })

  it('ต้องมี API_KEY ถูกต้อง', () => {
    const r = JSON.parse(g.raw.doPost({ postData: { contents: JSON.stringify({ key: 'wrong', action: 'ping' }) } }).text)
    expect(r.error).toBe('unauthorized')
    expect(g.call({ action: 'ping' }).email).toBe('me@example.com')
  })

  it('setup สร้างทุกแท็บพร้อมหัวคอลัมน์', () => {
    expect(g.call({ action: 'setup' }).ok).toBe(true)
    expect(g.sheets.size).toBe(36)
    expect(g.sheets.get('body_weight')!.data[0]).toEqual(['id', 'user_id', 'created_at', 'updated_at', 'date', 'weight_kg', 'note'])
  })

  it('upsert/pull แปลงชนิดข้อมูลกลับถูก (วันที่ไม่กลายเป็น Date, JSON, boolean, null)', () => {
    g.call({ action: 'push', ops: [
      { table: 'body_weight', op: 'upsert', rows: [{ id: 'a', user_id: 'owner', date: '2026-10-01', weight_kg: 78.2, note: null }] },
      { table: 'weekly_schedule', op: 'upsert', rows: [{ id: 's', day_of_week: 2, activity: 'run', segments: [{ repeat: 6, work_sec: 60 }] }] },
      { table: 'exercises', op: 'upsert', rows: [{ id: 'e', name: '0123', active: true, grip_intensive: false }] },
    ] })
    const t = g.call({ action: 'pull' }).tables
    expect(t.body_weight).toEqual([{ id: 'a', user_id: 'owner', created_at: null, updated_at: null, date: '2026-10-01', weight_kg: 78.2, note: null }])
    expect(t.weekly_schedule[0].segments).toEqual([{ repeat: 6, work_sec: 60 }])
    expect(t.exercises[0]).toMatchObject({ name: '0123', active: true, grip_intensive: false })
  })

  it('upsert ด้วย id เดิม = แก้, ด้วย key ธรรมชาติ (วันที่เดียวกัน) = แก้แถวเดิม', () => {
    g.call({ action: 'push', ops: [{ table: 'body_weight', op: 'upsert', rows: [{ id: 'a', date: '2026-10-01', weight_kg: 78 }] }] })
    g.call({ action: 'push', ops: [{ table: 'body_weight', op: 'upsert', rows: [{ id: 'a', weight_kg: 77.9 }] }] })
    g.call({ action: 'push', ops: [{ table: 'body_weight', op: 'upsert', rows: [{ id: 'other', date: '2026-10-01', weight_kg: 77.8 }] }] })
    const rows = g.call({ action: 'pull', tables: ['body_weight'] }).tables.body_weight
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'a', date: '2026-10-01', weight_kg: 77.8 })
  })

  it('update / delete', () => {
    g.call({ action: 'push', ops: [{ table: 'runs', op: 'upsert', rows: [
      { id: 'r1', date: '2026-10-01', run_type: 'easy', distance_km: 5 },
      { id: 'r2', date: '2026-10-02', run_type: 'long', distance_km: 10 },
      { id: 'r3', date: '2026-10-03', run_type: 'easy', distance_km: 6 },
    ] }] })
    g.call({ action: 'push', ops: [
      { table: 'runs', op: 'update', ids: ['r2'], patch: { distance_km: 12, note: 'แก้' } },
      { table: 'runs', op: 'delete', ids: ['r1', 'r3'] },
    ] })
    const rows = g.call({ action: 'pull', tables: ['runs'] }).tables.runs
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'r2', distance_km: 12, note: 'แก้', run_type: 'long' })
  })

  it('ส่งอีเมลถึงเจ้าของเท่านั้น', () => {
    const r = g.call({ action: 'send_email', subject: 'ทดสอบ', html: '<p>x</p>', text: 'x', to: 'someone@else.com' })
    expect(r.to).toBe('me@example.com')
    expect(g.mails).toHaveLength(1)
  })
})
