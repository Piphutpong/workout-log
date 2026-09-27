// สูตรคำนวณทั้งหมด (มี unit test ใน calc.test.ts)
import type { Segment } from '@/types/database'
import { daysBetween } from './date'

// ---------------------------------------------------------------------------
// เวลา / pace
// ---------------------------------------------------------------------------
export function paceSecPerKm(distanceKm: number | null | undefined, durationSec: number | null | undefined): number | null {
  if (!distanceKm || !durationSec || distanceKm <= 0 || durationSec <= 0) return null
  return durationSec / distanceKm
}

/** 330 → "5:30" */
export function fmtPace(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '-'
  const r = Math.round(sec)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

/** 3725 → "1:02:05", 1930 → "32:10" */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '-'
  const r = Math.round(sec)
  const h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), s = r % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** "32:10" | "1:02:05" | "45" (นาที) → วินาที */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null
  const parts = t.split(':').map(Number)
  if (parts.length === 1) return parts[0] * 60
  if (parts.some((p, i) => i > 0 && p >= 60)) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

/** ผลต่าง pace: ติดลบ = เร็วขึ้น */
export function paceDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null
  return Math.round(current - previous)
}

// ---------------------------------------------------------------------------
// เวท
// ---------------------------------------------------------------------------
/** Estimated 1RM (Epley) = w × (1 + reps/30); reps = 1 ใช้น้ำหนักจริง */
export function epley1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (!weight || !reps || weight <= 0 || reps <= 0) return null
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

export interface SetResult { weight_lb?: number | null; reps?: number | null; seconds?: number | null }

/** ครั้งที่แล้วทำครบทุกเซ็ตตามเป้า → แนะนำเพิ่มน้ำหนัก */
export function canProgress(
  lastSets: SetResult[] | null | undefined,
  target: { sets: number; reps?: number | null; seconds?: number | null },
): boolean {
  if (!lastSets || lastSets.length < target.sets) return false
  const done = lastSets.slice(0, target.sets)
  if (target.reps) return done.every((s) => (s.reps ?? 0) >= target.reps!)
  if (target.seconds) return done.every((s) => (s.seconds ?? 0) >= target.seconds!)
  return false
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

// ---------------------------------------------------------------------------
// เป้าหมาย / สถิติ
// ---------------------------------------------------------------------------
/** (start − current) ÷ (start − target) × 100 จำกัด 0-100 */
export function goalProgressPct(start: number, current: number, target: number): number {
  if (start === target) return 100
  const pct = ((start - current) / (start - target)) * 100
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10))
}

export interface Point { x: number; y: number }

