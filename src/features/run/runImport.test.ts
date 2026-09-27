// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseFit, parseGpx, parseTcx, summarize } from './runImport'
import { pickHour } from '@/lib/weather'

// จุดตามแนวเส้นศูนย์สูตร: 0.009° ลองจิจูด ≈ 1,000.8 ม.
const gpx = (n: number) => `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><trkseg>
${Array.from({ length: n }, (_, i) => `<trkpt lat="0" lon="${(i * 0.0045).toFixed(4)}"><ele>${10 + (i % 2)}</ele>
<time>${new Date(Date.UTC(2026, 9, 6, 23, 0, i * 150)).toISOString()}</time>
<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + i}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n')}
</trkseg></trk></gpx>`

describe('import ไฟล์วิ่ง', () => {
  it('GPX: ระยะจากพิกัด, เวลา, HR, splits, วันที่เวลาไทย', () => {
    const r = parseGpx(gpx(5)) // 4 ช่วง × ~500 ม. × 150 วิ
    expect(r.distance_km).toBeCloseTo(2.0, 1)
    expect(r.duration_sec).toBe(600)
    expect(r.avg_hr).toBe(142)
    expect(r.max_hr).toBe(144)
    expect(r.splits).toHaveLength(2)
    expect(r.splits[0].duration_sec).toBeGreaterThan(295)
    expect(r.splits[0].duration_sec).toBeLessThan(305)
    expect(r.date).toBe('2026-10-07') // 23:00 UTC = 06:00 ของวันถัดไปที่กรุงเทพ
    expect(r.time_of_day).toBe('06:00')
    expect(r.external_id).toBe('gpx:2026-10-06T23:00:00.000Z')
  })

  it('TCX: ใช้ DistanceMeters และเวลาจาก Lap', () => {
    const tp = (s: number, d: number, hr: number) => `<Trackpoint><Time>${new Date(Date.UTC(2026, 9, 7, 0, 0, s)).toISOString()}</Time>
<DistanceMeters>${d}</DistanceMeters><HeartRateBpm><Value>${hr}</Value></HeartRateBpm></Trackpoint>`
    const xml = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="Running"><Lap StartTime="x"><TotalTimeSeconds>590</TotalTimeSeconds><Track>
${tp(0, 0, 130)}${tp(300, 1000, 150)}${tp(600, 2000, 160)}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
    const r = parseTcx(xml)
    expect(r.distance_km).toBe(2)
    expect(r.duration_sec).toBe(590)
    expect(r.splits.map((s) => s.duration_sec)).toEqual([300, 300])
    expect(r.max_hr).toBe(160)
  })

  it('FIT: อ่าน session + records', async () => {
    const { Encoder, Profile } = await import('@garmin/fitsdk')
    const enc = new Encoder()
    const t0 = new Date(Date.UTC(2026, 9, 7, 0, 0, 0))
    enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 0, timeCreated: t0, type: 'activity' } as never)
    for (let i = 0; i <= 10; i++) {
      enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0.getTime() + i * 60_000), distance: i * 200, heartRate: 140 + i } as never)
    }
    enc.onMesg(Profile.MesgNum.SESSION, {
      timestamp: new Date(t0.getTime() + 600_000), startTime: t0, totalElapsedTime: 600, totalTimerTime: 600,
      totalDistance: 2000, avgHeartRate: 145, maxHeartRate: 150, sport: 'running',
    } as never)
    const bytes = enc.close()
    const r = await parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(r.distance_km).toBe(2)
    expect(r.duration_sec).toBe(600)
    expect(r.avg_hr).toBe(145)
    expect(r.splits).toHaveLength(2)
    expect(r.splits[0].duration_sec).toBe(300)
  })

  it('ข้อมูลน้อยเกินไป', () => {
    expect(() => summarize([{ t: 1 }], 'gpx')).toThrow()
  })
})

describe('สภาพอากาศ', () => {
  it('เลือกชั่วโมงใกล้เวลาวิ่ง', () => {
    const h = {
      time: ['2026-10-07T05:00', '2026-10-07T06:00', '2026-10-07T07:00'],
      temperature_2m: [26.1, 27.04, 28.5],
      relative_humidity_2m: [90, 85.6, 80],
    }
    expect(pickHour(h, '06:20')).toEqual({ temp_c: 27, humidity_pct: 86 })
    expect(pickHour(h, '06:40')).toEqual({ temp_c: 28.5, humidity_pct: 80 })
  })
})
