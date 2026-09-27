// สร้าง supabase/seed_run_plans.json จากตารางวิ่ง FASTBULL RUN (ถอดจากรูป)
// รัน: npm run plans:build   (แล้วตามด้วย npm run seed:build เพื่ออัปเดต seed.sql)
//
// ทุกวันเก็บ description = ข้อความต้นฉบับ และแยก segments ให้มากที่สุด
// วันที่อ่านไม่ชัด/ตีความได้หลายแบบ ใส่ note = "ตรวจสอบ" + เหตุผลใน review_reason
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Zone (%MaxHR)
const ZONE = { 1: [50, 60], 2: [60, 70], 3: [70, 80], 4: [80, 90], 5: [90, 100] }
const zoneHr = (z) => {
  const [a, b = a] = String(z).split('-').map(Number)
  return { zone: String(z), hr_min_pct: ZONE[a][0], hr_max_pct: ZONE[b][1] }
}
const hrPct = (a, b = a) => ({ hr_min_pct: Math.min(a, b), hr_max_pct: Math.max(a, b) })

/** สร้าง segment — ใส่เฉพาะ key ที่มีค่า */
function seg(o) {
  const s = {
    repeat: o.n ?? 1,
    repeat_max: o.nMax,
    work_sec: o.sec,
    work_sec_max: o.secMax,
    work_m: o.m,
    work_m_max: o.mMax,
    work_km: o.km,
    work_km_max: o.kmMax,
    work_type: o.type ?? 'run',
    ...(o.zone ? zoneHr(o.zone) : {}),
    ...(o.hr ? hrPct(...o.hr) : {}),
    recover_sec: o.rsec,
    recover_sec_max: o.rsecMax,
    recover_m: o.rm,
    recover_type: o.rtype ?? (o.rsec || o.rm ? 'rest' : undefined),
    rest_after_sec: o.after,
    label: o.label,
  }
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined))
}

const range = (a, b) => (b && b !== a ? `${a}-${b}` : `${a}`)

// ---- ชนิดวัน -------------------------------------------------------------
const rest = (title = 'พัก') => ({ workout_type: 'rest', title, segments: [] })
const ar = (title = 'Active recovery') => ({ workout_type: 'active_recovery', title, segments: [] })
const weights = (title = 'บอดี้เวท') => ({ workout_type: 'weights', title, segments: [] })

const easyKm = (km, kmMax, hr, o = {}) => ({
  workout_type: o.type ?? 'easy',
  title: `${o.label ?? 'Easy'} ${range(km, kmMax)} กม.`,
  segments: [seg({ km, kmMax, hr, zone: o.zone })],
})
const longKm = (km, kmMax, hr, o = {}) => easyKm(km, kmMax, hr, { ...o, type: 'long', label: 'Long run' })
const easyMin = (min, minMax, o = {}) => ({
  workout_type: o.type ?? 'easy',
  title: `${o.label ?? 'Easy'} ${range(min, minMax)} นาที`,
  segments: [seg({ sec: min * 60, secMax: minMax ? minMax * 60 : undefined, zone: o.zone, hr: o.hr })],
})
const longMin = (min, minMax, o = {}) => easyMin(min, minMax, { ...o, type: 'long', label: 'Long run' })

/** วิ่งสลับเดิน (5K begin) */
const walkRun = (runSec, walkSec, n, nMax, o = {}) => ({
  workout_type: 'walk_run',
  title: `วิ่ง ${fmtDur(runSec)} / เดิน ${fmtDur(walkSec)} × ${range(n, nMax)}`,
  segments: [
    ...(o.pre ? [seg({ type: 'fast_walk', label: o.pre })] : []),
    seg({ n, nMax, sec: runSec, rsec: walkSec, rtype: o.walk ?? 'walk' }),
  ],
})
function fmtDur(sec) {
  if (sec < 60) return `${sec} วิ`
  const m = Math.floor(sec / 60), s = sec % 60
  return s ? `${m}:${String(s).padStart(2, '0')} นาที` : `${m} นาที`
}

/** interval ทั่วไป */
const reps = (type, title, o) => ({ workout_type: type, title, segments: [seg(o)] })
const multi = (type, title, segments) => ({ workout_type: type, title, segments })

// ---- ตัวช่วยประกอบวัน ------------------------------------------------------
function build(plan, defs) {
  const days = []
  for (const [range_, text, def, extra = {}] of defs) {
    const [a, b = a] = String(range_).split('-').map(Number)
    for (let n = a; n <= b; n++) {
      const d = typeof def === 'function' ? def(n) : def
      days.push({
        day_no: n,
        week_no: Math.floor((n - 1) / 7) + 1,
        workout_type: d.workout_type,
        title: d.title,
        description: text,
        repeat_of_week: extra.repeat ?? null,
        add_strides: Boolean(extra.strides),
        add_weights: Boolean(extra.w),
        segments: d.segments,
        note: extra.review ? 'ตรวจสอบ' : (extra.note ?? null),
        ...(extra.review ? { review_reason: extra.review } : {}),
      })
    }
  }
  days.sort((x, y) => x.day_no - y.day_no)
  const missing = []
  for (let n = 1; n <= plan.total_days; n++) if (!days.find((d) => d.day_no === n)) missing.push(n)
  const dup = days.filter((d, i) => days.findIndex((x) => x.day_no === d.day_no) !== i).map((d) => d.day_no)
  if (missing.length || dup.length || days.length !== plan.total_days) {
    throw new Error(`${plan.slug}: missing ${missing} dup ${dup} count ${days.length}`)
  }
  return { ...plan, source: 'FASTBULL RUN', days }
}

/** วัน "ทำซ้ำ Week X" — คัดลอกชนิด/segments จากวันที่ตรงกันของสัปดาห์นั้น (ฐานข้อมูลจะ resolve ซ้ำอีกครั้ง) */
function resolveRepeats(plan) {
  for (const d of plan.days) {
    if (!d.repeat_of_week) continue
    const src = plan.days.find((x) => x.day_no === d.day_no - (d.week_no - d.repeat_of_week) * 7)
    d.workout_type = src.workout_type
    d.title = `ทำซ้ำ Week ${d.repeat_of_week}: ${src.title}`
    d.segments = []
  }
  return plan
}

const W = { w: true } // + บอดี้เวทหลังวิ่ง
const STRIDE_4_6 = seg({ n: 4, nMax: 6, m: 50, mMax: 80, type: 'run', label: 'Stride', rtype: 'walk' })

