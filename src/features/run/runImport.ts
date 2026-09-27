// นำเข้าไฟล์วิ่ง .gpx / .tcx / .fit → ระยะ เวลา pace HR และ splits รายกิโลเมตร
import { nowTime, todayIso } from '@/lib/date'

export interface TrackPoint { t: number; lat?: number; lon?: number; dist?: number; hr?: number; ele?: number }
export interface Split { km_no: number; duration_sec: number; avg_hr: number | null; elevation_gain_m: number | null }
export interface ImportedRun {
  source: 'gpx' | 'tcx' | 'fit'
  external_id: string
  date: string
  time_of_day: string
  duration_sec: number
  distance_km: number
  avg_hr: number | null
  max_hr: number | null
  splits: Split[]
}

function haversine(a: TrackPoint, b: TrackPoint) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat! - a.lat!)
  const dLon = toRad(b.lon! - a.lon!)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat!)) * Math.cos(toRad(b.lat!)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** สรุปจากจุดบันทึก (ถ้าไม่มีระยะสะสม คำนวณจากพิกัด) */
export function summarize(
  points: TrackPoint[],
  source: ImportedRun['source'],
  override: Partial<Pick<ImportedRun, 'duration_sec' | 'distance_km' | 'avg_hr' | 'max_hr'>> = {},
): ImportedRun {
  const pts = points.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t)
  if (pts.length < 2) throw new Error('ไฟล์ไม่มีข้อมูลเส้นทาง/เวลาเพียงพอ')
  if (pts.some((p) => p.dist == null)) {
    let d = 0
    pts.forEach((p, i) => {
      if (i > 0 && p.lat != null && pts[i - 1].lat != null) d += haversine(pts[i - 1], p)
      p.dist = d
    })
  }
  const start = new Date(pts[0].t)
  const total = pts[pts.length - 1].dist!
  const hrs = pts.map((p) => p.hr).filter((h): h is number => h != null && h > 0)

  // splits: เวลาที่ข้ามแต่ละกิโลเมตร (interpolate)
  const splits: Split[] = []
  let prevT = pts[0].t
  let prevIdx = 0
  for (let km = 1; km * 1000 <= total; km++) {
    const target = km * 1000
    const i = pts.findIndex((p, k) => k > 0 && p.dist! >= target)
    const a = pts[i - 1], b = pts[i]
    const f = b.dist! === a.dist! ? 0 : (target - a.dist!) / (b.dist! - a.dist!)
    const t = a.t + f * (b.t - a.t)
    const seg = pts.slice(prevIdx, i + 1)
    const segHr = seg.map((p) => p.hr).filter((h): h is number => h != null && h > 0)
    let gain = 0
    let hasEle = false
    for (let k = 1; k < seg.length; k++) {
      if (seg[k].ele != null && seg[k - 1].ele != null) {
        hasEle = true
        const d = seg[k].ele! - seg[k - 1].ele!
        if (d > 0) gain += d
      }
    }
    splits.push({
      km_no: km,
      duration_sec: Math.round((t - prevT) / 1000),
      avg_hr: segHr.length ? Math.round(segHr.reduce((x, y) => x + y, 0) / segHr.length) : null,
      elevation_gain_m: hasEle ? Math.round(gain * 10) / 10 : null,
    })
    prevT = t
    prevIdx = i
  }

  return {
    source,
    external_id: `${source}:${start.toISOString()}`,
    date: todayIso(start),
    time_of_day: nowTime(start),
    duration_sec: override.duration_sec ?? Math.round((pts[pts.length - 1].t - pts[0].t) / 1000),
    distance_km: override.distance_km ?? Math.round(total / 10) / 100,
    avg_hr: override.avg_hr ?? (hrs.length ? Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length) : null),
    max_hr: override.max_hr ?? (hrs.length ? Math.max(...hrs) : null),
    splits,
  }
}

