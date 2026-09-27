// Query hooks ของโภชนาการ (ขึ้นต้นด้วย 'dash' เพื่อให้ invalidateDash รีเฟรชพร้อม Dashboard)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { addDays, todayIso } from '@/lib/date'
import type {
  DailyNutrition, Food, FoodLog, FoodUsage, MealTemplate, NutritionTarget, Recipe, RecipeItem, Supplement, SupplementLog,
  TdeeProposal, WaterLog,
} from '@/types/database'
import type { TdeeInputs } from './nutritionCalc'

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export const nk = {
  foods: ['dash', 'foods'] as const,
  usage: ['dash', 'food_usage'] as const,
  log: (date: string) => ['dash', 'food_log', date] as const,
  logRange: (from: string, to: string) => ['dash', 'food_log_range', from, to] as const,
  daily: (from: string) => ['dash', 'daily_nutrition', from] as const,
  targets: ['dash', 'nutrition_targets'] as const,
  water: (date: string) => ['dash', 'water', date] as const,
  supplements: ['dash', 'supplements'] as const,
  suppLog: (date: string) => ['dash', 'supplement_log', date] as const,
  recipes: ['dash', 'recipes'] as const,
  templates: ['dash', 'meal_templates'] as const,
  tdee: ['dash', 'tdee_inputs'] as const,
  proposals: ['dash', 'tdee_proposals'] as const,
}

export function useFoods() {
  return useQuery({
    queryKey: nk.foods,
    queryFn: async () => must(await supabase.from('foods').select('*').order('name')) as Food[],
    staleTime: 5 * 60_000,
  })
}

export function useFoodUsage() {
  return useQuery({
    queryKey: nk.usage,
    queryFn: async () => must(await supabase.from('food_usage').select('*')) as FoodUsage[],
  })
}

export function useFoodLog(date: string) {
  return useQuery({
    queryKey: nk.log(date),
    queryFn: async () => must(await supabase.from('food_log').select('*').eq('date', date).order('created_at')) as FoodLog[],
  })
}

export function useDailyNutrition(days = 28) {
  const from = addDays(todayIso(), -days + 1)
  return useQuery({
    queryKey: nk.daily(from),
    queryFn: async () => must(await supabase.from('daily_nutrition').select('*').gte('date', from).order('date')) as DailyNutrition[],
  })
}

export function useTargets() {
  return useQuery({
    queryKey: nk.targets,
    queryFn: async () => must(await supabase.from('nutrition_targets').select('*')) as NutritionTarget[],
  })
}

export function useWater(date: string) {
  return useQuery({
    queryKey: nk.water(date),
    queryFn: async () => must(await supabase.from('water_log').select('*').eq('date', date).order('created_at')) as WaterLog[],
  })
}

export function useSupplements() {
  return useQuery({
    queryKey: nk.supplements,
    queryFn: async () => must(await supabase.from('supplements').select('*').order('name')) as Supplement[],
  })
}

export function useSupplementLog(date: string) {
  return useQuery({
    queryKey: nk.suppLog(date),
    queryFn: async () => must(await supabase.from('supplement_log').select('*').eq('date', date)) as SupplementLog[],
  })
}

export function useRecipes() {
  return useQuery({
    queryKey: nk.recipes,
    queryFn: async () => {
      const [r, i] = await Promise.all([
        supabase.from('recipes').select('*').order('name'),
        supabase.from('recipe_items').select('*'),
      ])
      return { recipes: must(r) as Recipe[], items: must(i) as RecipeItem[] }
    },
  })
}

export interface TemplateItem { food_id?: string | null; recipe_id?: string | null; name: string; servings: number }
export function useTemplates() {
  return useQuery({
    queryKey: nk.templates,
    queryFn: async () => must(await supabase.from('meal_templates').select('*').order('name')) as MealTemplate[],
  })
}

export function useTdeeInputs() {
  return useQuery({
    queryKey: nk.tdee,
    queryFn: async () => must(await supabase.rpc('tdee_inputs', { p_end: addDays(todayIso(), -1) })) as TdeeInputs,
  })
}

export function useTdeeProposals() {
  return useQuery({
    queryKey: nk.proposals,
    queryFn: async () =>
      must(await supabase.from('tdee_proposals').select('*').order('week_start', { ascending: false }).limit(12)) as TdeeProposal[],
  })
}
