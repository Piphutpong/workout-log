// สูตรโภชนาการ (มี unit test ใน nutritionCalc.test.ts)
import type { Food, NutritionTarget } from '@/types/database'

export interface Macros { calories: number; protein_g: number; carb_g: number; fat_g: number; fiber_g: number | null; sodium_mg: number | null }

const r1 = (n: number) => Math.round(n * 10) / 10

export const ZERO: Macros = { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0, fiber_g: null, sodium_mg: null }

/** ค่าของอาหาร × จำนวนเสิร์ฟ (snapshot ตอนบันทึก) */
export function scaleFood(f: Pick<Food, 'calories' | 'protein_g' | 'carb_g' | 'fat_g' | 'fiber_g' | 'sodium_mg'>, servings: number): Macros {
  return {
    calories: Math.round(Number(f.calories) * servings),
    protein_g: r1(Number(f.protein_g) * servings),
    carb_g: r1(Number(f.carb_g) * servings),
    fat_g: r1(Number(f.fat_g) * servings),
    fiber_g: f.fiber_g == null ? null : r1(Number(f.fiber_g) * servings),
    sodium_mg: f.sodium_mg == null ? null : Math.round(Number(f.sodium_mg) * servings),
  }
}

export function sumMacros(list: Partial<Macros>[]): Macros {
  const s = { ...ZERO }
  for (const m of list) {
    s.calories += Number(m.calories ?? 0)
    s.protein_g += Number(m.protein_g ?? 0)
    s.carb_g += Number(m.carb_g ?? 0)
    s.fat_g += Number(m.fat_g ?? 0)
    if (m.fiber_g != null) s.fiber_g = (s.fiber_g ?? 0) + Number(m.fiber_g)
    if (m.sodium_mg != null) s.sodium_mg = (s.sodium_mg ?? 0) + Number(m.sodium_mg)
  }
  return {
    calories: Math.round(s.calories), protein_g: r1(s.protein_g), carb_g: r1(s.carb_g), fat_g: r1(s.fat_g),
    fiber_g: s.fiber_g == null ? null : r1(s.fiber_g), sodium_mg: s.sodium_mg == null ? null : Math.round(s.sodium_mg),
  }
}

/** สูตรอาหาร: รวมวัตถุดิบ (กรัม) แล้วหารจำนวนเสิร์ฟ — อาหารต้องมี serving_g */
export function recipePerServing(items: { food: Food; amount_g: number }[], servings: number): Macros {
  const parts = items.map(({ food, amount_g }) => {
    const g = Number(food.serving_g)
    if (!g) throw new Error(`${food.name} ไม่มีน้ำหนักต่อหน่วย (serving_g)`)
    return scaleFood(food, amount_g / g)
  })
  const total = sumMacros(parts)
  const n = Math.max(0.5, servings)
  return sumMacros([{
    calories: total.calories / n, protein_g: total.protein_g / n, carb_g: total.carb_g / n, fat_g: total.fat_g / n,
    fiber_g: total.fiber_g == null ? null : total.fiber_g / n, sodium_mg: total.sodium_mg == null ? null : total.sodium_mg / n,
  }])
}

/** "1", "1.5", "0.5" */
export const fmtServings = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// ---------------------------------------------------------------------------
// แนะนำตามส่วนที่ขาด
// ---------------------------------------------------------------------------
export interface Suggestion { text: string; calories: number; protein_g: number }

const isGramServing = (desc: string | null) => Boolean(desc && /^\d+\s*g$/i.test(desc.trim()))
const unitOf = (desc: string | null) => (desc ?? '').replace(/^[\d/.]+\s*/, '').trim() || 'ที่'

function amountText(f: Food, servings: number) {
  if (isGramServing(f.serving_desc) && f.serving_g) return `${Math.round((servings * Number(f.serving_g)) / 10) * 10} g`
  return `${fmtServings(servings)} ${unitOf(f.serving_desc)}`
}

