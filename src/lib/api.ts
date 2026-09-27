// Query hooks ที่ใช้ร่วมกันหลายหน้า (TanStack Query + supabase-js)
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { todayIso, addDays } from './date'
import type {
  Achievement, BodyComp, DailyCheckin, DayActivity, ExerciseProgress, Goal, GoalProgressRow, PainLog, PersonalRecords, PrEvent,
  ProgressCompare, ProgressPhoto, RunPrEvent, WeeklyReview, WeeklySummary, WeeklyTraining,
  BodyWeight, DayMark, Exercise, LastPerformance, LastRunByType, PlanEnrollment, ProgramExercise, Run, RunPlan,
  RunPlanDay, Settings, Shoe, TodayPlan, WarmupRoutine, WeeklySchedule, WeightProgram, WeightRotation,
} from '@/types/database'

/** คืนข้อมูลเป็น unknown แล้วให้ผู้เรียกระบุชนิด (คอลัมน์ jsonb ใน types ที่ generate เป็น Json) */
function must(res: { data: unknown; error: { message: string } | null }): unknown {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

export const qk = {
  settings: ['settings'] as const,
  today: (date: string) => ['today_plan', date] as const,
  exercises: ['exercises'] as const,
  programs: ['weight_programs'] as const,
  programExercises: ['program_exercises'] as const,
  rotation: ['weight_rotation'] as const,
  schedule: ['weekly_schedule'] as const,
  warmups: ['warmup_routines'] as const,
  lastPerf: ['last_performance'] as const,
  bodyWeights: ['body_weight'] as const,
  runPlans: ['run_plans'] as const,
  planDays: (planId: string) => ['run_plan_days', planId] as const,
  enrollment: ['plan_enrollments'] as const,
  shoes: ['shoes'] as const,
  lastRunByType: ['last_run_by_type'] as const,
  runs: ['runs'] as const,
  dayMarks: ['day_marks'] as const,
  weightSessionsRecent: ['weight_sessions', 'recent'] as const,
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => must(await supabase.from('settings').select('*').maybeSingle()) as Settings | null,
  })
}

export function useTodayPlan(date: string = todayIso()) {
  return useQuery({
    queryKey: qk.today(date),
    queryFn: async () => must(await supabase.rpc('today_plan', { p_date: date })) as TodayPlan,
  })
}

export function useExercises() {
  return useQuery({
    queryKey: qk.exercises,
    queryFn: async () => must(await supabase.from('exercises').select('*').order('name')) as Exercise[],
  })
}

export function usePrograms() {
  return useQuery({
    queryKey: qk.programs,
    queryFn: async () =>
      must(await supabase.from('weight_programs').select('*').order('sort_order').order('name')) as WeightProgram[],
  })
}

export function useProgramExercises() {
  return useQuery({
    queryKey: qk.programExercises,
    queryFn: async () =>
      must(await supabase.from('program_exercises').select('*').order('sort_order')) as ProgramExercise[],
  })
}

export function useRotation() {
  return useQuery({
    queryKey: qk.rotation,
    queryFn: async () => must(await supabase.from('weight_rotation').select('*').order('sort_order')) as WeightRotation[],
  })
}

export function useSchedule() {
  return useQuery({
    queryKey: qk.schedule,
    queryFn: async () => must(await supabase.from('weekly_schedule').select('*').order('day_of_week')) as WeeklySchedule[],
  })
}

export function useWarmups() {
  return useQuery({
    queryKey: qk.warmups,
    queryFn: async () => must(await supabase.from('warmup_routines').select('*')) as WarmupRoutine[],
  })
}

export function useLastPerformance() {
  return useQuery({
    queryKey: qk.lastPerf,
    queryFn: async () => {
      const rows = must(await supabase.from('last_performance').select('*')) as LastPerformance[]
      return new Map(rows.map((r) => [r.exercise_id, r]))
    },
  })
}

/** น้ำหนักตัว 60 วันล่าสุด (ใหม่ → เก่า) */
export function useBodyWeights() {
  return useQuery({
    queryKey: qk.bodyWeights,
    queryFn: async () =>
      must(
        await supabase.from('body_weight').select('*').gte('date', addDays(todayIso(), -60)).order('date', { ascending: false }),
      ) as BodyWeight[],
  })
}

export function useRunPlans() {
  return useQuery({
    queryKey: qk.runPlans,
    queryFn: async () => must(await supabase.from('run_plans').select('*').order('user_id', { nullsFirst: true }).order('name')) as RunPlan[],
  })
}

