// สร้างข้อความแจ้งเตือน (ใช้ทั้งในแอปและ GitHub Actions: scripts/notify.ts)
import { evaluateWeek, type WeeklyReviewStats } from '@/lib/rules'

export type Kind = 'morning' | 'evening' | 'weekly'

export interface NotifySettings {
  notify_email: boolean
  notify_push: boolean
  notify_weekly: boolean
  notify_morning_time: string | null // 'HH:MM:SS'
  notify_evening_time: string | null
}

export interface Payload {
  date: string
  plan: {
    activity: 'weight' | 'run' | 'rest' | 'active_recovery'
    day_type: string
    source: 'plan' | 'schedule'
    plan: { plan_name: string; day_no: number; total_days: number } | null
    plan_day: { title: string; description?: string | null; add_weights?: boolean } | null
    weight_program: { name: string } | null
    mark: string | null
  }
  weighed: boolean
  last_weight: number | null
  food_items: number
  kcal: number
  protein_g: number
  weight_done: boolean
  run_done: boolean
  checkin_done: boolean
  goals: { title: string; current: number | null; target: number; pct: number | null; state: string }[]
  week_start?: string
  review?: { good: string[]; improve: string[] } | null
  stats?: WeeklyReviewStats
  weekly?: { active_days: number; run_km: number; weight_sessions: number; avg_weight_kg: number | null; weight_change_kg: number | null; protein_days_hit: number | null } | null
}

export interface Message { title: string; body: string; html: string; url: string }

const minutes = (hhmm: string | null | undefined) => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** ประเภทการแจ้งเตือนที่ถึงเวลา (cron ทุก 15 นาที → หน้าต่าง [เวลา, เวลา+15 นาที)) */
export function dueKinds(s: NotifySettings, bkk: { hhmm: string; dow: number }, windowMin = 15): Kind[] {
  if (!s.notify_email && !s.notify_push) return []
  const now = minutes(bkk.hhmm)!
  const inWin = (t: string | null) => {
    const m = minutes(t)
    return m != null && now >= m && now < m + windowMin
  }
  const out: Kind[] = []
  if (inWin(s.notify_morning_time)) {
    out.push('morning')
    if (bkk.dow === 1 && s.notify_weekly) out.push('weekly')
  }
  if (inWin(s.notify_evening_time)) out.push('evening')
  return out
}

const ACT_TH: Record<string, string> = { weight: 'วันเวท', run: 'วันวิ่ง', rest: 'วันพัก', active_recovery: 'Active recovery' }
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

function html(title: string, lines: string[], url: string) {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
<h2 style="margin:0 0 8px">${esc(title)}</h2>
${lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join('\n')}
<p style="margin-top:16px"><a href="${url}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">เปิด Workout Log</a></p>
<p style="color:#64748b;font-size:12px">ปิดการแจ้งเตือนได้ที่ เพิ่มเติม → การแจ้งเตือน · ค่าทั้งหมดเป็นค่าประมาณ ไม่ใช่คำแนะนำทางการแพทย์</p></div>`
}

function planLine(p: Payload['plan']) {
  if (p.mark === 'postponed') return 'วันนี้: เลื่อนแผนแล้ว (วันว่าง)'
  const head = p.source === 'plan' && p.plan ? `${p.plan.plan_name} วันที่ ${p.plan.day_no}/${p.plan.total_days}: ` : ''
  const what = p.plan_day?.title ?? (p.activity === 'weight' && p.weight_program ? `โปรแกรม ${p.weight_program.name}` : ACT_TH[p.activity])
  const extra = p.plan_day?.add_weights && p.weight_program ? ` + เวท ${p.weight_program.name}` : ''
  return `วันนี้ (${ACT_TH[p.activity]}): ${head}${what}${extra}`
}

export function buildMorning(p: Payload, appUrl: string): Message {
  const lines = [
    `⚖️ ชั่งน้ำหนักตอนเช้าก่อนกินอาหาร${p.last_weight ? ` (ล่าสุด ${p.last_weight} กก.)` : ''}`,
    `📋 ${planLine(p.plan)}`,
  ]
  if (p.plan.plan_day?.description) lines.push(`📝 ${p.plan.plan_day.description}`)
  const w = p.goals.find((g) => g.title.includes('น้ำหนัก'))
  if (w?.current != null) lines.push(`🎯 ${w.title}: ตอนนี้ ${w.current} (${Math.round(Number(w.pct ?? 0))}%)`)
  const title = 'อรุณสวัสดิ์ — แผนวันนี้'
  const url = `${appUrl}#/today`
  return { title, body: lines.join('\n'), html: html(title, lines, url), url }
}

/** ค่ำ: เตือนเฉพาะเมื่อยังขาดอะไร (ถ้าครบแล้วคืน null = ไม่ส่ง) */
export function buildEvening(p: Payload, appUrl: string): Message | null {
  const lines: string[] = []
  if (p.food_items === 0) lines.push('🍽 ยังไม่ได้บันทึกอาหารวันนี้')
  const planned = p.plan.mark !== 'skipped' && p.plan.mark !== 'postponed'
  if (planned && p.plan.activity === 'weight' && !p.weight_done) lines.push(`🏋️ ยังไม่ได้บันทึกเวท${p.plan.weight_program ? ` (โปรแกรม ${p.plan.weight_program.name})` : ''}`)
  if (planned && p.plan.activity === 'run' && !p.run_done) lines.push(`🏃 ยังไม่ได้บันทึกวิ่ง${p.plan.plan_day ? ` (${p.plan.plan_day.title})` : ''}`)
  if (!p.weighed) lines.push('⚖️ ยังไม่ได้บันทึกน้ำหนักวันนี้')
  if (!lines.length) return null
  if (p.food_items > 0) lines.push(`วันนี้กินไป ${p.kcal.toLocaleString()} kcal · โปรตีน ${p.protein_g} g`)
  const title = 'ยังไม่ได้บันทึกวันนี้'
  const url = `${appUrl}#/today`
  return { title, body: lines.join('\n'), html: html(title, lines, url), url }
}

export function buildWeekly(p: Payload, appUrl: string, losingWeight = true): Message & { good: string[]; improve: string[] } {
  let good = p.review?.good ?? []
  let improve = p.review?.improve ?? []
  if (!p.review && p.stats) {
    const r = evaluateWeek(p.stats, { losingWeight })
    good = r.good.map((m) => m.text)
    improve = r.improve.map((m) => m.text)
  }
  const w = p.weekly
  const lines = [
    ...(w ? [`ออกกำลังกาย ${w.active_days} วัน · เวท ${w.weight_sessions} ครั้ง · วิ่ง ${Number(w.run_km)} กม.`] : []),
    ...(w?.avg_weight_kg ? [`น้ำหนักเฉลี่ย ${w.avg_weight_kg} กก.${w.weight_change_kg != null ? ` (${Number(w.weight_change_kg) > 0 ? '+' : ''}${Number(w.weight_change_kg).toFixed(2)})` : ''}`] : []),
    ...(good.length ? ['ทำได้ดี:', ...good.map((g) => `✅ ${g}`)] : []),
    ...(improve.length ? ['ต้องปรับ:', ...improve.map((g) => `⚠️ ${g}`)] : []),
  ]
  const title = `สรุปสัปดาห์ ${p.week_start ?? ''}`.trim()
  const url = `${appUrl}#/`
  return { title, body: lines.join('\n'), html: html(title, lines, url), url, good, improve }
}