// =============================================================================
// 1) 5KM Begin (90 วัน)
// =============================================================================
const WALKDRILL = 'เดินเร็ว หรือ ฝึกดริล'
const fiveK = build(
  { slug: 'fastbull-5k-begin', name: '5KM Begin', level: 'begin', goal_distance_km: 5, total_days: 90,
    note: '5K ภายใน 45 นาที — มือใหม่เริ่มซ้อม' },
  [
    ['1-3', 'เดินเร็ว หรือ ฝึกดริล + วิ่ง 30 วินาที เดิน 30 วินาที 20 เซต', walkRun(30, 30, 20, null, { pre: WALKDRILL })],
    [4, 'พัก หรือ Active recovery ยืดเหยียด, โยคะ, จักรยาน', ar('พัก หรือ Active recovery (ยืดเหยียด/โยคะ/จักรยาน)')],
    ['5-6', 'เดินเร็ว หรือ ฝึกดริล + วิ่ง 30 วินาที เดิน 30 วินาที 20 เซต', walkRun(30, 30, 20, null, { pre: WALKDRILL })],
    [7, 'พัก หรือ Active recovery', ar('พัก หรือ Active recovery')],
    ['8-10', 'วิ่ง 30 วินาที เดินเร็ว 30 วินาที 30 เซต', walkRun(30, 30, 30, null, { walk: 'fast_walk' })],
    [11, 'พักสนิท', rest('พักสนิท')],
    ['12-14', 'วิ่ง 30 วินาที เดินเร็ว 30 วินาที 20 เซต', walkRun(30, 30, 20, null, { walk: 'fast_walk' })],
    [15, 'พัก หรือ Active recovery', ar('พัก หรือ Active recovery')],
    ['16-18', 'วิ่ง 30 วินาที เดินเร็ว 30 วินาที 30 เซต', walkRun(30, 30, 30, null, { walk: 'fast_walk' })],
    [19, 'พักสนิท', rest('พักสนิท')],
    ['20-22', 'วิ่ง 30 วินาที เดินเร็ว 30 วินาที 20 เซต', walkRun(30, 30, 20, null, { walk: 'fast_walk' })],
    [23, 'เวท', weights('เวท')],
    ['24-25', 'วิ่ง 30 วินาที เดินเร็ว 30 วินาที 20 เซต', walkRun(30, 30, 20, null, { walk: 'fast_walk' })],
    [26, 'เวท', weights('เวท')],
    [27, 'พักสนิท', rest('พักสนิท')],
    ['28-30', 'วิ่ง 30 วินาที เดินเร็ว 30 วินาที 40-45 เซต', walkRun(30, 30, 40, 45, { walk: 'fast_walk' })],

    [31, 'เวท', weights('เวท')],
    ['32-34', 'วิ่ง 40 วินาที เดินช้าๆ 20 วินาที 30 เซต', walkRun(40, 20, 30)],
    [35, 'เวท', weights('เวท')],
    [36, 'พักสนิท', rest('พักสนิท')],
    ['37-39', 'วิ่ง 40 วินาที เดินช้าๆ 20 วินาที 30 เซต', walkRun(40, 20, 30)],
    [40, 'เวท', weights('เวท')],
    ['41-43', 'วิ่ง 40 วินาที เดินช้า 20 วินาที 45 เซต', walkRun(40, 20, 45)],
    [44, 'เวท', weights('เวท')],
    [45, 'Active Recovery เน้นผ่อนคลาย ยืดเหยียด', ar('Active recovery เน้นผ่อนคลาย ยืดเหยียด')],
    ['46-48', 'วิ่ง 1 นาที เดิน 1 นาที 20 เซต', walkRun(60, 60, 20)],
    [49, 'เวท', weights('เวท')],
    [50, 'พัก หรือ Active recovery', ar('พัก หรือ Active recovery')],
    ['51-53', 'วิ่ง 1 นาที เดิน 1 นาที 20 เซต', walkRun(60, 60, 20)],
    [54, 'พักสนิท', rest('พักสนิท')],
    [55, 'วิ่ง 2 นาที เดิน 1 นาที 20 เซต', walkRun(120, 60, 20)],
    [56, 'วิ่ง 3 นาที เดิน 1:30 นาที 10 เซต', walkRun(180, 90, 10)],
    [57, 'วิ่ง 2 นาที เดิน 1:30 นาที 20 เซต', walkRun(120, 90, 20)],
    [58, 'เวท', weights('เวท')],
    [59, 'วิ่ง 3 นาที เดิน 1 นาที 10 เซต', walkRun(180, 60, 10)],
    [60, 'วิ่ง 2 นาที เดิน 30 วินาที 15 เซต', walkRun(120, 30, 15)],

    [61, 'พักสนิท', rest('พักสนิท')],
    [62, 'Active Recovery เน้นผ่อนคลาย ยืดเหยียด', ar('Active recovery เน้นผ่อนคลาย ยืดเหยียด')],
    [63, 'วิ่ง 5 นาที เดิน 2:30 นาที 6 เซต', walkRun(300, 150, 6)],
    [64, 'วิ่ง 3 นาที เดิน 1 นาที 10 เซต', walkRun(180, 60, 10)],
    [65, 'เวท + วิ่ง 5 นาที เดิน 2 นาที 6 เซต', walkRun(300, 120, 6), W],
    [66, 'พักสนิท', rest('พักสนิท')],
    [67, 'วิ่ง 8 นาที เดิน 2 นาที 3 เซต', walkRun(480, 120, 3)],
    [68, 'วิ่ง 2 นาที เดิน 1 นาที 10 เซต', walkRun(120, 60, 10)],
    [69, 'วิ่งต่อเนื่อง 15 นาที เดิน 2 นาที 3 เซต', walkRun(900, 120, 3)],
    [70, 'วิ่ง 2 นาที เดิน 1 นาที 10 เซต', walkRun(120, 60, 10)],
    [71, 'วิ่งต่อเนื่อง 20 นาที พัก 3 นาที 2 เซต',
      reps('walk_run', 'วิ่งต่อเนื่อง 20 นาที × 2 (พัก 3 นาที)', { n: 2, sec: 1200, rsec: 180, rtype: 'rest' })],
    [72, 'วิ่ง 1 นาที เดิน 1 นาที 15 เซต', walkRun(60, 60, 15)],
    [73, 'พักสนิท', rest('พักสนิท')],
    [74, 'วิ่ง 30 นาที ต่อเนื่อง', easyMin(30, null, { label: 'วิ่งต่อเนื่อง' })],
    [75, 'วิ่ง 1 นาที เดิน 1 นาที', walkRun(60, 60, 15),
      { review: 'รูปไม่ระบุจำนวนเซต — ใส่ไว้ 15 เซต (เท่ากับ D72/D85)' }],
    [76, 'วิ่ง 5 นาที เดิน 1 นาที 6-8 เซต', walkRun(300, 60, 6, 8)],
    [77, 'พักสนิท', rest('พักสนิท')],
    [78, 'วิ่ง 20-30 นาที ต่อเนื่อง หากไหว เพิ่มเป็น 2 เซต พักเดินเซตละ 3-5 นาที',
      reps('walk_run', 'วิ่งต่อเนื่อง 20-30 นาที × 1-2 (พักเดิน 3-5 นาที)',
        { n: 1, nMax: 2, sec: 1200, secMax: 1800, rsec: 180, rsecMax: 300, rtype: 'walk' })],
    [79, 'วิ่ง 2 นาที เดิน 1 นาที 10-15 เซต', walkRun(120, 60, 10, 15)],
    [80, 'วิ่ง 30 นาที ต่อเนื่อง', easyMin(30, null, { label: 'วิ่งต่อเนื่อง' })],
    [81, 'วิ่ง 2 นาที เดิน 1 นาที 10-15 เซต', walkRun(120, 60, 10, 15)],
    [82, 'วิ่ง 20 นาที พักเดิน 3 นาที + วิ่ง 10 นาที พักเดิน 3 นาที',
      multi('walk_run', 'วิ่ง 20 นาที + 10 นาที (พักเดิน 3 นาที)', [
        seg({ sec: 1200, rsec: 180, rtype: 'walk' }),
        seg({ sec: 600, rsec: 180, rtype: 'walk' }),
      ])],
    [83, 'พักสนิท', rest('พักสนิท')],
    [84, 'วิ่ง 30-45 นาที ต่อเนื่อง', easyMin(30, 45, { label: 'วิ่งต่อเนื่อง' })],
    [85, 'วิ่ง 1 นาที เดิน 1 นาที 15 เซต', walkRun(60, 60, 15)],
    ['86-87', 'วิ่ง 5km ต่อเนื่อง', easyKm(5, null, null, { label: 'วิ่งต่อเนื่อง' })],
    [88, 'วิ่ง 2 นาที เดิน 1 นาที 10-15 เซต', walkRun(120, 60, 10, 15)],
    [89, 'พักสนิท', rest('พักสนิท')],
    [90, 'วิ่ง 30-45 นาที ต่อเนื่อง', easyMin(30, 45, { label: 'วิ่งต่อเนื่อง' })],
  ],
)

