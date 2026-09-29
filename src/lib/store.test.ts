import { describe, expect, it } from 'vitest'
import { store } from './store'
import { sysPlanId } from './engine/db'

// ไม่มี IndexedDB ใน node → store ทำงานในหน่วยความจำ (persist ล้มเหลวแบบเงียบ) ซึ่งพอสำหรับทดสอบ logic
describe('store (ข้อมูลในเครื่อง)', () => {
  it('ใส่ค่าเริ่มต้น, created/updated_at, user_id, คำนวณ pace', async () => {
    await store.ready
    const [run] = store.applyUpsert('runs', [{ run_type: 'easy', distance_km: 5, duration_sec: 1500 } as never])
    expect(run).toMatchObject({ completed: 'full', source: 'manual', user_id: 'owner', pace_sec_per_km: 300 })
    expect(run.id).toBeTruthy()
    expect(run.created_at).toBeTruthy()
    const [upd] = store.applyUpdate('runs', [run.id], { duration_sec: 1650 })
    expect(upd.pace_sec_per_km).toBe(330)
    expect(upd.created_at).toBe(run.created_at)
  })

  it('upsert ด้วย key ธรรมชาติ = แก้แถวเดิม (น้ำหนักวันละ 1 ค่า)', () => {
    const [a] = store.applyUpsert('body_weight', [{ date: '2026-10-01', weight_kg: 78 } as never], 'user_id,date')
    const [b] = store.applyUpsert('body_weight', [{ id: 'new-id', date: '2026-10-01', weight_kg: 77.8 } as never], 'user_id,date')
    expect(b.id).toBe(a.id)
    expect(store.rows('body_weight').filter((r) => r.date === '2026-10-01')).toHaveLength(1)
    expect(store.rows('body_weight').find((r) => r.date === '2026-10-01')!.weight_kg).toBe(77.8)
  })

  it('ลบแม่ → ลบลูก (cascade) และตั้ง null (set null) พร้อม op สำหรับ Sheet', () => {
    const [p] = store.applyUpsert('weight_programs', [{ name: 'X' } as never])
    store.applyUpsert('program_exercises', [{ program_id: p.id, exercise_id: 'e1' } as never])
    const [s] = store.applyUpsert('weight_sessions', [{ program_id: p.id } as never])
    const ops = store.applyDelete('weight_programs', [p.id])
    expect(store.rows('program_exercises').some((r) => r.program_id === p.id)).toBe(false)
    expect(store.rows('weight_sessions').find((r) => r.id === s.id)!.program_id).toBeNull()
    expect(ops.map((o) => `${o.table}:${o.op}`)).toEqual(['program_exercises:delete', 'weight_sessions:update', 'weight_programs:delete'])
  })

  it('แผนวิ่งระบบอ่านได้แต่แก้/เพิ่มทับไม่ได้', () => {
    expect(store.rows('run_plans').filter((p) => p.user_id === null)).toHaveLength(5)
    store.applyUpsert('run_plans', [{ id: sysPlanId('fastbull-5k-begin'), name: 'hack' } as never])
    expect(store.rows('run_plans').find((p) => p.id === sysPlanId('fastbull-5k-begin'))!.name).toBe('5KM Begin')
  })

  it('replaceAll แล้ว reapply รายการที่ยังไม่ได้ส่ง', async () => {
    await store.replaceAll({ body_weight: [{ id: 'r1', date: '2026-10-05', weight_kg: 77 }] })
    expect(store.rows('body_weight')).toHaveLength(1)
    store.reapply([{ table: 'body_weight', op: 'upsert', rows: [{ id: 'r2', date: '2026-10-06', weight_kg: 76.9 }] }])
    expect(store.rows('body_weight').map((r) => r.id).sort()).toEqual(['r1', 'r2'])
  })
})
