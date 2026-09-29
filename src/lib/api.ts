// Data hooks: อ่าน/คำนวณจากข้อมูลในเครื่อง (store) — ข้อมูลจริงอยู่ใน Google Sheet และซิงก์อัตโนมัติ
// คงชื่อ/รูปแบบ hook เดิม ({ data, isLoading, ... }) เพื่อให้หน้าจอไม่ต้องเปลี่ยน
import { useMemo, useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { store } from './store'
import { addDays, todayIso } from './date'
import { todayPlan } from './engine/plan'
import {
  achievements, dayActivity, exerciseProgress, goalProgress, lastPerformance, lastRunByType, personalRecords, prEvents,
  progressCompare, runPrEvents, weeklySummary, weeklyTraining,
} from './engine/stats'
import { byAsc, byDesc } from './engine/db'

const subscribe = (fn: () => void) => store.subscribe(fn)
const getVersion = () => store.version

export interface LocalResult<T> {
  data: T
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  isFetched: boolean
  error: null
  refetch: () => Promise<void>
}

/** คำนวณใหม่อัตโนมัติเมื่อข้อมูลในเครื่องเปลี่ยน */
export function useLocal<T>(compute: () => T, deps: unknown[] = []): LocalResult<T> {
  const version = useSyncExternalStore(subscribe, getVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(compute, [version, ...deps])
  return { data, isLoading: false, isSuccess: true, isError: false, isFetched: true, error: null, refetch: async () => undefined }
}

const rows = store.rows.bind(store)
const db = store.db

// query keys เดิม (ยังใช้กับ invalidate ได้ แต่ข้อมูลจริงอัปเดตเองจาก store)
export const qk = {
  settings: ['settings'], today: (date: string) => ['today_plan', date], exercises: ['exercises'], programs: ['weight_programs'],
  programExercises: ['program_exercises'], rotation: ['weight_rotation'], schedule: ['weekly_schedule'], warmups: ['warmup_routines'],
  lastPerf: ['last_performance'], bodyWeights: ['body_weight'], runPlans: ['run_plans'], planDays: (id: string) => ['run_plan_days', id],
  enrollment: ['plan_enrollments'], shoes: ['shoes'], lastRunByType: ['last_run_by_type'], runs: ['runs'], dayMarks: ['day_marks'],
  weightSessionsRecent: ['weight_sessions', 'recent'],
} as const
export const dk = {
  all: ['dash'], goalProgress: ['dash', 'goal_progress'], goals: ['dash', 'goals'], reviews: ['dash', 'weekly_reviews'],
} as const
export function invalidateDash(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: dk.all })
}

export const useSettings = () => useLocal(() => rows('settings')[0] ?? null)
export const useTodayPlan = (date: string = todayIso()) => useLocal(() => todayPlan(db, date), [date])
export const useExercises = () => useLocal(() => [...rows('exercises')].sort((a, b) => a.name.localeCompare(b.name)))
export const usePrograms = () => useLocal(() => [...rows('weight_programs')].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)))
export const useProgramExercises = () => useLocal(() => [...rows('program_exercises')].sort((a, b) => a.sort_order - b.sort_order))
export const useRotation = () => useLocal(() => [...rows('weight_rotation')].sort((a, b) => a.sort_order - b.sort_order))
export const useSchedule = () => useLocal(() => [...rows('weekly_schedule')].sort((a, b) => a.day_of_week - b.day_of_week))
export const useWarmups = () => useLocal(() => rows('warmup_routines'))
export const useLastPerformance = () => useLocal(() => lastPerformance(db))

/** น้ำหนักตัว 60 วันล่าสุด (ใหม่ → เก่า) */
export const useBodyWeights = () => useLocal(() => {
  const from = addDays(todayIso(), -60)
  return rows('body_weight').filter((b) => b.date >= from).sort(byDesc((b) => b.date))
})

