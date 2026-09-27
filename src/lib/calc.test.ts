import { describe, expect, it } from 'vitest'
import {
  adaptiveTdee, buildTimerSteps, canProgress, daysToTarget, describeSegment, epley1RM, fmtDuration, fmtPace,
  goalProgressPct, hrStatus, hrZonesBpm, linearRegression, movingAverage, paceSecPerKm, parseDuration,
  planDateOf, planDayNo, repeatSourceDayNo,
} from './calc'
import { addDays, daysBetween, dayOfWeek, fmtDate, todayIso, weekStart } from './date'

describe('pace', () => {
  it('คำนวณ pace วินาที/กม.', () => {
    expect(paceSecPerKm(10, 3000)).toBe(300)
    expect(paceSecPerKm(0, 3000)).toBeNull()
    expect(fmtPace(330)).toBe('5:30')
    expect(fmtPace(359.6)).toBe('6:00')
  })
  it('แปลงเวลา', () => {
    expect(parseDuration('32:10')).toBe(1930)
    expect(parseDuration('1:02:05')).toBe(3725)
    expect(parseDuration('45')).toBe(2700)
    expect(parseDuration('5:75')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(fmtDuration(3725)).toBe('1:02:05')
    expect(fmtDuration(1930)).toBe('32:10')
  })
})

describe('1RM', () => {
  it('Epley', () => {
    expect(epley1RM(100, 10)).toBe(133.3)
    expect(epley1RM(25, 10)).toBe(33.3)
    expect(epley1RM(100, 1)).toBe(100)
    expect(epley1RM(0, 10)).toBeNull()
  })
  it('แนะนำเพิ่มน้ำหนักเมื่อทำครบทุกเซ็ต', () => {
    const t = { sets: 3, reps: 10 }
    expect(canProgress([{ reps: 10 }, { reps: 10 }, { reps: 10 }], t)).toBe(true)
    expect(canProgress([{ reps: 10 }, { reps: 10 }, { reps: 9 }], t)).toBe(false)
    expect(canProgress([{ reps: 12 }, { reps: 12 }], t)).toBe(false)
    expect(canProgress([{ seconds: 45 }, { seconds: 40 }, { seconds: 41 }], { sets: 3, seconds: 40 })).toBe(true)
  })
})

describe('เป้าหมาย', () => {
  it('% ความคืบหน้า จำกัด 0-100', () => {
    expect(goalProgressPct(78.3, 77.15, 76)).toBe(50)
    expect(goalProgressPct(78.3, 79, 76)).toBe(0)
    expect(goalProgressPct(78.3, 75, 76)).toBe(100)
    expect(goalProgressPct(0, 3, 6)).toBe(50) // ทิศขึ้น
  })
  it('linear regression + คาดการณ์', () => {
    const pts = [0, 1, 2, 3, 4].map((x) => ({ x, y: 78 - 0.05 * x }))
    const r = linearRegression(pts)!
    expect(r.slope).toBeCloseTo(-0.05)
    expect(r.intercept).toBeCloseTo(78)
    expect(daysToTarget(77.8, 76, r.slope)).toBe(36)
    expect(daysToTarget(77.8, 76, 0.05)).toBeNull() // แนวโน้มผิดทาง
    expect(linearRegression([{ x: 1, y: 1 }])).toBeNull()
  })
  it('ค่าเฉลี่ยเคลื่อนที่ 7 วัน', () => {
    expect(movingAverage([1, 2, 3], 7)).toEqual([1, 1.5, 2])
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5])
  })
  it('Adaptive TDEE', () => {
    // กินเฉลี่ย 2300 น้ำหนักลด 0.5 กก. ใน 14 วัน → TDEE = 2300 + 0.5×7700/14 = 2575
    expect(adaptiveTdee(2300, -0.5, 14)).toBe(2575)
    expect(adaptiveTdee(2500, 0, 14)).toBe(2500)
    expect(adaptiveTdee(2500, 0, 0)).toBeNull()
  })
})