// =============================================================================
// 2) 10KM Begin (90 วัน)
// =============================================================================
const E30 = easyMin(30, null, { zone: 2 })
const E45 = easyMin(45, null, { zone: 2 })
const IV_1_1 = reps('interval', 'Interval วิ่ง 1 นาที / เดิน 1 นาที × 20',
  { n: 20, sec: 60, hr: [80, 85], rsec: 60, rtype: 'walk', label: 'ฟีลลิ่ง 80-85% MaxHR' })
const IV_30x100 = reps('interval', 'วิ่ง 30×100 ม. จ็อก 100', { n: 30, m: 100, hr: [80, 85], rm: 100, rtype: 'jog' })
const IV_12x200 = reps('interval', 'Interval 12×200 ม. พัก 1:30', { n: 12, m: 200, hr: [85, 90], rsec: 90, label: 'ฟีลลิ่ง 85-90% MaxHR' })
const IV_8x400 = reps('interval', 'Interval 8×400 ม. พัก 3 นาที', { n: 8, m: 400, hr: [90, 95], rsec: 180 })
const L60 = (z) => longMin(60, null, { zone: z })

const tenKBegin = build(
  { slug: 'fastbull-10k-begin', name: '10KM Begin', level: 'begin', goal_distance_km: 10, total_days: 90,
    note: '10K 1:00:00 - 1:30:00 ชม. — มือใหม่เริ่มซ้อม' },
  [
    ['1-4', 'Easy run 30-45 min Zone 2', easyMin(30, 45, { zone: 2 })],
    [5, 'Easy run 1 ชั่วโมง Zone 2', easyMin(60, null, { zone: 2 })],
    [6, 'Easy run 45 นาที Zone 2', E45],
    [7, 'พักสนิท', rest('พักสนิท')],
    [8, 'Easy run 30 นาที Zone 2', E30],
    [9, 'Easy run 45 นาที Zone 2-3', easyMin(45, null, { zone: '2-3' })],
    [10, 'Interval 20x วิ่ง 1 นาที เดิน 1 นาที (ฟีลลิ่ง 80-85%Maxhr)', IV_1_1],
    ['11-12', 'Easy run 45 นาที Zone 2', E45],
    [13, 'พักสนิท', rest('พักสนิท')],
    [14, 'Long run 1 ชั่วโมง Zone 2', L60(2)],
    [15, 'Easy run 30 นาที Zone 2', E30],
    [16, 'Easy run 45 นาที Zone 2', E45],
    [17, 'Interval 20x วิ่ง 1 นาที เดิน 1 นาที (ฟีลลิ่ง 80-85%Maxhr)', IV_1_1],
    [18, 'Easy run 45 นาที Zone 2', E45],
    [19, 'วิ่ง 30x100 จ็อก 100 (80-85% maxhr)', IV_30x100],
    [20, 'พักสนิท', rest('พักสนิท')],
    [21, 'Long run 1 ชั่วโมง Zone 2-3', L60('2-3')],
    [22, 'Easy run 30 นาที Zone 2', E30],
    [23, 'Easy run 45 นาที Zone 2', E45],
    [24, 'Interval 12x200m (ฟีลลิ่ง 85-90%Maxhr) พัก 1.30 นาที', IV_12x200],
    [25, 'Easy run 45 นาที Zone 2', E45],
    [26, 'Interval 8x400m 90-95% maxhr พัก 3 นาที', IV_8x400],
    [27, 'พักสนิท', rest('พักสนิท')],
    [28, 'Long run 1 ชั่วโมง Zone 2-3', L60('2-3')],
    [29, 'Easy run 30 นาที Zone 2', E30],
    [30, 'Easy run 45 นาที Zone 2', E45],

    [31, 'Interval 20x วิ่ง 1 นาที เดิน 1 นาที (ฟีลลิ่ง 80-85%Maxhr)', IV_1_1],
    [32, 'Easy run 45 นาที Zone 2', E45],
    [33, 'วิ่ง 30x100 จ็อก 100 (80-85% maxhr)', IV_30x100],
    [34, 'พักสนิท', rest('พักสนิท')],
    [35, 'Long run 1 ชั่วโมง Zone 2-3', L60('2-3')],
    [36, 'Easy run 30 นาที Zone 2', E30],
    [37, 'Easy run 45 นาที Zone 2', E45],
    [38, 'Interval 12x200m (ฟีลลิ่ง 85-90%Maxhr) พัก 1.30 นาที', IV_12x200],
    [39, 'Easy run 45 นาที Zone 2', E45],
    [40, 'Interval 8x400m 90-95% maxhr พัก 3 นาที', IV_8x400],
    [41, 'พักสนิท', rest('พักสนิท')],
    [42, 'Long run 1 ชั่วโมง Zone 2-3', L60('2-3')],
    [43, 'Easy run 30 นาที Zone 2', E30],
    [44, 'Easy run 45 นาที Zone 2', E45],
    [45, 'Interval 20x วิ่ง 1 นาที เดิน 1 นาที (ฟีลลิ่ง 80-85%Maxhr)', IV_1_1],
    [46, 'Easy run 45 นาที Zone 2', E45],
    [47, 'วิ่ง 30x100 จ็อก 100 (80-85% maxhr)', IV_30x100],
    [48, 'พักสนิท', rest('พักสนิท')],
    [49, 'Long run 1 ชั่วโมง Zone 2-3', L60('2-3')],
    [50, 'Easy run 30 นาที Zone 2', E30],
    [51, 'วิ่ง tempo 15 นาที x 2 พัก 3 นาที (85-90%maxhr)',
      reps('tempo', 'Tempo 15 นาที × 2 พัก 3 นาที', { n: 2, sec: 900, hr: [85, 90], rsec: 180 })],
    [52, 'Easy run 30 นาที Zone 2', E30],
    [53, 'Easy run 45 นาที Zone 2', E45],
    [54, 'วิ่ง 15x300m 80-90% Maxhr พักเดิน 1.30 นาที',
      reps('interval', 'Interval 15×300 ม. พักเดิน 1:30', { n: 15, m: 300, hr: [80, 90], rsec: 90, rtype: 'walk' })],
    [55, 'พักสนิท', rest('พักสนิท')],
    [56, 'Long run 10-12Km Zone 2-3', longKm(10, 12, null, { zone: '2-3' })],
    [57, 'วิ่ง 30 นาที Zone 2', E30],
    [58, 'วิ่ง 3x150m 90-95% พัก 3 นาที ต่อด้วย วิ่ง 5k 80-85% พัก 3 นาที วิ่ง 2x150 90-95% พัก 2 นาที',
      multi('interval', '3×150 ม. + 5K + 2×150 ม.', [
        seg({ n: 3, m: 150, hr: [90, 95], after: 180 }),
        seg({ km: 5, hr: [80, 85], after: 180 }),
        seg({ n: 2, m: 150, hr: [90, 95], rsec: 120 }),
      ]),
      { review: 'ตัวอักษรเล็กมาก และไม่ระบุการพักระหว่างเที่ยว 150 ม. ชุดแรก — ตีความว่า พัก 3 นาทีหลังจบชุด' }],
    [59, 'Easy run 40 นาที Zone 2', easyMin(40, null, { zone: 2 })],
    [60, 'Easy run 45 นาที Zone 2', E45],

    [61, '5km 80-85%', easyKm(5, null, [80, 85], { type: 'tempo', label: 'Tempo' })],
    [62, 'พัก', rest()],
    [63, 'Long run 10-12Km Zone 2-3', longKm(10, 12, null, { zone: '2-3' })],
    [64, 'Easy run 30 Zone 2', E30, { review: 'รูปเขียน "Easy run 30" ไม่มีหน่วย — ตีความเป็น 30 นาที' }],
    [65, '6k 80-90% maxhr', easyKm(6, null, [80, 90], { type: 'tempo', label: 'Tempo' })],
    [66, 'Easy 45 นาที Zone 2', E45],
    [67, '12x200m 90-95% พัก 2 นาที', reps('interval', 'Interval 12×200 ม. พัก 2 นาที', { n: 12, m: 200, hr: [90, 95], rsec: 120 })],
    [68, 'Easy 1 ชั่วโมง zone 2', easyMin(60, null, { zone: 2 })],
    [69, 'พัก', rest()],
    [70, '8km 80-90%', easyKm(8, null, [80, 90], { type: 'tempo', label: 'Tempo' })],
    [71, 'Easy 45 นาที Zone 2', E45],
    [72, 'Long run 12 Zone 2-3', longKm(12, null, null, { zone: '2-3' }), { review: 'รูปเขียน "Long run 12" ไม่มีหน่วย — ตีความเป็น 12 กม.' }],
    [73, 'Easy 30 min zone 2', E30],
    [74, '12x300m 85-95% maxhr พัก 2 นาที เดิน',
      reps('interval', 'Interval 12×300 ม. พักเดิน 2 นาที', { n: 12, m: 300, hr: [85, 95], rsec: 120, rtype: 'walk' })],
    [75, 'Easy 45 นาที Zone 2', E45],
    [76, 'พัก', rest()],
    [77, '6km 85-90% Tempo T.Pace', easyKm(6, null, [85, 90], { type: 'tempo', label: 'Tempo (T.Pace)' })],
    [78, 'Easy 30 นาที zone2', E30],
    [79, '8x1k 85-90% พัก เดิน 2 นาที', reps('interval', 'Interval 8×1 กม. พักเดิน 2 นาที', { n: 8, km: 1, hr: [85, 90], rsec: 120, rtype: 'walk' })],
    [80, 'Easy 45 นาที Zone 2', E45],
    [81, '12x150m 90-95% maxhr พัก 2 นาที', reps('interval', 'Interval 12×150 ม. พัก 2 นาที', { n: 12, m: 150, hr: [90, 95], rsec: 120 })],
    [82, 'Easy 45 นาที Zone 2', E45],
    [83, 'พัก', rest()],
    [84, 'Long run 10-12Km Zone 2-3', longKm(10, 12, null, { zone: '2-3' })],
    [85, 'Vo2Max 8x300 90-95% พัก จ็อก 200 m 3 นาที',
      reps('vo2max', 'VO2max 8×300 ม. จ็อก 200 ม./3 นาที', { n: 8, m: 300, hr: [90, 95], rm: 200, rsec: 180, rtype: 'jog' })],
    [86, 'Easy Zone 2 40 min', easyMin(40, null, { zone: 2 })],
    [87, 'Easy 30 min + stride 7-10 วินาที 6 เที่ยว พัก 2 นาที เดิน',
      multi('easy', 'Easy 30 นาที + Stride 6 เที่ยว', [
        seg({ sec: 1800, zone: 2 }),
        seg({ n: 6, sec: 7, secMax: 10, rsec: 120, rtype: 'walk', label: 'Stride' }),
      ]), { strides: true }],
    ['88-89', 'พัก', rest()],
    [90, 'Test/Race', reps('race_test', 'Test/Race 10 กม.', { km: 10 })],
  ],
)