export const useRunPlans = () => useLocal(() => [...rows('run_plans')].sort((a, b) =>
  Number(a.user_id != null) - Number(b.user_id != null) || a.name.localeCompare(b.name)))
export const usePlanDays = (planId: string | undefined) =>
  useLocal(() => rows('run_plan_days').filter((d) => d.plan_id === planId).sort((a, b) => a.day_no - b.day_no), [planId])
export const useActiveEnrollment = () => useLocal(() => {
  const all = [...rows('plan_enrollments')].sort(byDesc((e) => e.created_at))
  return { all, active: all.find((e) => e.status === 'active') ?? null }
})
export const useShoes = () => useLocal(() => [...rows('shoes')].sort(byDesc((s) => s.start_date)))
export const useLastRunByType = () => useLocal(() => lastRunByType(db))
/** วิ่ง 120 วันล่าสุด */
export const useRecentRuns = () => useLocal(() => {
  const from = addDays(todayIso(), -120)
  return rows('runs').filter((r) => r.date >= from).sort(byDesc((r) => r.date, (r) => r.created_at))
})
export const useDayMarks = () => useLocal(() => rows('day_marks'))
/** session เวท 60 วันล่าสุด */
export const useRecentWeightSessions = () => useLocal(() => {
  const from = addDays(todayIso(), -60)
  return rows('weight_sessions').filter((s) => s.date >= from).sort(byDesc((s) => s.date))
})

// ---------------------------------------------------------------------------
// Dashboard / ความก้าวหน้า / ร่างกาย
// ---------------------------------------------------------------------------
export const useGoalProgress = () => useLocal(() => goalProgress(db, todayIso()))
export const useGoals = () => useLocal(() => [...rows('goals')].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)))
export const useDayActivity = (from: string, to: string) => useLocal(() => dayActivity(db, from, to), [from, to])
export const useProgressCompare = (ref: string | null) => useLocal(() => progressCompare(db, ref, todayIso()), [ref])
export const useAchievements = () => useLocal(() => achievements(db, todayIso()))
export const usePersonalRecords = () => useLocal(() => personalRecords(db))
export const useRecentPrs = (days = 30) => useLocal(() => {
  const from = addDays(todayIso(), -days)
  return {
    lifts: prEvents(db).filter((p) => p.date >= from).sort(byDesc((p) => p.date)),
    runs: runPrEvents(db).filter((p) => p.date >= from).sort(byDesc((p) => p.date)),
  }
}, [days])
export const useWeeklySummary = () => useLocal(() => weeklySummary(db))
export const useWeeklyTraining = () => useLocal(() => weeklyTraining(db))
export const useWeeklyReviews = () => useLocal(() => [...rows('weekly_reviews')].sort(byDesc((r) => r.week_start)))
export const useCheckins = (days = 120) => useLocal(() => {
  const from = addDays(todayIso(), -days)
  return rows('daily_checkin').filter((c) => c.date >= from).sort(byDesc((c) => c.date))
}, [days])
export const usePainLog = () => useLocal(() => {
  const from = addDays(todayIso(), -365)
  return rows('pain_log').filter((p) => p.date >= from).sort(byDesc((p) => p.date, (p) => p.created_at))
})
export const useBodyComp = () => useLocal(() => [...rows('body_comp')].sort(byDesc((c) => c.date)))
export const useProgressPhotos = () => useLocal(() => [...rows('progress_photos')].sort(byDesc((p) => p.date)))
export const useExerciseProgress = (exerciseId: string | undefined) =>
  useLocal(() => (exerciseId ? exerciseProgress(db, exerciseId) : []), [exerciseId])
/** น้ำหนักตัวทั้งหมด (เก่า → ใหม่) */
export const useAllBodyWeights = () => useLocal(() => [...rows('body_weight')].sort(byAsc((b) => b.date)))
/** วิ่งทั้งหมด (เก่า → ใหม่) */
export const useAllRuns = () => useLocal(() => [...rows('runs')].sort(byAsc((r) => r.date, (r) => r.created_at)))
