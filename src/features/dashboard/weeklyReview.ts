import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { dk, useGoals, useSettings, useWeeklyReviews } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { addDays, todayIso, weekStart } from '@/lib/date'
import { upsertRows } from '@/lib/offline/queue'
import { evaluateWeek } from '@/lib/rules'
import type { Goal, WeeklyReviewStats } from '@/types/database'

export function losingWeight(goals: Goal[] | undefined) {
  return (goals ?? []).some((g) => g.metric === 'weight_kg' && g.status === 'active' && g.direction === 'down')
}

export async function computeReview(ws: string, losing: boolean) {
  const { data, error } = await supabase.rpc('weekly_review_stats', { p_week_start: ws })
  if (error) throw new Error(error.message)
  const stats = data as unknown as WeeklyReviewStats
  const r = evaluateWeek(stats, { losingWeight: losing })
  return { stats, good: r.good.map((m) => m.text), improve: r.improve.map((m) => m.text) }
}

export async function saveReview(qc: QueryClient, ws: string, losing: boolean) {
  const r = await computeReview(ws, losing)
  await upsertRows('weekly_reviews', [{ week_start: ws, good: r.good, improve: r.improve, stats: r.stats }], 'user_id,week_start')
  await qc.invalidateQueries({ queryKey: dk.reviews })
  return r
}

/** สร้างสรุปของสัปดาห์ที่แล้วอัตโนมัติ (ทุกวันจันทร์ = ครั้งแรกที่เปิดแอปในสัปดาห์ใหม่) */
export function useEnsureWeeklyReview() {
  const qc = useQueryClient()
  const reviews = useWeeklyReviews()
  const settings = useSettings()
  const goals = useGoals()
  const running = useRef(false)
  const lastWs = addDays(weekStart(todayIso()), -7)

  useEffect(() => {
    if (!reviews.data || !settings.data || !goals.data || running.current || !navigator.onLine) return
    const started = settings.data.program_start_date ?? settings.data.created_at.slice(0, 10)
    if (started > addDays(lastWs, 6)) return // ยังไม่ได้เริ่มใช้งานในสัปดาห์นั้น
    if (reviews.data.some((r) => r.week_start === lastWs)) return
    running.current = true
    void saveReview(qc, lastWs, losingWeight(goals.data)).catch(() => undefined).finally(() => {
      running.current = false
    })
  }, [reviews.data, settings.data, goals.data, lastWs, qc])

  return reviews
}