// =============================================================================
// 3) 10KM Performance (90 วัน)
// =============================================================================
const E812 = easyKm(8, 12, [65, 75])
const REC6 = easyKm(6, null, [65, 75], { label: 'Easy Recovery' })
const tenKPerf = build(
  { slug: 'fastbull-10k-performance', name: '10KM Performance', level: 'performance', goal_distance_km: 10, total_days: 90,
    note: '10K ต่ำกว่า 50 นาที — กลุ่มต้องการทำเวลา' },
  [
    [1, 'Easy 8-12km 65-75% Maxhr บอดี้ เวท เพิ่ม', E812, W],
    ['2-7', 'Easy 8-12km 65-75% Maxhr', E812],
    [8, 'Easy 6 km Recovery 65-75% Maxhr บอดี้ เวท หลังวิ่ง', REC6, W],
    [9, 'Easy 8km 75% Maxhr', easyKm(8, null, [75])],
    [10, 'Interval 6x3นาที 85-90%Maxhr พัก 1.30นาที', reps('interval', 'Interval 6×3 นาที พัก 1:30', { n: 6, sec: 180, hr: [85, 90], rsec: 90 })],
    [11, '6km Recovery 60-65% Maxhr', easyKm(6, null, [60, 65], { label: 'Recovery' })],
    [12, 'Interval 12x200m 85-90%Maxhr พักเดิน 2 นาที', reps('interval', 'Interval 12×200 ม. พักเดิน 2 นาที', { n: 12, m: 200, hr: [85, 90], rsec: 120, rtype: 'walk' })],
    [13, 'Easy 8km Recovery 65-75%Maxhr', easyKm(8, null, [65, 75], { label: 'Easy Recovery' })],
    [14, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [15, 'Easy 8km 65-75% Maxhr', easyKm(8, null, [65, 75])],
    [16, 'Easy 12Km 75-80% Maxhr', easyKm(12, null, [75, 80])],
    [17, 'Easy 45นาที + เวท', easyMin(45), W],
    [18, 'Easy 12km 75-85%Maxhr', easyKm(12, null, [75, 85])],
    [19, 'Interval 15x200m 80-90% Maxhr พัก 2 นาที', reps('interval', 'Interval 15×200 ม. พัก 2 นาที', { n: 15, m: 200, hr: [80, 90], rsec: 120 })],
    [20, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [21, 'Longrun 15km 65-75%Maxhr', longKm(15, null, [65, 75])],
    [22, 'Easy 6 km Recovery 65-75% Maxhr', REC6],
    [23, 'Easy 8km 75% Maxhr', easyKm(8, null, [75])],
    [24, 'Interval 6x3นาที 85-90%Maxhr พัก 1.30นาที', reps('interval', 'Interval 6×3 นาที พัก 1:30', { n: 6, sec: 180, hr: [85, 90], rsec: 90 })],
    [25, '6km Recovery 60-65% Maxhr', easyKm(6, null, [60, 65], { label: 'Recovery' })],
    [26, 'Interval 12x200m 85-90%Maxhr บอดี้ เวท หลังวิ่ง', reps('interval', 'Interval 12×200 ม.', { n: 12, m: 200, hr: [85, 90] }), W],
    [27, 'Easy 8km Recovery 65-75%Maxhr', easyKm(8, null, [65, 75], { label: 'Easy Recovery' })],
    [28, 'พัก', rest()],
    [29, 'Easy 8km 65-75% Maxhr', easyKm(8, null, [65, 75])],
    [30, '5x1k Pace = 80-85% Maxhr หรือ Threshold', reps('threshold', 'Threshold 5×1 กม.', { n: 5, km: 1, hr: [80, 85] })],

    [31, 'Easy 45นาที + เวท', easyMin(45), W],
    [32, 'บอดี้ เวท หลังวิ่ง', weights('บอดี้เวท'),
      { w: true, review: 'รูปมีแค่ "บอดี้ เวท หลังวิ่ง" ไม่ระบุการวิ่ง — ตั้งเป็นวันบอดี้เวท' }],
    [33, 'Interval 15x200m 80-90% Maxhr พัก 2 นาที', reps('interval', 'Interval 15×200 ม. พัก 2 นาที', { n: 15, m: 200, hr: [80, 90], rsec: 120 })],
    [34, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [35, 'Longrun 15ๆ 65-75%Maxhr', longKm(15, null, [65, 75]), { review: 'รูปเขียน "15ๆ" — ตีความเป็น 15 กม.' }],
    [36, 'Easy 6 km 65-75% Maxhr', easyKm(6, null, [65, 75])],
    [37, '6x1k 85-90%Maxhr พัก 2 นาที', reps('interval', 'Interval 6×1 กม. พัก 2 นาที', { n: 6, km: 1, hr: [85, 90], rsec: 120 })],
    [38, 'Easy 12km 65-75% Maxhr บอดี้ เวท หลังวิ่ง', easyKm(12, null, [65, 75]), W],
    [39, 'Easy 8 km 65-75% Maxhr', easyKm(8, null, [65, 75])],
    [40, 'Interval 15x400m 90-95% Maxhr พัก 1.30 นาที', reps('interval', 'Interval 15×400 ม. พัก 1:30', { n: 15, m: 400, hr: [90, 95], rsec: 90 })],
    [41, 'พัก', rest()],
    [42, 'Long run 15km Easy', longKm(15)],
    [43, 'Easy 6km 65-75%Maxhr', easyKm(6, null, [65, 75])],
    [44, 'Interval 3x(1k,600m,400m,400m,600m,1000m)90-95% Maxhr พักเดิน 100 จ็อก 100 บอดี้ เวท หลังวิ่ง',
      multi('interval', 'Interval 3×(1k-600-400-400-600-1k)',
        Array.from({ length: 3 }, () => [1000, 600, 400, 400, 600, 1000]).flat().map((m) =>
          seg({ m, hr: [90, 95], rm: 200, rtype: 'walk', label: 'พักเดิน 100 + จ็อก 100' }))),
      { w: true, review: 'ตัวอักษรเล็ก — ตีความเป็น 3 รอบของ 1000/600/400/400/600/1000 ม. พักเดิน 100 ม. + จ็อก 100 ม.' }],
    [45, 'Easy 12km 65-75% Maxhr', easyKm(12, null, [65, 75])],
    [46, 'Easy 8km 65-75% Maxhr', easyKm(8, null, [65, 75])],
    [47, 'Vo2Max 8x400m 90-95% Maxhr พักจ็อก 2 นาที', reps('vo2max', 'VO2max 8×400 ม. จ็อก 2 นาที', { n: 8, m: 400, hr: [90, 95], rsec: 120, rtype: 'jog' })],
    [48, 'พัก', rest()],
    [49, 'Long run 15km Easy', longKm(15)],
    [50, 'Easy 6km 65-75%Maxhr บอดี้ เวท หลังวิ่ง', easyKm(6, null, [65, 75]), W],
    [51, 'Interval 3x200m 95-100% Maxhr พัก 3 นาที /พัก 5 นาที/ +5x1 85-90% Maxhr พัก 2 นาที + 3x200m 95-100% 95-100% Maxhr พัก 3 นาที',
      multi('interval', '3×200 + 5×1 กม. + 3×200', [
        seg({ n: 3, m: 200, hr: [95, 100], rsec: 180, after: 300 }),
        seg({ n: 5, km: 1, hr: [85, 90], rsec: 120, after: 300 }),
        seg({ n: 3, m: 200, hr: [95, 100], rsec: 180 }),
      ]),
      { review: 'ตัวอักษรเล็กมาก — "5x1" ตีความเป็น 5×1 กม.; พัก 5 นาทีระหว่างชุด' }],
    [52, 'Easy 12km 65-75% Maxhr', easyKm(12, null, [65, 75])],
    [53, 'Easy 8km Zone2', easyKm(8, null, null, { zone: 2 })],
    [54, 'T.Pace 20 min Maxhr 80-90%', easyMin(20, null, { type: 'threshold', label: 'T.Pace', hr: [80, 90] })],
    [55, 'พัก', rest()],
    [56, 'Long run 15km Easy บอดี้ เวท หลังวิ่ง', longKm(15), W],
    [57, 'Easy 6km 65-75%Maxhr', easyKm(6, null, [65, 75])],
    [58, 'Easy 15x400m 90-95% Maxhr พัก 1.15', reps('interval', 'Interval 15×400 ม. พัก 1:15', { n: 15, m: 400, hr: [90, 95], rsec: 75 }),
      { review: 'รูปขึ้นต้นว่า "Easy" แต่เป็น 15×400 ม. 90-95% — ตั้งเป็น interval, พัก 1.15 = 1:15 นาที' }],
    [59, 'Easy 12km Maxhr 65-75%', easyKm(12, null, [65, 75])],
    [60, 'Easy 8km 65-70% Maxhr', easyKm(8, null, [65, 70])],

    [61, 'Interval 8x1k 85-90%Maxhr พัก 2 นาที', reps('interval', 'Interval 8×1 กม. พัก 2 นาที', { n: 8, km: 1, hr: [85, 90], rsec: 120 })],
    [62, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [63, 'Long run 15km Easy Zone3', longKm(15, null, null, { zone: 3 })],
    [64, 'Easy 6km 65-75%Maxhr', easyKm(6, null, [65, 75])],
    [65, 'Tempo 8km 85-90% Maxhr', easyKm(8, null, [85, 90], { type: 'tempo', label: 'Tempo' })],
    [66, 'Easy 12km Zone2', easyKm(12, null, null, { zone: 2 })],
    [67, 'Easy 8km Zone2', easyKm(8, null, null, { zone: 2 })],
    [68, 'Interval 15x300m 90-95% พักเดิน 2 นาที บอดี้ เวท หลังวิ่ง',
      reps('interval', 'Interval 15×300 ม. พักเดิน 2 นาที', { n: 15, m: 300, hr: [90, 95], rsec: 120, rtype: 'walk' }), W],
    [69, 'พัก', rest()],
    [70, 'Long run 15km Zone3', longKm(15, null, null, { zone: 3 })],
    [71, 'Easy 6km Zone2', easyKm(6, null, null, { zone: 2 })],
    [72, 'T.pace 3x1k 90-95% Maxhr พัก 2 นาที + 3K 80-90% พัก 3 นาที + 2x1k 90-95% Maxhr พัก 2 นาที',
      multi('threshold', 'T.Pace 3×1k + 3K + 2×1k', [
        seg({ n: 3, km: 1, hr: [90, 95], rsec: 120 }),
        seg({ km: 3, hr: [80, 90], after: 180 }),
        seg({ n: 2, km: 1, hr: [90, 95], rsec: 120 }),
      ])],
    [73, 'Easy 8 km Zone 2', easyKm(8, null, null, { zone: 2 })],
    [74, 'Easy 8 km Zone 2 บอดี้ เวท หลังวิ่ง', easyKm(8, null, null, { zone: 2 }), W],
    [75, 'Interval 12x400m 90-95% Maxhr พักจ็อก 3 นาที ช้าๆ',
      reps('interval', 'Interval 12×400 ม. จ็อกช้า 3 นาที', { n: 12, m: 400, hr: [90, 95], rsec: 180, rtype: 'jog' })],
    [76, 'พัก', rest()],
    [77, 'Long run 15km Zone 3', longKm(15, null, null, { zone: 3 })],
    [78, 'Easy 6 zone2', easyKm(6, null, null, { zone: 2 }), { review: 'รูปเขียน "Easy 6" ไม่มีหน่วย — ตีความเป็น 6 กม.' }],
    [79, 'Interval 5x1.6k 90-95% Maxhr พัก 2 นาที', reps('interval', 'Interval 5×1.6 กม. พัก 2 นาที', { n: 5, km: 1.6, hr: [90, 95], rsec: 120 })],
    [80, 'Easy 12k Zone 2 บอดี้ เวท หลังวิ่ง', easyKm(12, null, null, { zone: 2 }), W],
    [81, 'Easy 8K Zone 2', easyKm(8, null, null, { zone: 2 })],
    [82, 'T.Pace 8K 85-90%', easyKm(8, null, [85, 90], { type: 'threshold', label: 'T.Pace' })],
    [83, 'พัก', rest()],
    [84, 'Long run 12-15Km', longKm(12, 15)],
    [85, 'Easy 6km Zone2', easyKm(6, null, null, { zone: 2 })],
    [86, 'Vo2Max 8x400m 90-95% Maxhr พักจ็อก 3 นาที บอดี้ เวท หลังวิ่ง',
      reps('vo2max', 'VO2max 8×400 ม. จ็อก 3 นาที', { n: 8, m: 400, hr: [90, 95], rsec: 180, rtype: 'jog' }), W],
    [87, 'Easy Recovery 6km Zone2', easyKm(6, null, null, { zone: 2, label: 'Easy Recovery' })],
    [88, 'Easy 40 นาที + Stride 7-10วิ 6 เที่ยวพักเดิน 2 นาที หรือ พัก',
      multi('easy', 'Easy 40 นาที + Stride 6 เที่ยว (หรือพัก)', [
        seg({ sec: 2400, zone: 2 }),
        seg({ n: 6, sec: 7, secMax: 10, rsec: 120, rtype: 'walk', label: 'Stride' }),
      ]), { strides: true, note: 'หรือพัก' }],
    [89, 'พัก', rest()],
    [90, 'Test/Race', reps('race_test', 'Test/Race 10 กม.', { km: 10 })],
  ],
)

// =============================================================================
// 4) 21KM Begin (90 วัน)
// =============================================================================
const IV20x100 = reps('interval', 'Interval 20×100 ม. จ็อก 100 ม.', { n: 20, m: 100, hr: [85, 90], rm: 100, rtype: 'jog' })
const IV20x200 = reps('interval', 'Interval 20×200 ม. จ็อก 100 ม.', { n: 20, m: 200, hr: [85, 90], rm: 100, rtype: 'jog' })
const IV30x200 = reps('interval', 'Interval 30×200 ม. จ็อก 100 ม.', { n: 30, m: 200, hr: [85, 90], rm: 100, rtype: 'jog' })
const IV8x5 = reps('interval', 'Interval 8×5 นาที พัก 3 นาที', { n: 8, sec: 300, hr: [80, 85], rsec: 180 })
const B812 = easyKm(8, 12, [60, 75])
const twentyOneBegin = resolveRepeats(build(
  { slug: 'fastbull-21k-begin', name: '21KM Begin', level: 'begin', goal_distance_km: 21.1, total_days: 90,
    note: '21K มากกว่า 2:00:00 ชม. — มือใหม่เริ่มซ้อม' },
  [
    ['1-5', 'Easy 8-12km 60-75% Maxhr', B812],
    [6, 'Easy 8-12km 60-75% Maxhr บอดี้ เวท หลังวิ่ง', B812, W],
    [7, 'พัก', rest()],
    [8, 'Easy 8 km', easyKm(8)],
    [9, 'Easy 12km', easyKm(12)],
    [10, 'Easy 8 km', easyKm(8)],
    [11, 'Interval 20x100m จ็อก 100m 85-90% Maxhr', IV20x100],
    [12, 'Easy 8 km 60-65% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [60, 65]), W],
    [13, 'พัก', rest()],
    [14, 'Easy 12-15km 65-75% Maxhr', easyKm(12, 15, [65, 75])],
    [15, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [16, 'Interval 20x100m จ็อก 100m 85-90% Maxhr', IV20x100],
    [17, 'Easy 8 km 65-70%', easyKm(8, null, [65, 70])],
    [18, 'Easy 8 km 65-70% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [65, 70]), W],
    [19, 'Interval 20x200m จ็อก 100m 85-90% Maxhr', IV20x200],
    [20, 'พัก', rest()],
    [21, 'Long run 12-15km 60-75%Maxhr', longKm(12, 15, [60, 75])],
    [22, 'ทำซ้ำ Week 2', null, { repeat: 2 }],
    [23, 'Easy 12km', easyKm(12)],
    [24, 'Easy 8 km บอดี้ เวท หลังวิ่ง', easyKm(8), W],
    [25, 'Interval 20x100m จ็อก 100m 85-90% Maxhr', IV20x100],
    [26, 'Easy 8 km 60-65% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [60, 65]), W],
    [27, 'พัก', rest()],
    [28, 'Easy 12-15km 65-75% Maxhr', easyKm(12, 15, [65, 75])],
    [29, 'ทำซ้ำ Week 3', null, { repeat: 3 }],
    [30, 'บอดี้ เวท หลังวิ่ง', null,
      { repeat: 3, w: true, review: 'รูปมีแค่ "บอดี้ เวท หลังวิ่ง" — ตีความว่าทำซ้ำ Week 3 ต่อ (= D16 Interval 20×100) + บอดี้เวท' }],

    [31, 'Easy 8 km 65-70%', easyKm(8, null, [65, 70])],
    [32, 'Easy 8 km 65-70% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [65, 70]), W],
    [33, 'Interval 20x200m จ็อก 100m 85-90% Maxhr', IV20x200],
    [34, 'พัก', rest()],
    [35, 'Easy run 1 ชั่วโมง Zone 2', easyMin(60, null, { zone: 2 })],
    [36, 'ทำซ้ำ Week 1 บอดี้ เวท หลังวิ่ง', null, { repeat: 1, w: true }],
    ['37-40', 'Easy 8-12km 60-75% Maxhr', B812],
    [41, 'Easy 8-12km 60-75% Maxhr บอดี้ เวท หลังวิ่ง', B812, W],
    [42, 'บอดี้ เวท หลังวิ่ง', weights('บอดี้เวท'),
      { w: true, review: 'รูปมีแค่ "บอดี้ เวท หลังวิ่ง" (ตรงกับ D7 วันพักของ Week 1) — ตั้งเป็นวันบอดี้เวท' }],
    [43, 'Easy 10km 65-70% Maxhr', easyKm(10, null, [65, 70])],
    [44, 'Interval 30x200m 85-90% จ็อก 100m', IV30x200],
    [45, 'Easy 12km 60-65%', easyKm(12, null, [60, 65])],
    [46, 'Easy 8km 65-75%', easyKm(8, null, [65, 75])],
    [47, 'Interval 8x5นาที 80-85% Maxhr พัก 3 นาที', IV8x5],
    [48, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [49, 'Long run 15km', longKm(15)],
    [50, 'Easy 10km 65-70% Maxhr', easyKm(10, null, [65, 70])],
    [51, 'Interval 20x300m 80-90% พัก จ็อก 100m',
      reps('interval', 'Interval 20×300 ม. จ็อก 100 ม.', { n: 20, m: 300, hr: [80, 90], rm: 100, rtype: 'jog' })],
    [52, 'Easy 12km 60-65% Maxhr', easyKm(12, null, [60, 65])],
    [53, 'Easy 8km 65-75%', easyKm(8, null, [65, 75])],
    [54, 'Interval 30x200m 85-90% จ็อก 100m บอดี้ เวท หลังวิ่ง', IV30x200, W],
    [55, 'พัก', rest()],
    [56, 'long run 15-18km', longKm(15, 18)],
    [57, 'Easy 10km 65-70% Maxhr', easyKm(10, null, [65, 70])],
    [58, 'Interval 30x200m 85-90% จ็อก 100m', IV30x200],
    [59, 'Easy 12km 60-65%', easyKm(12, null, [60, 65])],
    [60, 'Easy 8km 60-65% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [60, 65]), W],

    [61, 'Interval 8x5นาที 80-85% Maxhr พัก 3 นาที', IV8x5],
    [62, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [63, 'Long run 15km', longKm(15)],
    [64, 'Easy 12km 60-65%', easyKm(12, null, [60, 65])],
    [65, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [66, 'Easy 15Km 70-75% บอดี้ เวท หลังวิ่ง', easyKm(15, null, [70, 75]), W],
    [67, 'Interval 30x200m 85-90% จ็อก 100 m', IV30x200],
    [68, 'Recovery 8km', easyKm(8, null, null, { label: 'Recovery' })],
    [69, 'พัก', rest()],
    [70, 'Long run 15-18km 65-75%', longKm(15, 18, [65, 75])],
    [71, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [72, 'Easy 12km 60-65% บอดี้ เวท หลังวิ่ง', easyKm(12, null, [60, 65]), W],
    [73, 'T.pace 6x1k 80-90% Maxhr', reps('threshold', 'T.Pace 6×1 กม.', { n: 6, km: 1, hr: [80, 90] })],
    [74, 'Easy 12km 60-65%', easyKm(12, null, [60, 65])],
    [75, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [76, 'พัก', rest()],
    [77, 'Long run 15-18km 65-75%', longKm(15, 18, [65, 75])],
    [78, 'Easy 8 km 65-70% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [65, 70]), W],
    [79, 'Interval 8x1k 80-90% Maxhr พัก 3 นาที', reps('interval', 'Interval 8×1 กม. พัก 3 นาที', { n: 8, km: 1, hr: [80, 90], rsec: 180 })],
    [80, 'Easy 12km 65-75%', easyKm(12, null, [65, 75])],
    [81, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [82, 'Easy 18km 65-75% Maxhr', easyKm(18, null, [65, 75])],
    [83, 'พัก', rest()],
    [84, 'T.Pace 4x15นาที 80-85% Maxhr บอดี้ เวท หลังวิ่ง', reps('threshold', 'T.Pace 4×15 นาที', { n: 4, sec: 900, hr: [80, 85] }), W],
    [85, 'Easy 8km 60-70% Maxhr', easyKm(8, null, [60, 70])],
    [86, 'Interval 8x400m 90% Maxhr พัก จ็อก 3 นาที',
      reps('interval', 'Interval 8×400 ม. จ็อก 3 นาที', { n: 8, m: 400, hr: [90], rsec: 180, rtype: 'jog' })],
    [87, 'Easy 8 km 60-70%', easyKm(8, null, [60, 70])],
    ['88-89', 'พัก', rest()],
    [90, 'Test/Race บอดี้ เวท หลังวิ่ง', reps('race_test', 'Test/Race 21.1 กม.', { km: 21.1 }), W],
  ].map(([r, t, d, x]) => [r, t, d ?? rest(), x]),
))

// =============================================================================
// 5) 21KM Performance (74 วัน)
// =============================================================================
const P1215S = multi('easy', 'Easy 12-15 กม. + Stride 4-6 เที่ยว', [seg({ km: 12, kmMax: 15, hr: [60, 75] }), STRIDE_4_6])
const REV = 'รูปเขียน "65-55%" (ช่วงกลับด้าน) — ตีความเป็น 55-65% MaxHR'
const twentyOnePerf = resolveRepeats(build(
  { slug: 'fastbull-21k-performance', name: '21KM Performance', level: 'performance', goal_distance_km: 21.1, total_days: 74,
    note: '21K ต่ำกว่า 1:45:00 - 2:00:00 ชม. — กลุ่มต้องการทำเวลา' },
  [
    ['1-3', 'Easy 12-15km 60-75% Maxhr หลังวิ่ง Stride 50-80m 4-6 เที่ยว', P1215S, { strides: true }],
    [4, 'Easy 12-15km 60-75% Maxhr หลังวิ่ง Stride 50-80m 4-6 เที่ยว บอดี้ เวท หลังวิ่ง', P1215S, { strides: true, w: true }],
    [5, 'Easy 12-15km 60-75% Maxhr หลังวิ่ง Stride 50-80m 4-6 เที่ยว', P1215S, { strides: true }],
    [6, 'พัก', rest()],
    [7, 'Easy 15-18Km 60-75% Maxhr', easyKm(15, 18, [60, 75])],
    [8, '8km 60-65%', easyKm(8, null, [60, 65])],
    [9, '30x200m 85-90% Maxhr พักจ็อก 100m',
      reps('interval', 'Interval 30×200 ม. จ็อก 100 ม.', { n: 30, m: 200, hr: [85, 90], rm: 100, rtype: 'jog' })],
    [10, 'Easy 15km 60-65% บอดี้ เวท หลังวิ่ง', easyKm(15, null, [60, 65]), W],
    [11, 'Easy 15km 60-65%', easyKm(15, null, [60, 65])],
    [12, '20x1 นาที 85-90% จ็อก 1 นาที',
      reps('interval', 'Interval 20×1 นาที จ็อก 1 นาที', { n: 20, sec: 60, hr: [85, 90], rsec: 60, rtype: 'jog' })],
    [13, 'พัก', rest()],
    [14, 'Long run 18-20km 65-70%', longKm(18, 20, [65, 70])],
    [15, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [16, 'Interval 40x100m 85-90% พัก จ็อก 100m บอดี้ เวท หลังวิ่ง',
      reps('interval', 'Interval 40×100 ม. จ็อก 100 ม.', { n: 40, m: 100, hr: [85, 90], rm: 100, rtype: 'jog' }), W],
    [17, 'Easy 15km 65-55% Maxhr', easyKm(15, null, [55, 65]), { review: REV }],
    [18, 'Interval 40x200m 85-90% พัก จ็อก 100m',
      reps('interval', 'Interval 40×200 ม. จ็อก 100 ม.', { n: 40, m: 200, hr: [85, 90], rm: 100, rtype: 'jog' })],
    [19, 'Easy 15km 65-55% Maxhr', easyKm(15, null, [55, 65]), { review: REV }],
    [20, 'พัก', rest()],
    [21, 'Long run 18-20km 65-70%', longKm(18, 20, [65, 70])],
    [22, 'ทำซ้ำ Week 2 บอดี้ เวท หลังวิ่ง', null, { repeat: 2, w: true }],
    ['23-27', 'ทำซ้ำ Week 2', null, { repeat: 2 }],
    [28, 'ทำซ้ำ Week 2 บอดี้ เวท หลังวิ่ง', null, { repeat: 2, w: true }],
    [29, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [30, '12x3นาที 85-90% พักจ็อก 1.30 นาที',
      reps('interval', 'Interval 12×3 นาที จ็อก 1:30', { n: 12, sec: 180, hr: [85, 90], rsec: 90, rtype: 'jog' })],

    [31, 'Easy 15km 65-55%', easyKm(15, null, [55, 65]), { review: REV }],
    [32, 'Easy 12-15km 65-55%', easyKm(12, 15, [55, 65]), { review: REV }],
    [33, 'Interval 20x400m 80-90% พัก จ็อก 200m',
      reps('interval', 'Interval 20×400 ม. จ็อก 200 ม.', { n: 20, m: 400, hr: [80, 90], rm: 200, rtype: 'jog' })],
    [34, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [35, 'Long run 18-20km', longKm(18, 20)],
    [36, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [37, 'T.Pace 8x1km 85-90% Maxhr พัก 2 นาที', reps('threshold', 'T.Pace 8×1 กม. พัก 2 นาที', { n: 8, km: 1, hr: [85, 90], rsec: 120 })],
    [38, 'Easy 15km 65-55%', easyKm(15, null, [55, 65]), { review: REV }],
    [39, 'Easy12-15km 55-65%', easyKm(12, 15, [55, 65])],
    [40, 'Interval 30x300m 80-90% พัก จ็อก 100m บอดี้ เวท หลังวิ่ง',
      reps('interval', 'Interval 30×300 ม. จ็อก 100 ม.', { n: 30, m: 300, hr: [80, 90], rm: 100, rtype: 'jog' }), W],
    [41, 'พัก', rest()],
    [42, 'Longrun 20k 60-75% Maxhr', longKm(20, null, [60, 75])],
    [43, 'Easy 8 km 55-65%', easyKm(8, null, [55, 65])],
    [44, 'T.pace 4x3k 80-90% Maxhr พัก 3 นาที', reps('threshold', 'T.Pace 4×3 กม. พัก 3 นาที', { n: 4, km: 3, hr: [80, 90], rsec: 180 })],
    [45, 'Easy 1 ชั่วโมง 55-65% Maxhr', easyMin(60, null, { hr: [55, 65] })],
    [46, 'Interval Vo2Max 8x400m 90-95% Maxhr พัก พักจ็อก 200m บอดี้ เวท หลังวิ่ง',
      reps('vo2max', 'VO2max 8×400 ม. จ็อก 200 ม.', { n: 8, m: 400, hr: [90, 95], rm: 200, rtype: 'jog' }), W],
    [47, 'Easy 1 ชั่วโมง 55-65%', easyMin(60, null, { hr: [55, 65] })],
    [48, 'พัก', rest()],
    [49, 'Longrun 20-25K 55-65%', longKm(20, 25, [55, 65])],
    [50, 'Easy 8km 60-65%', easyKm(8, null, [60, 65])],
    [51, 'Easy 15km 55-65%', easyKm(15, null, [55, 65])],
    [52, 'Interval 30x400m 80-90% Maxhr พัก จ็อก 200m บอดี้ เวท หลังวิ่ง',
      reps('interval', 'Interval 30×400 ม. จ็อก 200 ม.', { n: 30, m: 400, hr: [80, 90], rm: 200, rtype: 'jog' }), W],
    [53, 'Easy 8-15km 55-65%', easyKm(8, 15, [55, 65])],
    [54, 'Easy 15km 55-65%', easyKm(15, null, [55, 65])],
    [55, 'พัก', rest()],
    [56, '4x5km 75-85% Maxhr ฟีลลิ่ง Long run ใกล้ๆ pace แข่ง +20-30 วิ',
      reps('tempo', '4×5 กม. (pace แข่ง +20-30 วิ)', { n: 4, km: 5, hr: [75, 85], label: 'ฟีลลิ่ง Long run ใกล้ pace แข่ง +20-30 วิ/กม.' }),
      { review: 'ไม่ระบุการพักระหว่างเที่ยว 5 กม.' }],
    [57, 'พัก หรือ Easy 8 km', easyKm(8, null, null, { label: 'พัก หรือ Easy' }), { note: 'หรือพัก' }],
    [58, 'Easy 12km 55-65% บอดี้ เวท หลังวิ่ง', easyKm(12, null, [55, 65]), W],
    [59, 'Easy 15km 55-65%', easyKm(15, null, [55, 65])],
    [60, 'T.Pace 5x3k 80-90% Maxhr พัก 3 นาที', reps('threshold', 'T.Pace 5×3 กม. พัก 3 นาที', { n: 5, km: 3, hr: [80, 90], rsec: 180 })],

    [61, 'Easy 12 km 55-60%', easyKm(12, null, [55, 60])],
    [62, 'พัก', rest()],
    [63, 'Long run 20-25k 55-75%', longKm(20, 25, [55, 75])],
    [64, 'Easy 8 km 55-65% บอดี้ เวท หลังวิ่ง', easyKm(8, null, [55, 65]), W],
    [65, 'Easy 15km 55-65%', easyKm(15, null, [55, 65])],
    [66, 'Tempo 12-15 km 80-85% Max hr (ห้ามกดไปที่ Pace แข่งนะครับ ให้ช้ากว่าแข่งประมาณ 5-15 วิ ครับ)',
      reps('tempo', 'Tempo 12-15 กม.', { km: 12, kmMax: 15, hr: [80, 85], label: 'ช้ากว่า pace แข่ง 5-15 วิ/กม.' })],
    [67, 'Easy 8 km 55-65% หรือพัก', easyKm(8, null, [55, 65]), { note: 'หรือพัก' }],
    [68, 'Easy 15km 55-65%', easyKm(15, null, [55, 65])],
    [69, 'Interval Vo2Max 8x400m 90-95% Maxhr พัก พักจ็อก 200m',
      reps('vo2max', 'VO2max 8×400 ม. จ็อก 200 ม.', { n: 8, m: 400, hr: [90, 95], rm: 200, rtype: 'jog' })],
    [70, 'พัก บอดี้ เวท หลังวิ่ง', rest('พัก + บอดี้เวท'), W],
    [71, 'Longrun 20-25K 60-75% Maxhr', longKm(20, 25, [60, 75])],
    [72, 'Easy 8 km 55-65%', easyKm(8, null, [55, 65])],
    [73, 'Easy 15 km 55-65%', easyKm(15, null, [55, 65])],
    [74, 'T.Pace 8x1.6k 85-90% Maxhr พัก จ็อก 400 เมตร',
      reps('threshold', 'T.Pace 8×1.6 กม. จ็อก 400 ม.', { n: 8, km: 1.6, hr: [85, 90], rm: 400, rtype: 'jog' })],
  ].map(([r, t, d, x]) => [r, t, d ?? rest(), x]),
))

const plans = [fiveK, tenKBegin, tenKPerf, twentyOneBegin, twentyOnePerf]
const out = {
  format: 'workout-log/run-plans@1',
  source: 'FASTBULL RUN (ใช้ส่วนตัว)',
  zones_pct_maxhr: ZONE,
  plans,
}
writeFileSync(join(root, 'supabase', 'seed_run_plans.json'), JSON.stringify(out, null, 2) + '\n')

const review = plans.flatMap((p) => p.days.filter((d) => d.note === 'ตรวจสอบ').map((d) => `${p.name} D${d.day_no}: ${d.review_reason}`))
console.log(`wrote ${plans.map((p) => `${p.name}=${p.days.length}`).join(', ')}`)
console.log(`ตรวจสอบ ${review.length} วัน:\n` + review.join('\n'))
