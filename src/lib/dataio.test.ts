import { describe, expect, it } from 'vitest'
import { cleanRow, EXPORT_FORMAT, planImport, toCsv, type ExportFile } from './dataio'

describe('export/import', () => {
  it('CSV: escape และมี BOM สำหรับ Excel ภาษาไทย', () => {
    const csv = toCsv([{ id: '1', user_id: 'u', name: 'กะเพรา, ไข่ดาว', note: 'พูดว่า "อร่อย"', items: [1] }, { id: '2', name: null }])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('id,name,note,items')
    expect(lines[1]).toBe('1,"กะเพรา, ไข่ดาว","พูดว่า ""อร่อย""",[1]')
    expect(lines[2]).toBe('2,,,')
  })

  it('ตรวจข้อมูลซ้ำก่อนนำเข้า: id เดิม และ key ธรรมชาติ', () => {
    const file: ExportFile = {
      format: EXPORT_FORMAT,
      exported_at: '',
      tables: {
        body_weight: [
          { id: 'a', date: '2026-10-01', weight_kg: 78 },
          { id: 'b', date: '2026-10-02', weight_kg: 77.8 }, // วันเดียวกับที่มีอยู่ (id ต่างกัน)
          { id: 'c', date: '2026-10-03', weight_kg: 77.6 },
        ],
        settings: [{ id: 's', max_hr: 186 }],
        runs: [{ id: 'r', date: '2026-10-01', pace_sec_per_km: 300 }],
      },
    }
    const plan = planImport(file, {
      body_weight: [{ id: 'a', date: '2026-10-01' }, { id: 'x', date: '2026-10-02' }],
      settings: [{ id: 'mine' }],
      runs: [],
    })
    const bw = plan.find((p) => p.table === 'body_weight')!
    expect(bw.add.map((r) => r.id)).toEqual(['c'])
    expect(bw.duplicates).toBe(2)
    expect(plan.find((p) => p.table === 'settings')!.add).toEqual([])
    expect(plan.find((p) => p.table === 'runs')!.add).toHaveLength(1)
    expect(plan.map((p) => p.table)).toEqual(['settings', 'runs', 'body_weight']) // เรียงตามลำดับ FK
  })

  it('cleanRow ลบคอลัมน์ที่ฐานข้อมูลคำนวณ', () => {
    expect(cleanRow('runs', { id: 'r', user_id: 'u', pace_sec_per_km: 300, created_at: 'x', distance_km: 5 }))
      .toEqual({ id: 'r', distance_km: 5 })
  })

  it('ไฟล์ผิดรูปแบบ', () => {
    expect(() => planImport({ format: 'other', exported_at: '', tables: {} }, {})).toThrow()
  })
})
