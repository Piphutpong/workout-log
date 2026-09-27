import { describe, expect, it } from 'vitest'
import { advanceOpen, withPartners } from './openState'

const ex = (key: string, done: boolean[], superset: string | null = null, warmup = false) =>
  ({ key, superset, warmup, sets: done.map((d, i) => ({ key: `${key}${i}`, done: d })) })

describe('กาง/หุบการ์ดท่า', () => {
  it('superset กางพร้อมท่าคู่', () => {
    const list = [ex('a', [false]), ex('b', [false], '1'), ex('c', [false], '1')]
    expect(withPartners(list, 'a')).toEqual(['a'])
    expect(withPartners(list, 'b')).toEqual(['b', 'c'])
  })
  it('ติ๊กเซ็ตสุดท้าย → หุบท่านี้ กางท่าถัดไป', () => {
    const list = [ex('a', [true, true, false]), ex('b', [false])]
    expect(advanceOpen(list, ['a'], 'a', 'a2')).toEqual(['b'])
  })
  it('ยังไม่ครบ → ไม่เปลี่ยน', () => {
    const list = [ex('a', [true, false, false]), ex('b', [false])]
    expect(advanceOpen(list, ['a'], 'a', 'a1')).toEqual(['a'])
  })
  it('superset: หุบเมื่อทั้งคู่ครบ แล้วกางคู่ถัดไป ข้ามท่าที่เสร็จแล้ว', () => {
    const list = [ex('a', [true, false], '1'), ex('b', [true, true], '1'), ex('c', [true]), ex('d', [false], '2'), ex('e', [false], '2')]
    expect(advanceOpen(list, ['a', 'b'], 'a', 'a1')).toEqual(['d', 'e'])
    expect(advanceOpen(list, ['a', 'b'], 'b', 'b1')).toEqual(['a', 'b']) // a ยังไม่ครบ
  })
  it('ท่าสุดท้าย → หุบหมด', () => {
    const list = [ex('a', [true]), ex('b', [false])]
    expect(advanceOpen(list, ['b'], 'b', 'b0')).toEqual([])
  })
})
