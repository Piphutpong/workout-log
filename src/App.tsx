import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { backendConfigured } from '@/lib/backend'
import { useSettings } from '@/lib/api'
import { store } from '@/lib/store'
import { pullAll, upsertRows } from '@/lib/offline/queue'
import { bootstrapRows } from '@/lib/engine/seed'
import type { TableName } from '@/types/database'
import { todayIso } from '@/lib/date'
import { Button, ErrorBox, Spinner } from '@/components/ui'
import { Layout } from '@/components/Layout'
import { OverlayHost } from '@/components/overlay'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { TodayPage } from '@/features/today/TodayPage'

const WorkoutLogPage = lazy(() => import('@/features/workout/WorkoutLogPage').then((m) => ({ default: m.WorkoutLogPage })))
const ProgramsPage = lazy(() => import('@/features/workout/ProgramsPage').then((m) => ({ default: m.ProgramsPage })))
const ProgramEditorPage = lazy(() => import('@/features/workout/ProgramEditorPage').then((m) => ({ default: m.ProgramEditorPage })))
const RunLogPage = lazy(() => import('@/features/run/RunLogPage').then((m) => ({ default: m.RunLogPage })))
const IntervalTimerPage = lazy(() => import('@/features/run/IntervalTimerPage').then((m) => ({ default: m.IntervalTimerPage })))
const RunPlansPage = lazy(() => import('@/features/run/RunPlansPage').then((m) => ({ default: m.RunPlansPage })))
const PlanDetailPage = lazy(() => import('@/features/run/PlanDetailPage').then((m) => ({ default: m.PlanDetailPage })))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ProgressPage = lazy(() => import('@/features/dashboard/ProgressPage').then((m) => ({ default: m.ProgressPage })))
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })))
const BodyPage = lazy(() => import('@/features/body/BodyPage').then((m) => ({ default: m.BodyPage })))
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const NutritionPage = lazy(() => import('@/features/nutrition/NutritionPage').then((m) => ({ default: m.NutritionPage })))
const FoodsPage = lazy(() => import('@/features/nutrition/FoodsPage').then((m) => ({ default: m.FoodsPage })))
const RecipesPage = lazy(() => import('@/features/nutrition/RecipesPage').then((m) => ({ default: m.RecipesPage })))
const ShoesPage = lazy(() => import('@/features/run/ShoesPage').then((m) => ({ default: m.ShoesPage })))
const ExercisesPage = lazy(() => import('@/features/workout/ExercisesPage').then((m) => ({ default: m.ExercisesPage })))
const DataPage = lazy(() => import('@/pages/DataPage').then((m) => ({ default: m.DataPage })))
const MorePage = lazy(() => import('@/pages/MorePage').then((m) => ({ default: m.MorePage })))

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <LoginPage />
  return <SignedIn />
}

/** ครั้งแรก: ดึงข้อมูลจาก Sheet ถ้าในเครื่องยังว่าง → ถ้า Sheet ก็ยังว่าง สร้างข้อมูลตั้งต้นแล้วเข้า onboarding */
function SignedIn() {
  const settings = useSettings()
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const running = useRef(false)

  useEffect(() => {
    if (settings.data || running.current) return
    running.current = true
    void (async () => {
      try {
        if (!store.hasData) await pullAll()
        if (!store.hasData) {
          const seed = bootstrapRows(todayIso())
          for (const [t, rows] of Object.entries(seed)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (rows?.length) await upsertRows(t as TableName, rows as any)
          }
        }
      } catch (e) {
        setError(e)
      } finally {
        running.current = false
      }
    })()
  }, [settings.data, attempt])

  if (error && !settings.data) {
    return (
      <div className="space-y-3 p-4">
        <ErrorBox error={error} />
        <Button onClick={() => { setError(null); setAttempt(attempt + 1) }}>ลองใหม่</Button>
      </div>
    )
  }
  if (!settings.data) return <Spinner label="กำลังเตรียมข้อมูล…" />
  if (!settings.data.onboarded_at) return <OnboardingPage />

  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="body" element={<BodyPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="nutrition" element={<NutritionPage />} />
        <Route path="nutrition/foods" element={<FoodsPage />} />
        <Route path="nutrition/recipes" element={<RecipesPage />} />
        <Route path="workout" element={<WorkoutLogPage />} />
        <Route path="workout/programs" element={<ProgramsPage />} />
        <Route path="workout/programs/:id" element={<ProgramEditorPage />} />
        <Route path="run" element={<RunLogPage />} />
        <Route path="run/timer" element={<IntervalTimerPage />} />
        <Route path="plans" element={<RunPlansPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="more/shoes" element={<ShoesPage />} />
        <Route path="more/data" element={<DataPage />} />
        <Route path="more/exercises" element={<ExercisesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

export default function App() {
  if (!backendConfigured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold">ยังไม่ได้ตั้งค่า Google Sheet</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          ใส่ URL ของ Apps Script Web App ใน <code>.env</code> เป็น VITE_GAS_URL (ดู README)
        </p>
      </div>
    )
  }
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
        <OverlayHost />
      </AuthProvider>
    </HashRouter>
  )
}