/** เลือกอาหารโปรตีนสูงจากคลังของผู้ใช้เพื่อเติมโปรตีนที่ขาด (เรียงตามที่ชอบ/ใช้บ่อย) */
export function suggestProtein(gap: number, foods: Food[], usage: Map<string, number> = new Map()): Suggestion[] {
  if (gap < 10) return []
  const dense = foods
    .filter((f) => Number(f.protein_g) >= 5 && Number(f.calories) > 0 && (Number(f.protein_g) * 4) / Number(f.calories) >= 0.5)
    .sort((a, b) =>
      Number(b.is_favorite) - Number(a.is_favorite)
      || (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)
      || (Number(b.protein_g) * 4) / Number(b.calories) - (Number(a.protein_g) * 4) / Number(a.calories))
  const out: Suggestion[] = []
  for (const f of dense.slice(0, 2)) {
    const servings = Math.ceil((gap / Number(f.protein_g)) * 2) / 2
    if (servings > 4) continue
    out.push({ text: `${f.name} ${amountText(f, servings)}`, calories: Math.round(Number(f.calories) * servings), protein_g: r1(Number(f.protein_g) * servings) })
  }
  // Whey 1 scoop + ไข่ ถ้ามีในคลัง
  const whey = foods.find((f) => /whey/i.test(f.name))
  const egg = foods.find((f) => f.name === 'ไข่ต้ม') ?? foods.find((f) => /ไข่/.test(f.name) && Number(f.protein_g) >= 5)
  if (whey && egg && gap > Number(whey.protein_g)) {
    const eggs = Math.min(4, Math.ceil((gap - Number(whey.protein_g)) / Number(egg.protein_g)))
    out.push({
      text: `${whey.name} 1 ${unitOf(whey.serving_desc)} + ${egg.name} ${eggs} ${unitOf(egg.serving_desc)}`,
      calories: Math.round(Number(whey.calories) + Number(egg.calories) * eggs),
      protein_g: r1(Number(whey.protein_g) + Number(egg.protein_g) * eggs),
    })
  }
  return out.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Adaptive TDEE
// TDEE = kcal เฉลี่ยที่กิน − (ค่าเปลี่ยนแปลงของน้ำหนักเฉลี่ย 7 วัน × 7,700 ÷ จำนวนวัน)
// ---------------------------------------------------------------------------
export interface WindowInput { days_logged: number; avg_kcal: number | null; weight_first: number | null; weight_last: number | null }
export interface TdeeInputs { end: string; w14: WindowInput; w28: WindowInput; current_avg_target: number | null; mode: 'cut' | 'maintenance'; weight_goal_done: boolean }

export type TdeeResult =
  | { ok: true; window: 14 | 28; tdee: number; avgKcal: number; weightChange: number; daysLogged: number }
  | { ok: false; reason: string; daysLogged: number }

export function computeTdee(i: TdeeInputs): TdeeResult {
  const usable = (w: WindowInput, n: 14 | 28, minDays: number) =>
    w.days_logged >= minDays && w.avg_kcal != null && w.weight_first != null && w.weight_last != null ? n : null
  // ใช้ 28 วันถ้าบันทึกครบพอ (≥ 20 วัน) ไม่งั้นใช้ 14 วัน (ต้อง ≥ 10 วัน)
  const n = usable(i.w28, 28, 20) ?? usable(i.w14, 14, 10)
  if (!n) {
    const reason = i.w14.days_logged < 10
      ? `บันทึกอาหาร ${i.w14.days_logged}/14 วัน (ต้องอย่างน้อย 10 วัน)`
      : 'ข้อมูลน้ำหนักไม่พอ (ต้องมีน้ำหนักทั้งสัปดาห์แรกและสัปดาห์ล่าสุดของช่วง)'
    return { ok: false, reason, daysLogged: i.w14.days_logged }
  }
  const w = n === 28 ? i.w28 : i.w14
  const change = Number(w.weight_last) - Number(w.weight_first)
  const span = n - 7 // ระยะห่างระหว่างค่าเฉลี่ย 7 วันแรกกับ 7 วันสุดท้าย
  const tdee = Math.round(Number(w.avg_kcal) - (change * 7700) / span)
  return { ok: true, window: n, tdee, avgKcal: Number(w.avg_kcal), weightChange: Math.round(change * 100) / 100, daysLogged: w.days_logged }
}

export const round50 = (n: number) => Math.round(n / 50) * 50

/** เสนอปรับเป้า: cut = ลด 0.3-0.4 กก./สัปดาห์ (ใช้ 0.35), maintenance = เท่ากับ TDEE */
export function proposeKcal(tdee: number, currentAvgTarget: number, mode: 'cut' | 'maintenance') {
  const target = mode === 'cut' ? tdee - (0.35 * 7700) / 7 : tdee
  const delta = round50(target - currentAvgTarget)
  const lossAtCurrent = ((tdee - currentAvgTarget) * 7) / 7700
  const lossAtNew = ((tdee - (currentAvgTarget + delta)) * 7) / 7700
  return {
    delta,
    targetAvg: Math.round(currentAvgTarget + delta),
    lossPerWeekNow: Math.round(lossAtCurrent * 100) / 100,
    lossPerWeekNew: Math.round(lossAtNew * 100) / 100,
  }
}

/** ปรับเป้าทุกประเภทวันเท่ากัน: โปรตีนคงที่ ปรับที่คาร์บ (4 kcal/g) */
export function applyKcalDelta(targets: NutritionTarget[], delta: number) {
  return targets.map((t) => ({
    id: t.id,
    kcal: Math.round(t.kcal + delta),
    carb_g: Math.max(50, Math.round(t.carb_g + delta / 4)),
  }))
}
