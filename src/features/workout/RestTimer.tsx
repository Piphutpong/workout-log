import { useEffect, useState } from 'react'
import { alertDone } from '@/lib/alerts'
import { fmtDuration } from '@/lib/calc'

/** แถบนับถอยหลังเวลาพัก (อิงเวลาจริง ไม่คลาดแม้แอปถูกพักไว้ชั่วคราว) */
export function RestTimer({ endAt, total, onChange, label }: {
  endAt: number | null
  total: number
  onChange: (endAt: number | null) => void
  label?: string
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endAt) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [endAt])
  useEffect(() => {
    if (endAt && now >= endAt) {
      alertDone()
      onChange(null)
    }
  }, [now, endAt, onChange])
  if (!endAt) return null
  const left = Math.max(0, Math.ceil((endAt - now) / 1000))
  const pct = total ? (left / total) * 100 : 0
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-slate-900 text-white shadow-xl dark:bg-slate-100 dark:text-slate-900">
        <div className="h-1 bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <div className="text-xs opacity-70">พัก{label ? ` · ${label}` : ''}</div>
            <div className="text-3xl font-bold tabular-nums">{fmtDuration(left)}</div>
          </div>
          <button type="button" className="min-h-12 rounded-xl bg-white/15 px-4 font-semibold dark:bg-black/10" onClick={() => onChange(endAt + 15_000)}>
            +15 วิ
          </button>
          <button type="button" className="min-h-12 rounded-xl bg-blue-600 px-4 font-semibold text-white" onClick={() => onChange(null)}>
            ข้าม
          </button>
        </div>
      </div>
    </div>
  )
}
