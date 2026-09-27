import { cx } from '@/components/ui'
import type { Macros } from './nutritionCalc'

export interface DayTarget { kcal: number; protein_g: number; carb_g: number; fat_g: number }

/** วงแหวน kcal */
export function KcalRing({ eaten, target, size = 120 }: { eaten: number; target: number; size?: number }) {
  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  const pct = target ? Math.min(1, eaten / target) : 0
  const over = target > 0 && eaten > target * 1.1
  const left = Math.round(target - eaten)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={10} className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className={over ? 'stroke-amber-500' : 'stroke-blue-600'}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        <span className="text-2xl font-bold tabular-nums">{Math.round(eaten).toLocaleString()}</span>
        <span className="text-[11px] text-slate-500">/ {target.toLocaleString()} kcal</span>
        <span className={cx('text-xs font-semibold', left < 0 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300')}>
          {left >= 0 ? `เหลือ ${left.toLocaleString()}` : `เกิน ${(-left).toLocaleString()}`}
        </span>
      </div>
    </div>
  )
}

function Bar({ label, eaten, target }: { label: string; eaten: number; target: number }) {
  const pct = target ? Math.min(100, (eaten / target) * 100) : 0
  const left = Math.round(target - eaten)
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-slate-600 dark:text-slate-300">
          {Math.round(eaten)}/{target} g <span className="text-xs text-slate-500">{left >= 0 ? `เหลือ ${left}` : `เกิน ${-left}`}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={cx('h-full rounded-full', eaten > target * 1.15 ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function MacroSummary({ eaten, target }: { eaten: Macros; target: DayTarget }) {
  return (
    <div className="flex items-center gap-4">
      <KcalRing eaten={eaten.calories} target={target.kcal} />
      <div className="min-w-0 flex-1 space-y-2">
        <Bar label="โปรตีน" eaten={eaten.protein_g} target={target.protein_g} />
        <Bar label="คาร์บ" eaten={eaten.carb_g} target={target.carb_g} />
        <Bar label="ไขมัน" eaten={eaten.fat_g} target={target.fat_g} />
      </div>
    </div>
  )
}

export const DAY_TYPE_TH = { weight: 'วันเวท', run_easy: 'วันวิ่งเบา', run_hard: 'วันวิ่งหนัก', rest: 'วันพัก' } as const
