import { useState } from 'react'
import { fmtDate, THAI_DOW_SHORT, todayIso } from '@/lib/date'
import { useChartTheme } from '@/components/charts'
import type { DayActivity } from '@/types/database'

type Kind = 'weight' | 'run' | 'both' | 'rest' | 'missed' | 'future' | 'none'

function kindOf(d: DayActivity, today: string): Kind {
  if (d.weight_done && d.run_done) return 'both'
  if (d.weight_done) return 'weight'
  if (d.run_done) return 'run'
  if (d.date > today) return 'future'
  if (d.mark === 'skipped' || d.planned === 'weight' || d.planned === 'run') return d.date === today ? 'none' : 'missed'
  return 'rest'
}

const KIND_TH: Record<Kind, string> = {
  weight: 'เวท', run: 'วิ่ง', both: 'เวท + วิ่ง', rest: 'พัก', missed: 'ข้าม/ไม่ได้ทำ', future: 'ยังไม่ถึง', none: 'ยังไม่ได้ทำ',
}

/** Heatmap 12 สัปดาห์ (แถว = สัปดาห์ เริ่มวันจันทร์) */
export function Heatmap({ days }: { days: DayActivity[] }) {
  const theme = useChartTheme()
  const today = todayIso()
  const [sel, setSel] = useState<DayActivity | null>(null)
  const weeks: DayActivity[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  const bg = (k: Kind) => {
    const w = theme.series[0], r = theme.series[1]
    switch (k) {
      case 'weight': return { background: w }
      case 'run': return { background: r }
      case 'both': return { background: `linear-gradient(135deg, ${w} 50%, ${r} 50%)` }
      default: return {}
    }
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => <span key={d}>{THAI_DOW_SHORT[d]}</span>)}
      </div>
      <div className="mt-1 space-y-1">
        {weeks.map((wk) => (
          <div key={wk[0].date} className="grid grid-cols-7 gap-1">
            {wk.map((d) => {
              const k = kindOf(d, today)
              return (
                <button
                  key={d.date}
                  type="button"
                  title={`${fmtDate(d.date)}: ${KIND_TH[k]}`}
                  aria-label={`${fmtDate(d.date)}: ${KIND_TH[k]}`}
                  onClick={() => setSel(d)}
                  style={bg(k)}
                  className={[
                    'flex aspect-square items-center justify-center rounded-[4px] text-[10px] font-bold',
                    k === 'rest' && 'bg-slate-200 dark:bg-slate-800',
                    k === 'missed' && 'border border-slate-400 text-slate-500 dark:border-slate-600',
                    (k === 'future' || k === 'none') && 'border border-dashed border-slate-300 dark:border-slate-700',
                    d.date === today && 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white dark:ring-offset-slate-900',
                    sel?.date === d.date && 'outline outline-2 outline-offset-1 outline-slate-500',
                  ].filter(Boolean).join(' ')}
                >
                  {k === 'missed' ? '✗' : ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1"><i className="size-3 rounded-[3px]" style={{ background: theme.series[0] }} /> เวท</span>
        <span className="flex items-center gap-1"><i className="size-3 rounded-[3px]" style={{ background: theme.series[1] }} /> วิ่ง</span>
        <span className="flex items-center gap-1"><i className="size-3 rounded-[3px] bg-slate-200 dark:bg-slate-800" /> พัก</span>
        <span className="flex items-center gap-1"><i className="flex size-3 items-center justify-center rounded-[3px] border border-slate-400 text-[8px] not-italic">✗</i> ข้าม</span>
      </div>
      {sel && (
        <p className="mt-2 text-sm">
          <b>{fmtDate(sel.date)}</b>: {KIND_TH[kindOf(sel, today)]}
          {sel.planned && ` · แผน: ${sel.planned === 'weight' ? 'เวท' : sel.planned === 'run' ? 'วิ่ง' : sel.planned === 'rest' ? 'พัก' : 'Active recovery'}`}
          {sel.run_km ? ` · ${Number(sel.run_km)} กม.` : ''}
        </p>
      )}
    </div>
  )
}
