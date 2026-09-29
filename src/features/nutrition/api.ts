// Data hooks ของโภชนาการ (คำนวณจากข้อมูลในเครื่อง)
import { addDays, todayIso } from '@/lib/date'
import { useLocal } from '@/lib/api'
import { store } from '@/lib/store'
import { byDesc } from '@/lib/engine/db'
import { dailyNutrition, foodUsage, tdeeInputs } from '@/lib/engine/stats'

const rows = store.rows.bind(store)

// query keys เดิม (ยังเรียก invalidate ได้ แต่ไม่จำเป็นแล้ว)
export const nk = {
  foods: ['dash', 'foods'], usage: ['dash', 'food_usage'], log: (date: string) => ['dash', 'food_log', date],
  daily: (from: string) => ['dash', 'daily_nutrition', from], targets: ['dash', 'nutrition_targets'], water: (date: string) => ['dash', 'water', date],
  supplements: ['dash', 'supplements'], suppLog: (date: string) => ['dash', 'supplement_log', date], recipes: ['dash', 'recipes'],
  templates: ['dash', 'meal_templates'], tdee: ['dash', 'tdee_inputs'], proposals: ['dash', 'tdee_proposals'],
} as const

export const useFoods = () => useLocal(() => [...rows('foods')].sort((a, b) => a.name.localeCompare(b.name, 'th')))
export const useFoodUsage = () => useLocal(() => foodUsage(store.db))
export const useFoodLog = (date: string) =>
  useLocal(() => rows('food_log').filter((f) => f.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at)), [date])
export const useDailyNutrition = (days = 28) => useLocal(() => dailyNutrition(store.db, addDays(todayIso(), -days + 1)), [days])
export const useTargets = () => useLocal(() => rows('nutrition_targets'))
export const useWater = (date: string) =>
  useLocal(() => rows('water_log').filter((w) => w.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at)), [date])
export const useSupplements = () => useLocal(() => [...rows('supplements')].sort((a, b) => a.name.localeCompare(b.name)))
export const useSupplementLog = (date: string) => useLocal(() => rows('supplement_log').filter((s) => s.date === date), [date])
export const useRecipes = () => useLocal(() => ({ recipes: [...rows('recipes')].sort((a, b) => a.name.localeCompare(b.name)), items: rows('recipe_items') }))

export interface TemplateItem { food_id?: string | null; recipe_id?: string | null; name: string; servings: number }
export const useTemplates = () => useLocal(() => [...rows('meal_templates')].sort((a, b) => a.name.localeCompare(b.name)))
export const useTdeeInputs = () => useLocal(() => tdeeInputs(store.db, addDays(todayIso(), -1)))
export const useTdeeProposals = () => useLocal(() => [...rows('tdee_proposals')].sort(byDesc((p) => p.week_start)).slice(0, 12))
