// Types ของข้อมูลแต่ละตาราง (คอลัมน์ต้องตรงกับ src/lib/schema.ts — ตรวจโดย src/types/schema-check.ts)

type Base = { id: string; user_id: string; created_at: string; updated_at: string }
type Nullable<T> = { [K in keyof T]: T[K] | null }
/** Insert: คีย์ใน Req บังคับ ที่เหลือไม่บังคับ */
type Ins<R, Req extends keyof R> = Pick<R, Req> & Partial<Omit<R, Req>>
type Table<R, Req extends keyof R> = { Row: R; Insert: Ins<R, Req>; Update: Partial<R>; Relationships: [] }
type View<R> = { Row: R; Relationships: [] }

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Activity = 'weight' | 'run' | 'rest' | 'active_recovery'
export type DayType = 'weight' | 'run_easy' | 'run_hard' | 'rest'
export type WorkoutType =
  | 'rest' | 'active_recovery' | 'walk_run' | 'easy' | 'long' | 'interval' | 'tempo'
  | 'threshold' | 'vo2max' | 'strides' | 'race_test' | 'weights'
export type RunType =
  | 'easy' | 'long' | 'interval' | 'tempo' | 'threshold' | 'vo2max' | 'walk_run' | 'strides' | 'race_test' | 'recovery'
export type MeasureType = 'reps' | 'seconds' | 'band'
export type BandLevel = 'เบา' | 'กลาง' | 'หนัก'
export type GoalDirection = 'down' | 'up' | 'keep_above' | 'keep_below'

/** segment ของแผนวิ่ง (ค่า *_max = ช่วงบน เช่น 8-12 กม.) */
export interface Segment {
  repeat: number
  repeat_max?: number
  work_sec?: number
  work_sec_max?: number
  work_m?: number
  work_m_max?: number
  work_km?: number
  work_km_max?: number
  work_type?: 'run' | 'walk' | 'fast_walk'
  hr_min_pct?: number
  hr_max_pct?: number
  zone?: string
  recover_sec?: number
  recover_sec_max?: number
  recover_m?: number
  recover_type?: 'walk' | 'jog' | 'rest' | 'fast_walk'
  rest_after_sec?: number
  label?: string
}

export type Settings = Base & Nullable<{
  display_name: string
  sex: 'male' | 'female'
  height_cm: number
  birth_date: string
  target_weight_kg: number
  program_start_date: string
  notify_morning_time: string
  notify_evening_time: string
  onboarded_at: string
}> & {
  max_hr: number
  default_rest_sec: number
  weight_step_lb: number
  pinned_pain_parts: string[]
  notify_email: boolean
  notify_weekly: boolean
  notify_push: boolean
  nutrition_mode: 'cut' | 'maintenance'
  deload_week_start: string | null
  weather_lat: number | null
  weather_lon: number | null
}

export type Goal = Base & {
  goal_type: 'body' | 'strength' | 'run' | 'consistency' | 'plan'
  title: string
  metric: string
  start_value: number | null
  start_date: string
  target_value: number
  target_date: string | null
  direction: GoalDirection
  status: 'active' | 'done' | 'archived'
  achieved_at: string | null
  sort_order: number
}

export type Exercise = Base & {
  name: string
  measure_type: MeasureType
  muscle_group: string | null
  grip_intensive: boolean
  note: string | null
  active: boolean
}

export type WeightProgram = Base & {
  name: string
  description: string | null
  color: string
  is_warmup: boolean
  sort_order: number
  active: boolean
}

export type ProgramExercise = Base & {
  program_id: string
  exercise_id: string
  sort_order: number
  target_sets: number
  target_reps: number | null
  target_seconds: number | null
  target_weight_lb: number | null
  rest_sec: number | null
  note: string | null
  /** ท่าที่มีค่าเดียวกันในโปรแกรมเดียวกัน = superset */
  superset_group: string | null
  /** ช่วงบนของจำนวนครั้ง เช่น 15-20 */
  target_reps_max: number | null
}

export type WeightSession = Base & {
  date: string
  program_id: string | null
  duration_min: number | null
  is_deload: boolean
  note: string | null
}