export function usePlanDays(planId: string | undefined) {
  return useQuery({
    queryKey: qk.planDays(planId ?? ''),
    enabled: Boolean(planId),
    queryFn: async () =>
      must(await supabase.from('run_plan_days').select('*').eq('plan_id', planId!).order('day_no')) as RunPlanDay[],
  })
}

export function useActiveEnrollment() {
  return useQuery({
    queryKey: qk.enrollment,
    queryFn: async () =>
      must(await supabase.from('plan_enrollments').select('*').order('created_at', { ascending: false })) as PlanEnrollment[],
    select: (rows) => ({ all: rows, active: rows.find((r) => r.status === 'active') ?? null }),
  })
}

export function useShoes() {
  return useQuery({
    queryKey: qk.shoes,
    queryFn: async () => must(await supabase.from('shoes').select('*').order('start_date', { ascending: false })) as Shoe[],
  })
}

export function useLastRunByType() {
  return useQuery({
    queryKey: qk.lastRunByType,
    queryFn: async () => {
      const rows = must(await supabase.from('last_run_by_type').select('*')) as LastRunByType[]
      return new Map(rows.map((r) => [r.run_type, r]))
    },
  })
}

/** วิ่ง 120 วันล่าสุด */
export function useRecentRuns() {
  return useQuery({
    queryKey: qk.runs,
    queryFn: async () =>
      must(
        await supabase.from('runs').select('*').gte('date', addDays(todayIso(), -120)).order('date', { ascending: false }),
      ) as Run[],
  })
}

export function useDayMarks() {
  return useQuery({
    queryKey: qk.dayMarks,
    queryFn: async () =>
      must(await supabase.from('day_marks').select('*').gte('date', addDays(todayIso(), -180))) as DayMark[],
  })
}

/** session เวท 60 วันล่าสุด */
export function useRecentWeightSessions() {
  return useQuery({
    queryKey: qk.weightSessionsRecent,
    queryFn: async () =>
      must(
        await supabase
          .from('weight_sessions')
          .select('id, date, program_id, duration_min, is_deload')
          .gte('date', addDays(todayIso(), -60))
          .order('date', { ascending: false }),
      ) as { id: string; date: string; program_id: string | null; duration_min: number | null; is_deload: boolean }[],
  })
}

// ---------------------------------------------------------------------------
// Phase 2: Dashboard / ความก้าวหน้า / ร่างกาย
// query ที่ขึ้นต้นด้วย 'dash' จะถูก invalidate ทุกครั้งที่บันทึกข้อมูล (ดู invalidateDash)
// ---------------------------------------------------------------------------
export const dk = {
  all: ['dash'] as const,
  goalProgress: ['dash', 'goal_progress'] as const,
  goals: ['dash', 'goals'] as const,
  dayActivity: (from: string, to: string) => ['dash', 'day_activity', from, to] as const,
  compare: (ref: string | null) => ['dash', 'compare', ref] as const,
  achievements: ['dash', 'achievements'] as const,
  records: ['dash', 'records'] as const,
  recentPrs: ['dash', 'recent_prs'] as const,
  weekly: ['dash', 'weekly_summary'] as const,
  weeklyTraining: ['dash', 'weekly_training'] as const,
  reviews: ['dash', 'weekly_reviews'] as const,
  checkins: ['dash', 'daily_checkin'] as const,
  pain: ['dash', 'pain_log'] as const,
  bodyComp: ['dash', 'body_comp'] as const,
  photos: ['dash', 'progress_photos'] as const,
  exerciseProgress: (id: string) => ['dash', 'exercise_progress', id] as const,
  weightsAll: ['dash', 'body_weight_all'] as const,
  runsAll: ['dash', 'runs_all'] as const,
}

export function invalidateDash(qc: import('@tanstack/react-query').QueryClient) {
  return qc.invalidateQueries({ queryKey: dk.all })
}

export function useGoalProgress() {
  return useQuery({
    queryKey: dk.goalProgress,
    queryFn: async () => must(await supabase.rpc('goal_progress', { p_date: todayIso() })) as GoalProgressRow[],
  })
}

export function useGoals() {
  return useQuery({
    queryKey: dk.goals,
    queryFn: async () => must(await supabase.from('goals').select('*').order('sort_order').order('created_at')) as Goal[],
  })
}

