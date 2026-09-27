import { describe, expect, it } from 'vitest'
import type { Food, NutritionTarget } from '@/types/database'
import { applyKcalDelta, computeTdee, proposeKcal, recipePerServing, scaleFood, suggestProtein, sumMacros, type TdeeInputs } from './nutritionCalc'

const food = (p: Partial<Food>): Food => ({
  id: p.name ?? 'x', user_id: 'u', created_at: '', updated_at: '', name: 'x', name_en: null, brand: null, serving_desc: '100 g',
  serving_g: 100, calories: 100, protein_g: 10, carb_g: 10, fat_g: 1, fiber_g: null, sodium_mg: null, category: null,
  source: 'seed', barcode: null, is_estimate: true, is_favorite: false, ...p,
})

describe('ปริมาณ', () => {
  it('คูณจำนวนเสิร์ฟ', () => {
    expect(scaleFood(food({ calories: 72, protein_g: 6.3, carb_g: 0.4, fat_g: 4.8 }), 1.5))
      .toEqual({ calories: 108, protein_g: 9.5, carb_g: 0.6, fat_g: 7.2, fiber_g: null, sodium_mg: null })
    expect(sumMacros([{ calories: 100, protein_g: 10 }, { calories: 50, protein_g: 2.5, fiber_g: 1 }]).calories).toBe(150)
  })
  it('สูตรอาหารต่อเสิร์ฟ', () => {
    const chicken = food({ name: 'อกไก่ดิบ', calories: 120, protein_g: 23, carb_g: 0, fat_g: 2.6 })
    const rice = food({ name: 'ข้าวดิบ', calories: 350, protein_g: 7, carb_g: 78, fat_g: 0.6 })
    const r = recipePerServing([{ food: chicken, amount_g: 500 }, { food: rice, amount_g: 300 }], 5)
    expect(r.calories).toBe(330) // (600 + 1050) / 5
    expect(r.protein_g).toBe(27.2) // (115 + 21) / 5
  })
})

describe('แนะนำโปรตีน', () => {
  const foods = [
    food({ id: 'c', name: 'อกไก่ต้ม', serving_desc: '100 g', calories: 165, protein_g: 31, is_favorite: true }),
    food({ id: 'w', name: 'Whey protein', serving_desc: '1 scoop', serving_g: 30, calories: 120, protein_g: 24 }),
    food({ id: 'e', name: 'ไข่ต้ม', serving_desc: '1 ฟอง', serving_g: 50, calories: 72, protein_g: 6.3 }),
    food({ id: 'r', name: 'ข้าวสวย', calories: 78, protein_g: 1.6 }),
  ]
  it('โปรตีนขาด 40 g → อกไก่ ~150 g หรือ Whey + ไข่ 3 ฟอง', () => {
    const s = suggestProtein(40, foods)
    expect(s[0].text).toBe('อกไก่ต้ม 150 g')
    expect(s.some((x) => x.text === 'Whey protein 1 scoop + ไข่ต้ม 3 ฟอง')).toBe(true)
    expect(s.every((x) => !x.text.includes('ข้าว'))).toBe(true)
  })
  it('ขาดน้อยกว่า 10 g ไม่ต้องแนะนำ', () => {
    expect(suggestProtein(8, foods)).toEqual([])
  })
})

describe('Adaptive TDEE', () => {
  const base: TdeeInputs = {
    end: '2026-10-18',
    w14: { days_logged: 12, avg_kcal: 2300, weight_first: 78.0, weight_last: 77.6 },
    w28: { days_logged: 12, avg_kcal: 2300, weight_first: 78.4, weight_last: 77.6 },
    current_avg_target: 2450, mode: 'cut', weight_goal_done: false,
  }
  it('ใช้ 14 วันเมื่อ 28 วันบันทึกไม่ครบ', () => {
    const r = computeTdee(base)
    expect(r.ok && r.window).toBe(14)
    // 2300 − (−0.4 × 7700 / 7) = 2740
    expect(r.ok && r.tdee).toBe(2740)
  })
  it('ใช้ 28 วันเมื่อบันทึก ≥ 20 วัน', () => {
    const r = computeTdee({ ...base, w28: { ...base.w28, days_logged: 24 } })
    expect(r.ok && r.window).toBe(28)
    // 2300 − (−0.8 × 7700 / 21) = 2593
    expect(r.ok && r.tdee).toBe(2593)
  })
  it('ข้อมูลไม่พอเมื่อบันทึก < 10 จาก 14 วัน', () => {
    const r = computeTdee({ ...base, w14: { ...base.w14, days_logged: 9 } })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('9/14')
  })
  it('เสนอปรับเป้าให้ลด 0.35 กก./สัปดาห์ และ maintenance = TDEE', () => {
    const p = proposeKcal(2740, 2450, 'cut')
    expect(p.delta).toBe(-100) // 2740 − 385 = 2355 → −95 → ปัดเป็น −100
    expect(p.lossPerWeekNew).toBeGreaterThanOrEqual(0.3)
    expect(p.lossPerWeekNew).toBeLessThanOrEqual(0.4)
    expect(proposeKcal(2740, 2450, 'maintenance').delta).toBe(300)
  })
  it('ปรับเป้าที่คาร์บ โปรตีนคงที่', () => {
    const t = [{ id: 'a', kcal: 2450, carb_g: 270, protein_g: 160 } as NutritionTarget]
    expect(applyKcalDelta(t, -100)).toEqual([{ id: 'a', kcal: 2350, carb_g: 245 }])
  })
})