export type WeightSet = Base & {
  session_id: string
  exercise_id: string
  date: string
  set_no: number
  weight_lb: number | null
  reps: number | null
  seconds: number | null
  band_level: BandLevel | null
  rpe: number | null
}

export type WeeklySchedule = Base & {
  day_of_week: number
  activity: Activity
  run_type: 'easy' | 'interval' | 'long' | 'tempo' | 'threshold' | 'vo2max' | null
  title: string | null
  segments: Segment[]
}

export type WeightRotation = Base & { sort_order: number; program_id: string }

export interface WarmupItem { name: string; sec?: number; reps?: number; program_id?: string }
export type WarmupRoutine = Base & {
  name: string
  activity_type: 'weight' | 'run_easy' | 'run_hard'
  items: WarmupItem[]
}

export type RunPlan = Omit<Base, 'user_id'> & {
  user_id: string | null
  slug: string | null
  name: string
  level: 'begin' | 'performance'
  goal_distance_km: number | null
  total_days: number
  source: string | null
  note: string | null
  active: boolean
}

export type RunPlanDay = Omit<Base, 'user_id'> & {
  user_id: string | null
  plan_id: string
  day_no: number
  week_no: number
  workout_type: WorkoutType
  title: string
  description: string | null
  repeat_of_week: number | null
  add_strides: boolean
  add_weights: boolean
  segments: Segment[]
  note: string | null
}

export type PlanEnrollment = Base & {
  plan_id: string
  start_date: string
  status: 'active' | 'paused' | 'done'
  day_offset: number
}

export type DayMark = Base & {
  date: string
  status: 'skipped' | 'postponed'
  activity: Activity | null
  plan_day_id: string | null
  note: string | null
}

export type Shoe = Base & {
  name: string
  start_date: string
  start_km: number
  retire_km: number
  active: boolean
}

export type Run = Base & {
  date: string
  time_of_day: string | null
  plan_day_id: string | null
  run_type: RunType
  distance_km: number | null
  duration_sec: number | null
  pace_sec_per_km: number | null
  avg_hr: number | null
  max_hr: number | null
  rpe: number | null
  feeling: number | null
  completed: 'full' | 'partial' | 'skipped'
  shoe_id: string | null
  temp_c: number | null
  humidity_pct: number | null
  source: 'manual' | 'gpx' | 'fit' | 'tcx' | 'strava'
  external_id: string | null
  note: string | null
}

export type RunInterval = Base & {
  run_id: string
  rep_no: number
  distance_m: number | null
  duration_sec: number | null
  avg_hr: number | null
}

export type RunSplit = Base & {
  run_id: string
  km_no: number
  duration_sec: number | null
  avg_hr: number | null
  elevation_gain_m: number | null
}

export type BodyWeight = Base & { date: string; weight_kg: number; note: string | null }

export type BodyComp = Base & Nullable<{
  weight_kg: number
  smm_kg: number
  body_fat_kg: number
  pbf_pct: number
  visceral_fat: number
  waist_cm: number
  note: string
}> & { date: string }

export type ProgressPhoto = Base & {
  date: string
  angle: 'front' | 'side' | 'back'
  storage_path: string
  weight_kg: number | null
  note: string | null
}

export type DailyCheckin = Base & Nullable<{
  sleep_hours: number
  energy: number
  soreness: number
  resting_hr: number
  steps: number
  note: string
}> & { date: string }

export type PainLog = Base & {
  date: string
  body_part: string
  side: 'left' | 'right' | 'both' | null
  score: number
  context: 'ระหว่างเวท' | 'ระหว่างวิ่ง' | 'ตื่นนอน' | 'ทั้งวัน' | null
  linked_session_id: string | null
  linked_run_id: string | null
  pinned: boolean
  note: string | null
}

export type Food = Base & Nullable<{
  name_en: string
  brand: string
  serving_desc: string
  serving_g: number
  fiber_g: number
  sodium_mg: number
  category: string
  barcode: string
}> & {
  name: string
  calories: number
  protein_g: number
  carb_g: number
  fat_g: number
  source: 'seed' | 'manual' | 'barcode'
  is_estimate: boolean
  is_favorite: boolean
}

