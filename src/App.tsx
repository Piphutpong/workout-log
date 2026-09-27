import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { qk, useSettings } from '@/lib/api'
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
const MorePage = lazy(() => import('@/pages/MorePage').then((m) => ({ default: m.MorePage })))

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <LoginPage />
  return <SignedIn />
}

/** ครั้งแรกหลังล็อกอิน: สร้างข้อมูลตั้งต้น (bootstrap_user) แล้วเข้า onboarding */
function SignedIn() {
  const qc = useQueryClient()
  const settings = useSettings()
  const [bootError, setBootError] = useState<unknown>(null)
  const booting = useRef(false)

  useEffect(() => {
    if (settings.isSuccess && settings.data === null && !booting.current) {
      booting.current = true
      void supabase.rpc('bootstrap_user', { p_start_date: todayIso() }).then(({ error }) => {
        if (error) setBootError(error)
        else void qc.invalidateQueries({ queryKey: qk.settings })
      })
    }
  }, [settings.isSuccess, settings.data, qc])

  if (bootError) return <div className="p-4"><ErrorBox error={bootError} /></div>
  if (settings.error && !settings.data) {
    return (
      <div className="space-y-3 p-4">
        <ErrorBox error={settings.error} />
        <Button onClick={() => void settings.refetch()}>ลองใหม่</Button>
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
        <Route path="workout" element={<WorkoutLogPage />} />
        <Route path="workout/programs" element={<ProgramsPage />} />
        <Route path="workout/programs/:id" element={<ProgramEditorPage />} />
        <Route path="run" element={<RunLogPage />} />
        <Route path="run/timer" element={<IntervalTimerPage />} />
        <Route path="plans" element={<RunPlansPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold">ยังไม่ได้ตั้งค่า Supabase</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          คัดลอก <code>.env.example</code> เป็น <code>.env</code> แล้วใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY (ดู README)
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
