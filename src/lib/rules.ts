// กฎแจ้งเตือนและคำแนะนำอัตโนมัติ (ข้อ 6) — ไม่ใช้ AI
// รับตัวเลขจาก weekly_review_stats() แล้วคืนข้อที่ทำได้ดี / ต้องปรับ เรียงตามความสำคัญ
// (ใช้ทั้งในแอปและ scripts/notify.ts ใน GitHub Actions)

export interface WeeklyReviewStats {
  week_start: string
  planned_weight: number
  done_weight: number
  planned_run: number
  done_run: number
  active_days: number
  skipped_days: number
  weight_avg: number | null
  weight_prev_avg: number | null
  weight_prev2_avg: number | null
  run_km: number
  run_km_prev: number
  resting_hr_avg: number | null
  resting_hr_baseline: number | null
  sleep_avg: number | null
  training_weeks_no_deload: number
  prs: number
  protein_days_hit: number
  food_days: number
  low_protein_streak: number
  high_rhr_streak: number
  low_sleep_streak: number
  pain: { part: string; avg: number | null; prev_avg: number | null; last3_high: boolean }[]
  stalled_exercises: string[]
  grip_exercises: string[]
  shoes_near_retire: { name: string; km: number; retire_km: number }[]
}


export interface RuleMessage { key: string; text: string; priority: number }
export interface ReviewResult { good: RuleMessage[]; improve: RuleMessage[] }

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

