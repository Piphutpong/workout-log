import type { RunType, Segment, WorkoutType } from '@/types/database'

/** วิ่งแบบไม่ใช้แผน (ข้อ 4.4) */
export const FREE_RUN_TEMPLATES: Record<'easy' | 'interval' | 'long', { title: string; segments: Segment[] }> = {
  easy: {
    title: 'Easy 30-40 นาที',
    segments: [{ repeat: 1, work_sec: 1800, work_sec_max: 2400, work_type: 'run', zone: '2', hr_min_pct: 60, hr_max_pct: 70 }],
  },
  interval: {
    title: 'Interval วิ่งเร็ว 1 นาที / ช้า 2 นาที × 6',
    segments: [{ repeat: 6, work_sec: 60, work_type: 'run', hr_min_pct: 80, hr_max_pct: 90, recover_sec: 120, recover_type: 'jog' }],
  },
  long: {
    title: 'Long 45-50 นาที',
    segments: [{ repeat: 1, work_sec: 2700, work_sec_max: 3000, work_type: 'run', zone: '2', hr_min_pct: 60, hr_max_pct: 70 }],
  },
}

export const RUN_TYPE_TH: Record<RunType, string> = {
  easy: 'Easy',
  long: 'Long run',
  interval: 'Interval',
  tempo: 'Tempo',
  threshold: 'Threshold (T.Pace)',
  vo2max: 'VO2max',
  walk_run: 'วิ่งสลับเดิน',
  strides: 'Strides',
  race_test: 'Test/Race',
  recovery: 'Recovery',
}

export const WORKOUT_TH: Record<WorkoutType, string> = {
  rest: 'พัก',
  active_recovery: 'Active recovery',
  walk_run: 'วิ่งสลับเดิน',
  easy: 'Easy',
  long: 'Long run',
  interval: 'Interval',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2max: 'VO2max',
  strides: 'Strides',
  race_test: 'Test/Race',
  weights: 'เวท',
}

/** สีตาม workout_type (ใช้ในปฏิทิน) */
export const WORKOUT_COLOR: Record<WorkoutType, string> = {
  rest: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  active_recovery: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200',
  walk_run: 'bg-lime-100 text-lime-800 dark:bg-lime-900/60 dark:text-lime-200',
  easy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  long: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200',
  interval: 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200',
  tempo: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  threshold: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
  vo2max: 'bg-red-200 text-red-900 dark:bg-red-900/70 dark:text-red-100',
  strides: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200',
  race_test: 'bg-violet-200 text-violet-900 dark:bg-violet-900/70 dark:text-violet-100',
  weights: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
}

/** workout_type ของแผน → run_type ที่ใช้บันทึก */
export function runTypeFromWorkout(w: WorkoutType | string | null | undefined): RunType {
  switch (w) {
    case 'long': case 'interval': case 'tempo': case 'threshold': case 'vo2max': case 'walk_run': case 'strides': case 'race_test':
      return w
    default:
      return 'easy'
  }
}

export const isHardRun = (t: string | null | undefined) =>
  ['interval', 'tempo', 'threshold', 'vo2max', 'race_test', 'strides'].includes(t ?? '')
