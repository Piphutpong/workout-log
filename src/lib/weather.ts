// อุณหภูมิ/ความชื้นจาก Open-Meteo (ฟรี ไม่ต้องใช้ key)
import { daysBetween, todayIso } from './date'

export interface Hourly { time: string[]; temperature_2m: (number | null)[]; relative_humidity_2m: (number | null)[] }

/** เลือกชั่วโมงที่ใกล้เวลาวิ่งที่สุด ('HH:MM') */
export function pickHour(h: Hourly, time: string | null | undefined): { temp_c: number; humidity_pct: number } | null {
  if (!h.time?.length) return null
  const [hh, mm] = (time || '07:00').split(':').map(Number)
  const target = Math.min(23, Math.round(hh + (mm || 0) / 60))
  let idx = h.time.findIndex((t) => Number(t.slice(11, 13)) === target)
  if (idx < 0) idx = 0
  const temp = h.temperature_2m[idx]
  const hum = h.relative_humidity_2m[idx]
  if (temp == null || hum == null) return null
  return { temp_c: Math.round(temp * 10) / 10, humidity_pct: Math.round(hum) }
}

export function weatherUrl(lat: number, lon: number, date: string) {
  // forecast API ย้อนหลังได้ ~3 เดือน เก่ากว่านั้นใช้ archive
  const old = daysBetween(date, todayIso()) > 85
  const base = old ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast'
  return `${base}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m&timezone=Asia%2FBangkok&start_date=${date}&end_date=${date}`
}

export async function fetchWeather(lat: number, lon: number, date: string, time?: string | null) {
  const res = await fetch(weatherUrl(lat, lon, date))
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const j = (await res.json()) as { hourly?: Hourly }
  return j.hourly ? pickHour(j.hourly, time) : null
}

/** ขอตำแหน่งปัจจุบัน (ปัดทศนิยม 2 ตำแหน่ง ≈ 1 กม. เพื่อความเป็นส่วนตัว) */
export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('อุปกรณ์ไม่รองรับตำแหน่ง'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
      (e) => reject(new Error(e.message)),
      { timeout: 10_000, maximumAge: 3_600_000 },
    )
  })
}
