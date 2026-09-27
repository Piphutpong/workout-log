import { useState } from 'react'
import { useWarmups } from '@/lib/api'
import { fmtDuration } from '@/lib/calc'
import { Card, cx } from '@/components/ui'
import type { WarmupRoutine } from '@/types/database'

function load(key: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as number[]
  } catch {
    return []
  }
}

/** checklist วอร์มอัพ (สถานะเก็บในเครื่องต่อวัน) */
export function WarmupChecklist({ type, date }: { type: WarmupRoutine['activity_type']; date: string }) {
  const { data = [] } = useWarmups()
  const routine = data.find((r) => r.activity_type === type)
  const key = `warmup:${date}:${type}`
  const [done, setDone] = useState<number[]>(() => load(key))
  if (!routine?.items.length) return null
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((d) => d !== i) : [...done, i]
    setDone(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return (
    <Card title={`🔥 Warm-up: ${routine.name}`} action={<span className="text-sm text-slate-500">{done.length}/{routine.items.length}</span>}>
      <ul className="space-y-1">
        {routine.items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left active:bg-slate-100 dark:active:bg-slate-800"
            >
              <span className={cx('flex size-6 items-center justify-center rounded-md border-2', done.includes(i) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300')}>
                {done.includes(i) && '✓'}
              </span>
              <span className={cx('flex-1', done.includes(i) && 'text-slate-400 line-through')}>{it.name}</span>
              <span className="text-sm text-slate-500">
                {it.sec ? fmtDuration(it.sec) : it.reps ? `${it.reps} เที่ยว` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