export type Recipe = Base & { name: string; servings: number; note: string | null }
export type RecipeItem = Base & { recipe_id: string; food_id: string; amount_g: number }
export type MealTemplate = Base & { name: string; items: Json }
export type Meal = 'เช้า' | 'กลางวัน' | 'เย็น' | 'ว่าง' | 'ก่อนออกกำลัง' | 'หลังออกกำลัง'
export type FoodLog = Base & Nullable<{
  food_id: string
  recipe_id: string
  name: string
  fiber_g: number
  sodium_mg: number
  time: string
  note: string
}> & {
  date: string
  meal: Meal
  servings: number
  calories: number
  protein_g: number
  carb_g: number
  fat_g: number
}
export type WaterLog = Base & { date: string; ml: number }
export type Supplement = Base & { name: string; dose: string | null; timing: string | null; active: boolean }
export type SupplementLog = Base & { date: string; supplement_id: string; taken: boolean }
export type NutritionTarget = Base & {
  day_type: DayType
  kcal: number
  protein_g: number
  carb_g: number
  fat_g: number
}

export type TdeeProposal = Base & {
  week_start: string
  mode: 'cut' | 'maintenance'
  tdee: number | null
  avg_kcal: number | null
  weight_change_kg: number | null
  window_days: number | null
  days_logged: number | null
  current_avg_target: number | null
  proposed_delta: number | null
  status: 'pending' | 'accepted' | 'dismissed' | 'insufficient'
}
export type ShoeUsage = { user_id: string; shoe_id: string; km: number; runs: number; last_used: string | null }
export type PushSubscriptionRow = Base & { endpoint: string; p256dh: string; auth: string; user_agent: string | null }
export type NotificationLog = Base & { date: string; kind: 'morning' | 'evening' | 'weekly' | 'test'; channels: string[]; title: string | null; body: string | null }
export type FoodUsage = { user_id: string; food_id: string | null; recipe_id: string | null; uses: number; last_used: string; last_at: string }

