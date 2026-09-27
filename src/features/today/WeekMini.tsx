import { Link } from 'react-router-dom'
import { useDayActivity } from '@/lib/api'
import { addDays, todayIso, weekStart } from '@/lib/date'
import { Card, ProgressBar } from '@/components/ui'
import { consistencyOf, pct } from '@/features/dashboard/consistency'

/** สรุปสัปดาห์แบบย่อบนหน้าวันนี้ */
export function WeekMini() {
  const ws = weekStart(todayIso())
  const we = addDays(ws, 6)
  const act = useDayActivity(ws, we)
  if (!act.data) return null
  const c = consistencyOf(act.data, ws, we)
  const km = act.data.reduce((a, d) => a + Number(d.run_km ?? 0), 0)
  const planned = c.weight.planned + c.run.planned
  const done = c.weight.done + c.run.done
  return (
    <Card title="📊 สัปดาห์นี้" action={<Link to="/" className="text-sm text-blue-700 dark:text-blue-300">ภาพรวม →</Link>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-2xl font-bold">{c.activeDays}</div><div className="text-xs text-slate-500">วันที่ออกกำลัง</div></div>
        <div><div className="text-2xl font-bold">{c.weight.done}/{c.weight.planned}</div><div className="text-xs text-slate-500">เวท</div></div>
        <div><div className="text-2xl font-bold">{c.run.done}/{c.run.planned}</div><div className="text-xs text-slate-500">วิ่ง · {km.toFixed(1)} กม.</div></div>
      </div>
      <ProgressBar className="mt-3" pct={pct(done, planned) ?? 0} />
    </Card>
  )
}
