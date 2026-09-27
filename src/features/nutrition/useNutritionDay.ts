// ข้อมูลของวัน + ฟังก์ชันบันทึกอาหาร/น้ำ ใช้ร่วมกันระหว่างหน้าโภชนาการและหน้าวันนี้
import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateDash, useTodayPlan } from '@/lib/api'
import { nowTime } from '@/lib/date'
import { deleteRows, upsertRows } from '@/lib/offline/queue'
import type { DayType, Food, FoodLog, Meal } from '@/types/database'
import { nk, useFoodLog, useTargets, useWater } from './api'
import { scaleFood, sumMacros, type Macros } from './nutritionCalc'
import type { DayTarget } from './MacroSummary'

export const MEALS: Meal[] = ['เช้า', 'กลางวัน', 'เย็น', 'ว่าง', 'ก่อนออกกำลัง', 'หลังออกกำลัง']

export function defaultMeal(time = nowTime()): Meal {
  const [h, m] = time.split(':').map(Number)
  const t = h * 60 + m
  if (t < 10 * 60 + 30) return 'เช้า'
  if (t < 15 * 60) return 'กลางวัน'
  if (t < 17 * 60) return 'ว่าง'
  return 'เย็น'
}

export type LogInput =
  | { kind: 'food'; food: Food; servings: number }
  | { kind: 'recipe'; recipeId: string; name: string; perServing: Macros; servings: number }
  | { kind: 'quick'; name: string; macros: Macros }
  | { kind: 'copy'; row: FoodLog }

export function toLogRow(date: string, meal: Meal, input: LogInput) {
  const base = { date, meal, time: nowTime() }
  switch (input.kind) {
    case 'food':
      return { ...base, food_id: input.food.id, name: input.food.name, servings: input.servings, ...scaleFood(input.food, input.servings) }
    case 'recipe':
      return {
        ...base, recipe_id: input.recipeId, name: input.name, servings: input.servings,
        ...scaleFood({ ...input.perServing }, input.servings),
      }
    case 'quick':
      return { ...base, name: input.name || 'Quick add', servings: 1, ...input.macros }
    case 'copy': {
      const r = input.row
      return {
        ...base, food_id: r.food_id, recipe_id: r.recipe_id, name: r.name, servings: r.servings, calories: r.calories,
        protein_g: r.protein_g, carb_g: r.carb_g, fat_g: r.fat_g, fiber_g: r.fiber_g, sodium_mg: r.sodium_mg,
      }
    }
  }
}

export function useNutritionDay(date: string) {
  const qc = useQueryClient()
  const log = useFoodLog(date)
  const water = useWater(date)
  const targets = useTargets()
  const plan = useTodayPlan(date)

  const dayType: DayType = plan.data?.day_type ?? 'rest'
  const target: DayTarget | null = useMemo(() => {
    const t = targets.data?.find((x) => x.day_type === dayType)
    return t ? { kcal: t.kcal, protein_g: t.protein_g, carb_g: t.carb_g, fat_g: t.fat_g } : null
  }, [targets.data, dayType])
  const eaten = useMemo(() => sumMacros(log.data ?? []), [log.data])
  const waterMl = (water.data ?? []).reduce((a, w) => a + w.ml, 0)

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: nk.log(date) }),
    invalidateDash(qc),
  ])

  /** เพิ่มรายการ (optimistic: ใส่ใน cache ทันที แม้ออฟไลน์) */
  const add = async (meal: Meal, inputs: LogInput[]) => {
    const rows = inputs.map((i) => toLogRow(date, meal, i))
    const res = await upsertRows('food_log', rows)
    qc.setQueryData<FoodLog[]>(nk.log(date), (old = []) => [
      ...old,
      ...rows.map((r, i) => ({ ...r, id: res.ids[i] } as unknown as FoodLog)),
    ])
    if (!res.queued) void refresh()
    return res
  }

  const update = async (row: FoodLog, patch: Partial<FoodLog>) => {
    const next = { ...row, ...patch }
    await upsertRows('food_log', [{
      id: row.id, date: next.date, meal: next.meal, food_id: next.food_id, recipe_id: next.recipe_id, name: next.name,
      servings: next.servings, calories: next.calories, protein_g: next.protein_g, carb_g: next.carb_g, fat_g: next.fat_g,
      fiber_g: next.fiber_g, sodium_mg: next.sodium_mg, time: next.time, note: next.note,
    }])
    qc.setQueryData<FoodLog[]>(nk.log(date), (old = []) => old.map((r) => (r.id === row.id ? next : r)))
    void refresh()
  }

  const remove = async (row: FoodLog) => {
    qc.setQueryData<FoodLog[]>(nk.log(date), (old = []) => old.filter((r) => r.id !== row.id))
    await deleteRows('food_log', [row.id])
    void refresh()
  }

  const addWater = async (ml: number) => {
    const res = await upsertRows('water_log', [{ date, ml }])
    qc.setQueryData(nk.water(date), (old: { id: string; ml: number }[] = []) => [...old, { id: res.ids[0], ml, date }])
    void qc.invalidateQueries({ queryKey: nk.water(date) })
  }

  const undoWater = async () => {
    const last = water.data?.[water.data.length - 1]
    if (!last) return
    qc.setQueryData(nk.water(date), (old: { id: string }[] = []) => old.filter((w) => w.id !== last.id))
    await deleteRows('water_log', [last.id])
    void qc.invalidateQueries({ queryKey: nk.water(date) })
  }

  return { log, water, targets, plan, dayType, target, eaten, waterMl, add, update, remove, addWater, undoWater }
}
