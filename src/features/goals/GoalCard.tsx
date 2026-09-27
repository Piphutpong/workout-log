import { fmtDate } from '@/lib/date'
import { Badge, ProgressBar } from '@/components/ui'
import type { Exercise, GoalProgressRow } from '@/types/database'
import { metricInfo, STATE_UI } from './goalMeta'

export function GoalCard({ g, exercises, onClick }: { g: GoalProgressRow; exercises?: Exercise[]; onClick?: () => void }) {
  const info = metricInfo(g.metric, exercises)
  const ui = STATE_UI[g.state]
  const f = (v: number | null | undefined) => (v == null ? '-' : info.format(Number(v)))
  const keep = g.direction === 'keep_above' || g.direction === 'keep_below'
  const remaining = g.remaining != null ? Number(g.remaining) : null
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:active:bg-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold">{g.title}</div>
          <div className="text-xs text-slate-500">{info.label}</div>
        </div>
        <Badge color={ui.tone}>{ui.icon} {ui.text}</Badge>
      </div>

      {keep ? (
        <div className="mt-2 text-sm">
          ปัจจุบัน <b className="text-lg tabular-nums">{f(g.current_value)}</b> {info.unit} · เป้า {g.direction === 'keep_above' ? '≥' : '≤'} {f(g.target_value)} {info.unit}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between text-sm tabular-nums">
            <span className="text-slate-500">{f(g.start_value)}</span>
            <span className="text-lg font-bold">{f(g.current_value)} <span className="text-sm font-normal">{info.unit}</span></span>
            <span className="text-slate-500">🎯 {f(g.target_value)}</span>
          </div>
          <ProgressBar className="mt-1" pct={Number(g.progress_pct ?? 0)} tone={g.state === 'behind' ? 'amber' : g.state === 'done' ? 'green' : 'blue'} />
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-500">
            <span>{g.progress_pct != null ? `${Number(g.progress_pct).toFixed(0)}%` : ''}</span>
            {remaining != null && g.state !== 'done' && !info.recurring && (
              <span>ต้อง{remaining < 0 ? 'ลด' : 'เพิ่ม'}อีก {info.format(Math.abs(remaining))} {info.unit}</span>
            )}
            {g.days_left != null && g.state !== 'done' && <span>เหลือ {g.days_left} วัน</span>}
          </div>
        </>
      )}
      {g.forecast_date && g.state !== 'done' && !keep && (
        <div className="mt-1 text-xs text-slate-500">
          คาดว่าถึงเป้า {fmtDate(g.forecast_date)}
          {g.target_date && g.forecast_date > g.target_date ? ' (หลังวันเป้าหมาย)' : ''}
        </div>
      )}
      {g.expected_value != null && g.state !== 'done' && (
        <div className="text-xs text-slate-400">ตามเส้นแผนควรอยู่ที่ {f(g.expected_value)} {info.unit}</div>
      )}
    </Tag>
  )
}