export type WeeklyReview = Base & {
  week_start: string
  good: string[]
  improve: string[]
  stats: WeeklyReviewStats | null
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
export type LastPerformance = {
  user_id: string
  exercise_id: string
  session_id: string
  date: string
  sets: { set_no: number; weight_lb: number | null; reps: number | null; seconds: number | null; band_level: BandLevel | null; rpe: number | null }[]
}
export type ExerciseProgress = {
  user_id: string
  exercise_id: string
  session_id: string
  date: string
  max_weight_lb: number | null
  e1rm_lb: number | null
  volume_lb: number
  total_reps: number
  max_seconds: number | null
  set_count: number
}
export type LastRunByType = {
  user_id: string
  run_type: RunType
  run_id: string
  date: string
  distance_km: number
  duration_sec: number | null
  pace_sec_per_km: number | null
  avg_hr: number | null
  max_hr: number | null
  temp_c: number | null
  humidity_pct: number | null
}
export type GoalProgressRow = {
  goal_id: string
  goal_type: Goal['goal_type']
  title: string
  metric: string
  direction: GoalDirection
  start_value: number | null
  start_date: string
  target_value: number
  target_date: string | null
  status: Goal['status']
  current_value: number | null
  progress_pct: number | null
  expected_value: number | null
  slope_per_day: number | null
  forecast_date: string | null
  days_left: number | null
  remaining: number | null
  state: 'no_data' | 'done' | 'on_track' | 'behind'
}
export type DailyNutrition = {
  user_id: string
  date: string
  kcal: number
  protein_g: number
  carb_g: number
  fat_g: number
  fiber_g: number | null
  sodium_mg: number | null
  items: number
  day_type: DayType
  target_kcal: number | null
  target_protein_g: number | null
  target_carb_g: number | null
  target_fat_g: number | null
  protein_hit: boolean | null
  kcal_in_range: boolean | null
  water_ml: number
}
export type WeeklySummary = {
  user_id: string
  week_start: string
  week_end: string
  weight_sessions: number
  runs: number
  run_km: number
  run_sec: number
  active_days: number
  avg_weight_kg: number | null
  weigh_ins: number | null
  weight_change_kg: number | null
  run_km_change: number | null
  avg_kcal: number | null
  avg_protein_g: number | null
  avg_carb_g: number | null
  avg_fat_g: number | null
  food_days: number | null
  protein_days_hit: number | null
  kcal_days_in_range: number | null
  avg_sleep_hours: number | null
  avg_resting_hr: number | null
}

export type PrEvent = {
  user_id: string
  exercise_id: string
  session_id: string
  date: string
  max_weight_lb: number | null
  e1rm_lb: number | null
  max_seconds: number | null
  prev_best_e1rm: number | null
  prev_best_weight: number | null
  prev_best_seconds: number | null
}
export type RunPrEvent = {
  user_id: string
  run_id: string
  date: string
  run_type: RunType
  distance_km: number
  pace_sec_per_km: number
  kind: 'pace' | 'distance'
}
export type WeeklyTraining = { user_id: string; week_start: string; volume_lb: number; sets: number; sessions: number }

export interface DayActivity {
  date: string
  planned: Activity | null
  planned_workout: string | null
  weight_done: boolean
  run_done: boolean
  run_km: number | null
  mark: 'skipped' | 'postponed' | null
}

export interface CompareValue { current: number | null; ref: number | null; good?: 'up' | 'down' }
export interface ProgressCompare {
  ref_date: string | null
  body: Record<'weight_kg' | 'pbf_pct' | 'smm_kg' | 'waist_cm' | 'body_fat_kg', CompareValue>
  lifts: { exercises: { name: string; exercise_id: string; current: number | null; ref: number | null }[]; weekly_volume: CompareValue }
  runs: { easy_pace: CompareValue; z2_pace: CompareValue & { hr_min: number; hr_max: number }; weekly_km: CompareValue }
  recovery: { resting_hr: CompareValue; sleep_hours: CompareValue }
  pain: (CompareValue & { part: string })[]
}

export interface Achievement { key: string; title: string; icon: string; value: number; target: number }

export interface PersonalRecords {
  exercises: { exercise_id: string; name: string; measure_type: MeasureType; max_weight_lb: number | null; best_e1rm_lb: number | null; max_seconds: number | null; best_date: string }[]
  best_pace: { run_type: RunType; pace_sec_per_km: number; date: string; distance_km: number }[]
  longest: { distance_km: number; date: string; duration_sec: number | null } | null
  best_5k: { sec: number; date: string; distance_km: number } | null
  best_10k: { sec: number; date: string; distance_km: number } | null
  best_21k: { sec: number; date: string; distance_km: number } | null
}

export type { WeeklyReviewStats } from '@/lib/rules'
import type { WeeklyReviewStats } from '@/lib/rules'

/** ผลของ today_plan(date) */
export interface ResolvedPlanDay extends Partial<RunPlanDay> {
  workout_type: WorkoutType
  title: string
  segments: Segment[]
  add_weights: boolean
  add_strides: boolean
  repeat_source_day_no?: number
  repeat_source_description?: string
}
export interface TodayPlan {
  date: string
  source: 'plan' | 'schedule'
  activity: Activity
  workout_type: string | null
  day_type: DayType
  plan: {
    enrollment_id: string
    plan_id: string
    plan_name: string
    day_no: number
    total_days: number
    status: 'not_started' | 'in_progress' | 'finished'
  } | null
  plan_day: ResolvedPlanDay | null
  weight_program: { id: string; name: string; color: string } | null
  mark: 'skipped' | 'postponed' | null
}

// ---------------------------------------------------------------------------
type Std = 'id' | 'user_id' | 'created_at' | 'updated_at'
type Opt<R> = Table<R, Exclude<keyof R, Std | NullableKeys<R> | DefaultedKeys>>
type NullableKeys<R> = { [K in keyof R]: null extends R[K] ? K : never }[keyof R]
/** คอลัมน์ที่มีค่า default ในฐานข้อมูล */
type DefaultedKeys =
  | 'date' | 'max_hr' | 'default_rest_sec' | 'weight_step_lb' | 'pinned_pain_parts' | 'notify_email' | 'notify_weekly'
  | 'notify_push' | 'start_date' | 'status' | 'sort_order' | 'measure_type' | 'grip_intensive' | 'active' | 'color'
  | 'is_warmup' | 'target_sets' | 'is_deload' | 'segments' | 'items' | 'add_strides' | 'add_weights' | 'day_offset'
  | 'start_km' | 'retire_km' | 'completed' | 'source' | 'pace_sec_per_km' | 'pinned' | 'calories' | 'protein_g'
  | 'carb_g' | 'fat_g' | 'is_estimate' | 'is_favorite' | 'servings' | 'taken' | 'good' | 'improve' | 'nutrition_mode' | 'channels'

export interface Database {
  public: {
    Tables: {
      settings: Opt<Settings>
      goals: Opt<Goal>
      exercises: Opt<Exercise>
      weight_programs: Opt<WeightProgram>
      program_exercises: Opt<ProgramExercise>
      weight_sessions: Opt<WeightSession>
      weight_sets: Opt<WeightSet>
      weekly_schedule: Opt<WeeklySchedule>
      weight_rotation: Opt<WeightRotation>
      warmup_routines: Opt<WarmupRoutine>
      run_plans: Opt<RunPlan>
      run_plan_days: Opt<RunPlanDay>
      plan_enrollments: Opt<PlanEnrollment>
      day_marks: Opt<DayMark>
      shoes: Opt<Shoe>
      runs: Opt<Run>
      run_intervals: Opt<RunInterval>
      run_splits: Opt<RunSplit>
      body_weight: Opt<BodyWeight>
      body_comp: Opt<BodyComp>
      progress_photos: Opt<ProgressPhoto>
      daily_checkin: Opt<DailyCheckin>
      pain_log: Opt<PainLog>
      foods: Opt<Food>
      recipes: Opt<Recipe>
      recipe_items: Opt<RecipeItem>
      meal_templates: Opt<MealTemplate>
      food_log: Opt<FoodLog>
      water_log: Opt<WaterLog>
      supplements: Opt<Supplement>
      supplement_log: Opt<SupplementLog>
      nutrition_targets: Opt<NutritionTarget>
      weekly_reviews: Opt<WeeklyReview>
      tdee_proposals: Opt<TdeeProposal>
      push_subscriptions: Opt<PushSubscriptionRow>
      notification_log: Opt<NotificationLog>
    }
    Views: {
      last_performance: View<LastPerformance>
      exercise_progress: View<ExerciseProgress>
      last_run_by_type: View<LastRunByType>
      goal_progress: View<GoalProgressRow>
      daily_nutrition: View<DailyNutrition>
      weekly_summary: View<WeeklySummary>
      pr_events: View<PrEvent>
      run_pr_events: View<RunPrEvent>
      weekly_training: View<WeeklyTraining>
      food_usage: View<FoodUsage>
      shoe_usage: View<ShoeUsage>
    }
    Functions: {
      today_plan: { Args: { p_date?: string }; Returns: TodayPlan }
      bootstrap_user: { Args: { p_start_date?: string }; Returns: boolean }
      goal_progress: { Args: { p_date?: string }; Returns: GoalProgressRow[] }
      weight_program_for: { Args: { p_date?: string }; Returns: string | null }
      resolve_plan_day: { Args: { p_plan_id: string; p_day_no: number }; Returns: ResolvedPlanDay | null }
      day_activity: { Args: { p_from: string; p_to: string }; Returns: DayActivity[] }
      progress_compare: { Args: { p_ref?: string | null; p_today?: string }; Returns: ProgressCompare }
      achievements: { Args: { p_today?: string }; Returns: Achievement[] }
      personal_records: { Args: Record<string, never>; Returns: PersonalRecords }
      weekly_review_stats: { Args: { p_week_start: string }; Returns: WeeklyReviewStats }
      tdee_inputs: { Args: { p_end?: string }; Returns: import('@/features/nutrition/nutritionCalc').TdeeInputs }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type TableName = keyof Database['public']['Tables']
export type RowOf<T extends TableName> = Database['public']['Tables'][T]['Row']
export type InsertOf<T extends TableName> = Database['public']['Tables'][T]['Insert']
