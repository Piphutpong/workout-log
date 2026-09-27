// วันที่ทั้งหมดในแอปใช้เขตเวลา Asia/Bangkok และเก็บเป็นสตริง ISO 'YYYY-MM-DD'
export const TZ = 'Asia/Bangkok'

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

export function todayIso(now: Date = new Date()): string {
  return isoFmt.format(now)
}

export function nowTime(now: Date = new Date()): string {
  return timeFmt.format(now)
}

/** 'YYYY-MM-DD' → วว/ดด/ปปปป */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** 'YYYY-MM-DD' → วว/ดด */
export function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  return new Date(toUtc(iso) + n * 86_400_000).toISOString().slice(0, 10)
}

/** b − a เป็นจำนวนวัน */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

/** 0 = อาทิตย์ */
export function dayOfWeek(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay()
}

/** วันจันทร์ของสัปดาห์ */
export function weekStart(iso: string): string {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7))
}

export const THAI_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
export const THAI_DOW_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

export function fmtLongDate(iso: string): string {
  return `วัน${THAI_DOW[dayOfWeek(iso)]} ${fmtDate(iso)}`
}