const num = (s: string | null | undefined) => (s == null || s.trim() === '' ? undefined : Number(s))
/** หา element ตาม local name (ไม่สน namespace เช่น gpxtpx:hr, ns3:hr) */
const byLocal = (el: Element | Document, name: string) => Array.from(el.getElementsByTagName('*')).filter((e) => e.localName === name)
const firstText = (el: Element, name: string) => byLocal(el, name)[0]?.textContent ?? null

export function parseGpx(xml: string): ImportedRun {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const pts: TrackPoint[] = byLocal(doc, 'trkpt').map((p) => ({
    t: Date.parse(firstText(p, 'time') ?? ''),
    lat: num(p.getAttribute('lat')),
    lon: num(p.getAttribute('lon')),
    ele: num(firstText(p, 'ele')),
    hr: num(firstText(p, 'hr')),
  }))
  return summarize(pts, 'gpx')
}

export function parseTcx(xml: string): ImportedRun {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const pts: TrackPoint[] = byLocal(doc, 'Trackpoint').map((p) => {
    const hrEl = byLocal(p, 'HeartRateBpm')[0]
    return {
      t: Date.parse(firstText(p, 'Time') ?? ''),
      dist: num(firstText(p, 'DistanceMeters')),
      ele: num(firstText(p, 'AltitudeMeters')),
      hr: hrEl ? num(firstText(hrEl, 'Value')) : undefined,
      lat: num(firstText(p, 'LatitudeDegrees')),
      lon: num(firstText(p, 'LongitudeDegrees')),
    }
  })
  // ใช้เวลารวมจาก Lap (ไม่นับช่วงหยุด) ถ้ามี
  const laps = byLocal(doc, 'Lap')
  const lapTime = laps.reduce((a, l) => a + (num(firstText(l, 'TotalTimeSeconds')) ?? 0), 0)
  return summarize(pts.filter((p) => !Number.isNaN(p.t)), 'tcx', lapTime ? { duration_sec: Math.round(lapTime) } : {})
}

export async function parseFit(buf: ArrayBuffer): Promise<ImportedRun> {
  const { Decoder, Stream } = await import('@garmin/fitsdk')
  const decoder = new Decoder(Stream.fromByteArray(new Uint8Array(buf)))
  if (!decoder.isFIT()) throw new Error('ไม่ใช่ไฟล์ .fit')
  const { messages, errors } = decoder.read()
  if (errors?.length && !messages?.recordMesgs?.length) throw new Error(`อ่านไฟล์ .fit ไม่ได้: ${errors[0]}`)
  type Rec = { timestamp?: Date; distance?: number; heartRate?: number; enhancedAltitude?: number; altitude?: number }
  const recs = (messages.recordMesgs ?? []) as Rec[]
  const pts: TrackPoint[] = recs.filter((r) => r.timestamp).map((r) => ({
    t: new Date(r.timestamp!).getTime(),
    dist: r.distance,
    hr: r.heartRate,
    ele: r.enhancedAltitude ?? r.altitude,
  }))
  const s = (messages.sessionMesgs?.[0] ?? {}) as { totalTimerTime?: number; totalDistance?: number; avgHeartRate?: number; maxHeartRate?: number }
  return summarize(pts, 'fit', {
    duration_sec: s.totalTimerTime ? Math.round(s.totalTimerTime) : undefined,
    distance_km: s.totalDistance ? Math.round(s.totalDistance / 10) / 100 : undefined,
    avg_hr: s.avgHeartRate ?? undefined,
    max_hr: s.maxHeartRate ?? undefined,
  })
}

export async function parseRunFile(file: File): Promise<ImportedRun> {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'gpx') return parseGpx(await file.text())
  if (ext === 'tcx') return parseTcx(await file.text())
  if (ext === 'fit') return parseFit(await file.arrayBuffer())
  throw new Error('รองรับเฉพาะ .gpx .tcx .fit')
}