export function useDayActivity(from: string, to: string) {
  return useQuery({
    queryKey: dk.dayActivity(from, to),
    queryFn: async () => must(await supabase.rpc('day_activity', { p_from: from, p_to: to })) as DayActivity[],
  })
}

export function useProgressCompare(ref: string | null) {
  return useQuery({
    queryKey: dk.compare(ref),
    queryFn: async () => must(await supabase.rpc('progress_compare', { p_ref: ref ?? undefined, p_today: todayIso() })) as ProgressCompare,
  })
}

export function useAchievements() {
  return useQuery({
    queryKey: dk.achievements,
    queryFn: async () => must(await supabase.rpc('achievements', { p_today: todayIso() })) as Achievement[],
  })
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: dk.records,
    queryFn: async () => must(await supabase.rpc('personal_records')) as PersonalRecords,
  })
}

export function useRecentPrs(days = 30) {
  return useQuery({
    queryKey: dk.recentPrs,
    queryFn: async () => {
      const from = addDays(todayIso(), -days)
      const [lifts, runs] = await Promise.all([
        supabase.from('pr_events').select('*').gte('date', from).order('date', { ascending: false }),
        supabase.from('run_pr_events').select('*').gte('date', from).order('date', { ascending: false }),
      ])
      return { lifts: must(lifts) as PrEvent[], runs: must(runs) as RunPrEvent[] }
    },
  })
}

export function useWeeklySummary() {
  return useQuery({
    queryKey: dk.weekly,
    queryFn: async () => must(await supabase.from('weekly_summary').select('*').order('week_start')) as WeeklySummary[],
  })
}

export function useWeeklyTraining() {
  return useQuery({
    queryKey: dk.weeklyTraining,
    queryFn: async () => must(await supabase.from('weekly_training').select('*').order('week_start')) as WeeklyTraining[],
  })
}

export function useWeeklyReviews() {
  return useQuery({
    queryKey: dk.reviews,
    queryFn: async () =>
      must(await supabase.from('weekly_reviews').select('*').order('week_start', { ascending: false })) as WeeklyReview[],
  })
}

export function useCheckins(days = 120) {
  return useQuery({
    queryKey: dk.checkins,
    queryFn: async () =>
      must(await supabase.from('daily_checkin').select('*').gte('date', addDays(todayIso(), -days)).order('date', { ascending: false })) as DailyCheckin[],
  })
}

export function usePainLog() {
  return useQuery({
    queryKey: dk.pain,
    queryFn: async () =>
      must(await supabase.from('pain_log').select('*').gte('date', addDays(todayIso(), -365)).order('date', { ascending: false }).order('created_at', { ascending: false })) as PainLog[],
  })
}

export function useBodyComp() {
  return useQuery({
    queryKey: dk.bodyComp,
    queryFn: async () => must(await supabase.from('body_comp').select('*').order('date', { ascending: false })) as BodyComp[],
  })
}

export function useProgressPhotos() {
  return useQuery({
    queryKey: dk.photos,
    queryFn: async () => must(await supabase.from('progress_photos').select('*').order('date', { ascending: false })) as ProgressPhoto[],
  })
}

export function useExerciseProgress(exerciseId: string | undefined) {
  return useQuery({
    queryKey: dk.exerciseProgress(exerciseId ?? ''),
    enabled: Boolean(exerciseId),
    queryFn: async () =>
      must(await supabase.from('exercise_progress').select('*').eq('exercise_id', exerciseId!).order('date')) as ExerciseProgress[],
  })
}

/** น้ำหนักตัวทั้งหมด (เก่า → ใหม่) สำหรับกราฟ */
export function useAllBodyWeights() {
  return useQuery({
    queryKey: dk.weightsAll,
    queryFn: async () => must(await supabase.from('body_weight').select('date, weight_kg').order('date')) as Pick<BodyWeight, 'date' | 'weight_kg'>[],
  })
}

/** วิ่งทั้งหมดแบบย่อ (เก่า → ใหม่) สำหรับกราฟ */
export function useAllRuns() {
  return useQuery({
    queryKey: dk.runsAll,
    queryFn: async () =>
      must(
        await supabase.from('runs').select('id, date, run_type, distance_km, duration_sec, pace_sec_per_km, avg_hr, completed, plan_day_id').order('date'),
      ) as Pick<Run, 'id' | 'date' | 'run_type' | 'distance_km' | 'duration_sec' | 'pace_sec_per_km' | 'avg_hr' | 'completed' | 'plan_day_id'>[],
  })
}