export function evaluateWeek(s: WeeklyReviewStats, opts: { losingWeight?: boolean } = {}): ReviewResult {
  const losing = opts.losingWeight ?? true
  const good: RuleMessage[] = []
  const improve: RuleMessage[] = []

  // ---- น้ำหนัก --------------------------------------------------------------
  if (s.weight_avg != null && s.weight_prev_avg != null) {
    const loss = s.weight_prev_avg - s.weight_avg
    if (loss > 0.5) {
      improve.push({ key: 'weight_fast', priority: 90, text: `น้ำหนักเฉลี่ยลด ${r2(loss)} กก./สัปดาห์ เร็วกว่า 0.5 — เสี่ยงเสียกล้าม แนะนำเพิ่มแคลอรี่ 150-250 kcal/วัน` })
    } else if (losing && loss >= 0.2) {
      good.push({ key: 'weight_rate', priority: 80, text: `น้ำหนักเฉลี่ยลด ${r2(loss)} กก. อยู่ในช่วงที่ดี (0.2-0.5 กก./สัปดาห์)` })
    }
    if (losing && s.weight_prev2_avg != null && s.weight_avg >= s.weight_prev_avg && s.weight_prev_avg >= s.weight_prev2_avg) {
      improve.push({ key: 'weight_stall', priority: 70, text: 'น้ำหนักเฉลี่ยไม่ลด 2 สัปดาห์ติด — ทบทวนแคลอรี่และความครบถ้วนของการบันทึกอาหาร' })
    }
  }

  // ---- ความสม่ำเสมอ ----------------------------------------------------------
  const planned = s.planned_weight + s.planned_run
  const done = s.done_weight + s.done_run
  if (planned > 0 && done >= planned) {
    good.push({ key: 'all_done', priority: 85, text: `ทำครบตามแผนทุกวัน (เวท ${s.done_weight}/${s.planned_weight}, วิ่ง ${s.done_run}/${s.planned_run})` })
  } else if (planned > 0 && planned - done >= 2) {
    improve.push({ key: 'missed', priority: 50, text: `ทำตามแผนได้ ${done}/${planned} วัน — ลองจัดเวลาล่วงหน้า หรือเลื่อนแผนแทนการข้าม` })
  }
  if (s.active_days >= 5) good.push({ key: 'active', priority: 75, text: `ออกกำลังกาย ${s.active_days} วันในสัปดาห์` })

  // ---- วิ่ง -----------------------------------------------------------------
  if (s.run_km_prev > 0 && s.run_km > s.run_km_prev * 1.1) {
    const pct = Math.round((s.run_km / s.run_km_prev - 1) * 100)
    improve.push({ key: 'run_jump', priority: 80, text: `ระยะวิ่งเพิ่ม ${pct}% จากสัปดาห์ก่อน (${s.run_km_prev} → ${s.run_km} กม.) เกิน 10% — เสี่ยงบาดเจ็บ` })
  } else if (s.run_km > 0) {
    good.push({ key: 'run_km', priority: 40, text: `วิ่งรวม ${s.run_km} กม.${s.run_km_prev > 0 ? ` (สัปดาห์ก่อน ${s.run_km_prev})` : ''}` })
  }

  // ---- อาการเจ็บ --------------------------------------------------------------
  for (const p of s.pain) {
    if (p.last3_high) {
      improve.push({ key: `pain_high:${p.part}`, priority: 100, text: `เจ็บ${p.part} ≥ 4/10 ติดกัน 3 ครั้ง — แนะนำพบแพทย์หรือนักกายภาพ` })
    } else if (p.part.includes('ศอก') && p.avg != null && p.prev_avg != null && p.avg > p.prev_avg) {
      const grip = s.grip_exercises.slice(0, 3).join(', ')
      improve.push({ key: `elbow_up:${p.part}`, priority: 85, text: `เจ็บ${p.part}เฉลี่ยสูงขึ้น (${p.prev_avg} → ${p.avg}) — ลดน้ำหนักท่าที่ใช้การบีบจับ${grip ? ` เช่น ${grip}` : ''}` })
    }
    if (p.avg != null && p.prev_avg != null && p.avg < p.prev_avg) {
      good.push({ key: `pain_down:${p.part}`, priority: 60, text: `อาการเจ็บ${p.part}ลดลง (${p.prev_avg} → ${p.avg})` })
    }
  }

  // ---- เวท ------------------------------------------------------------------
  if (s.stalled_exercises.length) {
    improve.push({ key: 'stalled', priority: 55, text: `ไม่พัฒนา 3 ครั้งติด: ${s.stalled_exercises.slice(0, 3).join(', ')} — ลองเปลี่ยน rep range หรือ deload` })
  }
  if (s.training_weeks_no_deload >= 6) {
    improve.push({ key: 'deload', priority: 65, text: `ฝึกเวทต่อเนื่อง ${s.training_weeks_no_deload} สัปดาห์ — แนะนำ deload 1 สัปดาห์ (น้ำหนัก 60%, 2 เซ็ต)` })
  }
  if (s.prs > 0) good.push({ key: 'prs', priority: 70, text: `ทำสถิติใหม่ ${s.prs} รายการ 🏆` })

  // ---- ฟื้นตัว ----------------------------------------------------------------
  if (s.high_rhr_streak >= 3 || s.low_sleep_streak >= 3) {
    const why = [
      s.high_rhr_streak >= 3 ? `resting HR สูงกว่าค่าเฉลี่ย ≥ 5 bpm ${s.high_rhr_streak} วันติด` : '',
      s.low_sleep_streak >= 3 ? `นอนน้อยกว่า 6 ชม. ${s.low_sleep_streak} วันติด` : '',
    ].filter(Boolean).join(' และ ')
    improve.push({ key: 'recovery', priority: 88, text: `${why} — แนะนำวันเบา/พักเพิ่ม` })
  }
  if (s.sleep_avg != null && s.sleep_avg >= 7) good.push({ key: 'sleep', priority: 45, text: `นอนเฉลี่ย ${r1(s.sleep_avg)} ชม./คืน` })

  // ---- โภชนาการ --------------------------------------------------------------
  if (s.low_protein_streak >= 3) {
    improve.push({ key: 'protein_low', priority: 60, text: `โปรตีนต่ำกว่าเป้า ${s.low_protein_streak} วันติด` })
  }
  if (s.protein_days_hit >= 5) good.push({ key: 'protein', priority: 55, text: `ถึงเป้าโปรตีน ${s.protein_days_hit} วัน` })

  // ---- อุปกรณ์ ----------------------------------------------------------------
  for (const sh of s.shoes_near_retire) {
    improve.push({ key: `shoe:${sh.name}`, priority: 30, text: `รองเท้า ${sh.name} ใช้ไป ${sh.km}/${sh.retire_km} กม. ใกล้ถึงเวลาเปลี่ยน` })
  }

  const top = (l: RuleMessage[]) => [...l].sort((a, b) => b.priority - a.priority).slice(0, 3)
  return { good: top(good), improve: top(improve) }
}