/** least squares: y = intercept + slope·x */
export function linearRegression(points: Point[]): { slope: number; intercept: number } | null {
  const n = points.length
  if (n < 2) return null
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0, sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

/** คาดการณ์จำนวนวันจนถึงเป้า (null = ไม่มีแนวโน้มไปทางเป้า) */
export function daysToTarget(current: number, target: number, slopePerDay: number): number | null {
  if (!slopePerDay) return null
  const d = (target - current) / slopePerDay
  return d >= 0 && d < 3650 ? Math.ceil(d) : null
}

/** ค่าเฉลี่ยเคลื่อนที่ (ย้อนหลัง window จุดรวมจุดปัจจุบัน) */
export function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/**
 * Adaptive TDEE = kcal เฉลี่ยที่กิน − (ค่าเปลี่ยนแปลงของน้ำหนักเฉลี่ย 7 วัน × 7,700 ÷ จำนวนวัน)
 * weightChangeKg ติดลบ = น้ำหนักลด → TDEE สูงกว่าที่กิน
 */
export function adaptiveTdee(avgKcal: number, weightChangeKg: number, days: number): number | null {
  if (days <= 0) return null
  return Math.round(avgKcal - (weightChangeKg * 7700) / days)
}

// ---------------------------------------------------------------------------
// แผนวิ่ง
// ---------------------------------------------------------------------------
/** day_no = (date − start_date) + 1 − day_offset */
export function planDayNo(date: string, startDate: string, dayOffset = 0): number {
  return daysBetween(startDate, date) + 1 - dayOffset
}

/** วันที่จริงของ day_no ในแผน (ใช้แสดงปฏิทิน) — กลับด้านของ planDayNo */
export function planDateOf(dayNo: number, startDate: string, dayOffset = 0): string {
  const d = new Date(`${startDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dayNo - 1 + dayOffset)
  return d.toISOString().slice(0, 10)
}

/** วันต้นทางของ "ทำซ้ำ Week X" */
export function repeatSourceDayNo(dayNo: number, weekNo: number, repeatOfWeek: number): number {
  return dayNo - (weekNo - repeatOfWeek) * 7
}

// ---------------------------------------------------------------------------
// ชีพจร
// ---------------------------------------------------------------------------
export const ZONES: { zone: number; name: string; min: number; max: number }[] = [
  { zone: 1, name: 'Recovery', min: 50, max: 60 },
  { zone: 2, name: 'Easy / Aerobic', min: 60, max: 70 },
  { zone: 3, name: 'Tempo', min: 70, max: 80 },
  { zone: 4, name: 'Threshold', min: 80, max: 90 },
  { zone: 5, name: 'VO2max', min: 90, max: 100 },
]

export const pctToBpm = (pct: number, maxHr: number) => Math.round((pct / 100) * maxHr)
export const bpmToPct = (bpm: number, maxHr: number) => Math.round((bpm / maxHr) * 1000) / 10

export function hrZonesBpm(maxHr: number) {
  return ZONES.map((z) => ({ ...z, minBpm: pctToBpm(z.min, maxHr), maxBpm: pctToBpm(z.max, maxHr) }))
}

export type HrStatus = 'low' | 'in' | 'high'
export function hrStatus(avgHr: number, maxHr: number, minPct: number, maxPct: number): HrStatus {
  const pct = bpmToPct(avgHr, maxHr)
  if (pct < minPct) return 'low'
  if (pct > maxPct) return 'high'
  return 'in'
}

/** ช่วง HR เป้าหมายของทั้งวัน (จาก segment ที่เป็นช่วงหลัก) */
export function planHrRange(segments: Segment[]): { min: number; max: number } | null {
  const withHr = segments.filter((s) => s.hr_min_pct != null && s.hr_max_pct != null)
  if (!withHr.length) return null
  return { min: Math.min(...withHr.map((s) => s.hr_min_pct!)), max: Math.max(...withHr.map((s) => s.hr_max_pct!)) }
}

// ---------------------------------------------------------------------------
// Segments → ข้อความ / ขั้นตอนของ interval timer
// ---------------------------------------------------------------------------
const rng = (a?: number, b?: number, f: (n: number) => string = String) =>
  a == null ? '' : b != null && b !== a ? `${f(a)}-${f(b)}` : f(a)
const secText = (s: number) => (s % 60 === 0 ? `${s / 60} นาที` : s >= 60 ? `${fmtPace(s)} นาที` : `${s} วิ`)
const secRange = (a?: number, b?: number) => {
  if (a == null) return ''
  if (b == null || b === a) return secText(a)
  if (a % 60 === 0 && b % 60 === 0) return `${a / 60}-${b / 60} นาที`
  return `${secText(a)}-${secText(b)}`
}
const RECOVER_TH: Record<string, string> = { walk: 'เดิน', jog: 'จ็อก', rest: 'พัก', fast_walk: 'เดินเร็ว' }
const WORK_TH: Record<string, string> = { run: 'วิ่ง', walk: 'เดิน', fast_walk: 'เดินเร็ว' }

export function workText(s: Segment): string {
  if (s.work_km != null) return `${rng(s.work_km, s.work_km_max)} กม.`
  if (s.work_m != null) return `${rng(s.work_m, s.work_m_max)} ม.`
  if (s.work_sec != null) return secRange(s.work_sec, s.work_sec_max)
  return ''
}

export function recoverText(s: Segment): string {
  const parts: string[] = []
  if (s.recover_m != null) parts.push(`${s.recover_m} ม.`)
  if (s.recover_sec != null) parts.push(secRange(s.recover_sec, s.recover_sec_max))
  if (!parts.length) return ''
  return `${RECOVER_TH[s.recover_type ?? 'rest'] ?? 'พัก'} ${parts.join(' / ')}`
}

export function describeSegment(s: Segment): string {
  const reps = s.repeat > 1 || s.repeat_max ? `${rng(s.repeat, s.repeat_max)} × ` : ''
  const what = `${WORK_TH[s.work_type ?? 'run']} ${workText(s)}`.trim()
  const hr = s.hr_min_pct != null ? ` @ ${rng(s.hr_min_pct, s.hr_max_pct)}% MaxHR` : ''
  const zone = s.zone ? ` (Zone ${s.zone})` : ''
  const rec = recoverText(s)
  const after = s.rest_after_sec ? ` แล้วพัก ${secText(s.rest_after_sec)}` : ''
  const label = s.label ? ` — ${s.label}` : ''
  return `${reps}${what}${hr}${zone}${rec ? `, ${rec}` : ''}${after}${label}`
}

export interface TimerStep {
  kind: 'work' | 'recover' | 'rest'
  label: string
  /** วินาที (ถ้าเป็นระยะทาง = null → กด "ถัดไป" เอง) */
  sec: number | null
  meters: number | null
  rep: number
  reps: number
  hr?: { min: number; max: number }
}

/** แปลง segments เป็นลำดับขั้นของ timer ('min' ใช้ค่าต่ำของช่วง, 'max' ใช้ค่าสูง) */
export function buildTimerSteps(segments: Segment[], pick: 'min' | 'max' = 'min'): TimerStep[] {
  const steps: TimerStep[] = []
  const val = (a?: number, b?: number) => (pick === 'max' && b != null ? b : a)
  segments.forEach((s, si) => {
    const reps = val(s.repeat, s.repeat_max) ?? 1
    const workSec = val(s.work_sec, s.work_sec_max) ?? null
    const workM = s.work_km != null ? (val(s.work_km, s.work_km_max) ?? 0) * 1000 : (val(s.work_m, s.work_m_max) ?? null)
    const recSec = val(s.recover_sec, s.recover_sec_max) ?? null
    const hr = s.hr_min_pct != null ? { min: s.hr_min_pct, max: s.hr_max_pct ?? s.hr_min_pct } : undefined
    const workLabel = `${WORK_TH[s.work_type ?? 'run']}${s.label ? ` (${s.label})` : ''}`
    if (workSec == null && workM == null) {
      steps.push({ kind: 'work', label: s.label ?? workLabel, sec: null, meters: null, rep: 1, reps: 1, hr })
      return
    }
    for (let r = 1; r <= reps; r++) {
      steps.push({ kind: 'work', label: workLabel, sec: workSec, meters: workSec == null ? workM : null, rep: r, reps, hr })
      const lastRepOfLastSeg = r === reps && si === segments.length - 1
      if ((recSec != null || s.recover_m != null) && !(r === reps && s.rest_after_sec) && !lastRepOfLastSeg) {
        steps.push({
          kind: 'recover',
          label: RECOVER_TH[s.recover_type ?? 'rest'] ?? 'พัก',
          sec: recSec,
          meters: recSec == null ? (s.recover_m ?? null) : null,
          rep: r,
          reps,
        })
      }
    }
    if (s.rest_after_sec && si < segments.length - 1) {
      steps.push({ kind: 'rest', label: 'พักก่อนชุดถัดไป', sec: s.rest_after_sec, meters: null, rep: 1, reps: 1 })
    }
  })
  return steps
}

export function totalTimerSec(steps: TimerStep[]): number {
  return steps.reduce((a, s) => a + (s.sec ?? 0), 0)
}
