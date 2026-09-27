import { fmtDayMonth } from '@/lib/date'
import type { LastPerformance, MeasureType, ProgramExercise } from '@/types/database'

const n = (v: number | null | undefined) => (v == null ? '-' : Number(v) % 1 === 0 ? String(Number(v)) : Number(v).toFixed(1))

/** "ครั้งก่อน 27/09: 25lb × 10, 10, 9" */
export function fmtLastPerformance(lp: LastPerformance | undefined, measure: MeasureType): string | null {
  if (!lp?.sets?.length) return null
  const sets = lp.sets
  let body: string
  if (measure === 'seconds') {
    const w = sets[0].weight_lb
    body = `${w ? `${n(w)}lb × ` : ''}${sets.map((s) => n(s.seconds)).join(', ')} วิ`
  } else if (measure === 'band') {
    const bands = new Set(sets.map((s) => s.band_level))
    body = bands.size === 1
      ? `ยาง${sets[0].band_level ?? '-'} × ${sets.map((s) => n(s.reps)).join(', ')}`
      : sets.map((s) => `${s.band_level ?? '-'}×${n(s.reps)}`).join(', ')
  } else {
    const weights = new Set(sets.map((s) => Number(s.weight_lb ?? 0)))
    body = weights.size === 1
      ? `${n(sets[0].weight_lb)}lb × ${sets.map((s) => n(s.reps)).join(', ')}`
      : sets.map((s) => `${n(s.weight_lb)}×${n(s.reps)}`).join(', ')
  }
  return `ครั้งก่อน ${fmtDayMonth(lp.date)}: ${body}`
}

/** "3 × 10 @ 25lb" */
export function fmtTarget(pe: Pick<ProgramExercise, 'target_sets' | 'target_reps' | 'target_seconds' | 'target_weight_lb'> & { target_reps_max?: number | null }): string {
  const reps = pe.target_reps_max && pe.target_reps_max !== pe.target_reps ? `${pe.target_reps ?? '-'}-${pe.target_reps_max}` : `${pe.target_reps ?? '-'}`
  const what = pe.target_seconds ? `${pe.target_seconds} วิ` : reps
  return `${pe.target_sets} × ${what}${pe.target_weight_lb ? ` @ ${n(pe.target_weight_lb)}lb` : ''}`
}
