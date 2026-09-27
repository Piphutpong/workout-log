import { fmtPace } from '@/lib/calc'
import type { Exercise, GoalDirection } from '@/types/database'

export interface MetricInfo { label: string; unit: string; format: (v: number) => string; recurring?: boolean }

const num = (d: number) => (v: number) => Number(v).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })

/** ข้อมูลแสดงผลของ metric (รองรับ metric แบบมีพารามิเตอร์ เช่น pain_avg7:ศอกซ้าย) */
export function metricInfo(metric: string, exercises?: Exercise[]): MetricInfo {
  const [key, arg] = metric.split(':')
  switch (key) {
    case 'weight_kg': return { label: 'น้ำหนัก (เฉลี่ย 7 วัน)', unit: 'กก.', format: num(1) }
    case 'pbf_pct': return { label: 'PBF', unit: '%', format: num(1) }
    case 'smm_kg': return { label: 'SMM', unit: 'กก.', format: num(1) }
    case 'waist_cm': return { label: 'รอบเอว', unit: 'ซม.', format: num(1) }
    case 'body_fat_kg': return { label: 'Body fat', unit: 'กก.', format: num(1) }
    case 'visceral_fat': return { label: 'Visceral fat', unit: '', format: num(0) }
    case 'active_days_week': return { label: 'วันออกกำลังกายสัปดาห์นี้', unit: 'วัน', format: num(0), recurring: true }
    case 'run_distance_week': return { label: 'ระยะวิ่งสัปดาห์นี้', unit: 'กม.', format: num(1), recurring: true }
    case 'pain_avg7': return { label: `เจ็บ${arg} เฉลี่ย 7 วัน`, unit: '/10', format: num(1) }
    case 'e1rm': return { label: `1RM ${exercises?.find((e) => e.id === arg)?.name ?? 'ท่า'}`, unit: 'lb', format: num(1) }
    case 'run_pace': return { label: `pace ${arg} (3 ครั้งล่าสุด)`, unit: '/กม.', format: (v) => fmtPace(v) }
    default: return { label: metric, unit: '', format: num(1) }
  }
}

export const DIRECTION_TH: Record<GoalDirection, string> = {
  down: 'ลดลงให้ถึง',
  up: 'เพิ่มให้ถึง',
  keep_above: 'รักษาไว้ไม่ต่ำกว่า',
  keep_below: 'รักษาไว้ไม่เกิน',
}

export const GOAL_TYPE_TH = { body: 'ร่างกาย', strength: 'ความแข็งแรง', run: 'วิ่ง', consistency: 'ความสม่ำเสมอ', plan: 'แผน' } as const

export const STATE_UI = {
  on_track: { icon: '✅', text: 'ตามแผน', tone: 'green' as const },
  behind: { icon: '⚠️', text: 'ช้ากว่าแผน', tone: 'amber' as const },
  done: { icon: '🎯', text: 'ถึงเป้าแล้ว', tone: 'green' as const },
  no_data: { icon: '—', text: 'ยังไม่มีข้อมูล', tone: 'slate' as const },
}

/** metric ที่เลือกได้ตอนสร้างเป้าหมาย */
export function metricOptions(exercises: Exercise[], painParts: string[]) {
  return [
    { value: 'weight_kg', label: 'น้ำหนักตัว (เฉลี่ย 7 วัน)', type: 'body' },
    { value: 'pbf_pct', label: 'PBF %', type: 'body' },
    { value: 'smm_kg', label: 'SMM (กก.)', type: 'body' },
    { value: 'waist_cm', label: 'รอบเอว (ซม.)', type: 'body' },
    { value: 'body_fat_kg', label: 'Body fat (กก.)', type: 'body' },
    { value: 'active_days_week', label: 'วันออกกำลังกาย/สัปดาห์', type: 'consistency' },
    { value: 'run_distance_week', label: 'ระยะวิ่ง/สัปดาห์ (กม.)', type: 'run' },
    { value: 'run_pace:easy', label: 'pace Easy run', type: 'run' },
    { value: 'run_pace:interval', label: 'pace Interval', type: 'run' },
    ...painParts.map((p) => ({ value: `pain_avg7:${p}`, label: `อาการเจ็บ${p} (เฉลี่ย 7 วัน)`, type: 'body' })),
    ...exercises.filter((e) => e.active && e.measure_type === 'reps').map((e) => ({ value: `e1rm:${e.id}`, label: `1RM ${e.name} (lb)`, type: 'strength' })),
  ] as { value: string; label: string; type: 'body' | 'strength' | 'run' | 'consistency' }[]
}