describe('แผนวิ่ง', () => {
  it('day_no = (date − start) + 1 − offset', () => {
    expect(planDayNo('2026-10-01', '2026-10-01')).toBe(1)
    expect(planDayNo('2026-10-22', '2026-10-01')).toBe(22)
    expect(planDayNo('2026-10-22', '2026-10-01', 1)).toBe(21)
    expect(planDayNo('2026-09-30', '2026-10-01')).toBe(0)
    expect(planDateOf(22, '2026-10-01')).toBe('2026-10-22')
    expect(planDateOf(21, '2026-10-01', 1)).toBe('2026-10-22')
  })
  it('ทำซ้ำ Week', () => {
    expect(repeatSourceDayNo(22, 4, 2)).toBe(8)
    expect(repeatSourceDayNo(29, 5, 3)).toBe(15)
    expect(repeatSourceDayNo(36, 6, 1)).toBe(1)
  })
  it('segment → ข้อความ', () => {
    expect(describeSegment({ repeat: 20, work_m: 100, hr_min_pct: 85, hr_max_pct: 90, recover_m: 100, recover_type: 'jog' }))
      .toBe('20 × วิ่ง 100 ม. @ 85-90% MaxHR, จ็อก 100 ม.')
    expect(describeSegment({ repeat: 1, work_km: 8, work_km_max: 12, hr_min_pct: 60, hr_max_pct: 75 }))
      .toBe('วิ่ง 8-12 กม. @ 60-75% MaxHR')
    expect(describeSegment({ repeat: 1, work_sec: 1800, work_sec_max: 2700, zone: '2', hr_min_pct: 60, hr_max_pct: 70 }))
      .toBe('วิ่ง 30-45 นาที @ 60-70% MaxHR (Zone 2)')
  })
  it('interval timer steps', () => {
    const steps = buildTimerSteps([{ repeat: 3, work_sec: 60, recover_sec: 120, recover_type: 'walk' }])
    expect(steps.map((s) => `${s.kind}:${s.sec}`)).toEqual(['work:60', 'recover:120', 'work:60', 'recover:120', 'work:60'])
    const multi = buildTimerSteps([
      { repeat: 2, work_m: 150, rest_after_sec: 180 },
      { repeat: 1, work_km: 5 },
    ])
    expect(multi.map((s) => `${s.kind}:${s.sec ?? s.meters}`)).toEqual(['work:150', 'work:150', 'rest:180', 'work:5000'])
    const range = buildTimerSteps([{ repeat: 40, repeat_max: 45, work_sec: 30, recover_sec: 30 }], 'max')
    expect(range.filter((s) => s.kind === 'work')).toHaveLength(45)
  })
})

describe('HR', () => {
  it('zone เป็น bpm จาก MaxHR 186', () => {
    const z = hrZonesBpm(186)
    expect(z[1]).toMatchObject({ zone: 2, minBpm: 112, maxBpm: 130 })
  })
  it('ต่ำไป / อยู่ในช่วง / สูงไป', () => {
    expect(hrStatus(120, 186, 60, 70)).toBe('in')
    expect(hrStatus(100, 186, 60, 70)).toBe('low')
    expect(hrStatus(150, 186, 60, 70)).toBe('high')
  })
})

describe('วันที่ (Asia/Bangkok)', () => {
  it('วันนี้ตามเวลาไทย', () => {
    // 2026-09-27 18:30 UTC = 2026-09-28 01:30 ที่กรุงเทพ
    expect(todayIso(new Date('2026-09-27T18:30:00Z'))).toBe('2026-09-28')
  })
  it('รูปแบบและการบวกวัน', () => {
    expect(fmtDate('2026-09-27')).toBe('27/09/2026')
    expect(addDays('2026-09-28', 56)).toBe('2026-11-23')
    expect(daysBetween('2026-09-28', '2026-11-23')).toBe(56)
    expect(dayOfWeek('2026-09-27')).toBe(0)
    expect(weekStart('2026-09-27')).toBe('2026-09-21')
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
  })
})
