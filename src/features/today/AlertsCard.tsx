import { useQuery } from '@tanstack/react-query'
import { useGoals } from '@/lib/api'
import { todayIso, weekStart } from '@/lib/date'
import { Card } from '@/components/ui'
import { computeReview, losingWeight } from '@/features/dashboard/weeklyReview'

/** คำเตือนตามกฎข้อ 6 ของสัปดาห์นี้ (คำนวณฝั่ง database แล้วใช้กฎชุดเดียวกับสรุปรายสัปดาห์) */
export function AlertsCard() {
  const goals = useGoals()
  const ws = weekStart(todayIso())
  const alerts = useQuery({
    queryKey: ['dash', 'alerts', ws],
    enabled: Boolean(goals.data),
    queryFn: () => computeReview(ws, losingWeight(goals.data)),
    staleTime: 10 * 60_000,
  })
  const items = alerts.data?.improve ?? []
  if (!items.length) return null
  return (
    <Card title="🔔 แจ้งเตือน" className="ring-amber-300 dark:ring-amber-800">
      <ul className="space-y-2 text-sm">{items.map((t) => <li key={t}>⚠️ {t}</li>)}</ul>
    </Card>
  )
}
