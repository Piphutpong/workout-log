// ช่วงค่าที่สมเหตุสมผล — ถ้าหลุดช่วงให้ถามยืนยันก่อนบันทึก (ไม่บล็อก)
import { z } from 'zod'

export const RANGES = {
  body_weight_kg: { min: 40, max: 150, label: 'น้ำหนักตัว', unit: 'กก.' },
  hr: { min: 40, max: 220, label: 'ชีพจร', unit: 'bpm' },
  max_hr: { min: 140, max: 220, label: 'MaxHR', unit: 'bpm' },
  distance_km: { min: 0.2, max: 60, label: 'ระยะวิ่ง', unit: 'กม.' },
  pace_sec: { min: 150, max: 1200, label: 'pace', unit: 'วิ/กม.' },
  weight_lb: { min: 0, max: 400, label: 'น้ำหนักที่ยก', unit: 'lb' },
  reps: { min: 1, max: 50, label: 'จำนวนครั้ง', unit: 'ครั้ง' },
  seconds: { min: 1, max: 600, label: 'เวลา', unit: 'วินาที' },
  height_cm: { min: 120, max: 230, label: 'ส่วนสูง', unit: 'ซม.' },
  kcal: { min: 1200, max: 5000, label: 'แคลอรี่', unit: 'kcal' },
} as const

export type RangeKey = keyof typeof RANGES

/** คืนข้อความเตือนของค่าที่หลุดช่วง */
export function rangeWarnings(values: Partial<Record<RangeKey, number | null | undefined>>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(values) as [RangeKey, number | null | undefined][]) {
    if (v == null || Number.isNaN(v)) continue
    const r = RANGES[k]
    if (v < r.min || v > r.max) out.push(`${r.label} ${v} ${r.unit} อยู่นอกช่วงปกติ (${r.min}-${r.max})`)
  }
  return out
}

/** input type=number ที่ว่าง → null */
export const optionalNumber = z.preprocess(
  (v) => (v === '' || v == null || Number.isNaN(v) ? null : Number(v)),
  z.number().nullable(),
)
