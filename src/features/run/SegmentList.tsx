import { describeSegment, pctToBpm } from '@/lib/calc'
import type { Segment } from '@/types/database'

/** รายการช่วงของการซ้อม พร้อมช่วง HR เป็น bpm */
export function SegmentList({ segments, maxHr }: { segments: Segment[]; maxHr: number }) {
  if (!segments.length) return null
  return (
    <ol className="space-y-1.5">
      {segments.map((s, i) => (
        <li key={i} className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
          <span className="font-bold text-slate-400">{i + 1}.</span>
          <span className="flex-1">
            {describeSegment(s)}
            {s.hr_min_pct != null && (
              <span className="ml-1 font-semibold text-rose-600 dark:text-rose-300">
                ({pctToBpm(s.hr_min_pct, maxHr)}-{pctToBpm(s.hr_max_pct ?? s.hr_min_pct, maxHr)} bpm)
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
