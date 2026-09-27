// Supabase Edge Function: ส่งการแจ้งเตือน (อีเมลผ่าน Resend + Web Push)
// - pg_cron เรียกทุก 15 นาที พร้อม header x-notify-secret → ส่งตามเวลาที่ผู้ใช้ตั้ง
// - แอปเรียกพร้อม JWT ของผู้ใช้ + body {test: 'morning'|'evening'|'weekly'} → ส่งทดสอบให้ผู้ใช้คนนั้น
// secrets: NOTIFY_SECRET, RESEND_API_KEY (ไม่มี = ข้ามอีเมล), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { buildEvening, buildMorning, buildWeekly, dueKinds, type Kind, type Message, type NotifySettings, type Payload } from '../_shared/messages.ts'

const env = (k: string) => Deno.env.get(k) ?? ''
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const APP_URL = env('APP_URL') || 'https://piphutpong.github.io/workout-log/'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

if (env('VAPID_PRIVATE_KEY')) {
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
}

function bkkNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  )
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, dow }
}

async function sendEmail(to: string, m: Message): Promise<string | null> {
  const key = env('RESEND_API_KEY')
  if (!key) return 'ยังไม่ได้ตั้ง RESEND_API_KEY'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM') || 'Workout Log <onboarding@resend.dev>', to: [to], subject: m.title, html: m.html, text: m.body }),
  })
  return res.ok ? null : `Resend ${res.status}: ${await res.text()}`
}

async function sendPush(uid: string, m: Message, tag: string): Promise<string | null> {
  if (!env('VAPID_PRIVATE_KEY')) return 'ยังไม่ได้ตั้ง VAPID keys'
  const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', uid)
  if (!subs?.length) return 'ยังไม่มีอุปกรณ์ที่เปิด Web Push'
  const errors: string[] = []
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: m.title, body: m.body, url: m.url, tag }),
        { TTL: 6 * 3600 },
      )
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id) // หมดอายุ
      else errors.push(String((e as Error).message ?? e))
    }
  }
  return errors.length ? errors.join('; ') : null
}

async function process(uid: string, email: string | undefined, s: NotifySettings, kind: Kind, date: string, test: boolean) {
  const { data, error } = await sb.rpc('notification_payload', { p_uid: uid, p_date: date, p_weekly: kind === 'weekly' })
  if (error) throw new Error(error.message)
  const p = data as Payload
  let m: Message | null
  if (kind === 'morning') m = buildMorning(p, APP_URL)
  else if (kind === 'evening') m = buildEvening(p, APP_URL) ?? (test ? { title: 'บันทึกครบแล้ววันนี้ 👍', body: 'ไม่มีอะไรค้าง', html: '<p>ไม่มีอะไรค้าง</p>', url: APP_URL } : null)
  else {
    const { data: g } = await sb.from('goals').select('direction').eq('user_id', uid).eq('metric', 'weight_kg').eq('status', 'active').maybeSingle()
    const w = buildWeekly(p, APP_URL, g?.direction !== 'up')
    if (!p.review && p.week_start && !test) {
      await sb.from('weekly_reviews').upsert({ user_id: uid, week_start: p.week_start, good: w.good, improve: w.improve, stats: p.stats }, { onConflict: 'user_id,week_start' })
    }
    m = w
  }
  if (!m) return { kind, skipped: 'ไม่มีอะไรต้องเตือน' }

  const channels: string[] = []
  const errors: Record<string, string> = {}
  if (s.notify_email && email) {
    const err = await sendEmail(email, m)
    if (err) errors.email = err
    else channels.push('email')
  }
  if (s.notify_push) {
    const err = await sendPush(uid, m, kind)
    if (err) errors.push = err
    else channels.push('push')
  }
  if (!test) {
    await sb.from('notification_log').upsert({ user_id: uid, date, kind, channels, title: m.title, body: m.body }, { onConflict: 'user_id,date,kind' })
  }
  return { kind, channels, errors, title: m.title }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const now = bkkNow()
    const body = await req.json().catch(() => ({})) as { test?: Kind }

    // ---- ทดสอบจากแอป (ต้องมี JWT ของผู้ใช้) ----
    if (body.test) {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
      const { data: u, error } = await sb.auth.getUser(token)
      if (error || !u.user) return json({ error: 'ต้องล็อกอิน' }, 401)
      const { data: s } = await sb.from('settings').select('*').eq('user_id', u.user.id).single()
      const st = s as NotifySettings
      if (!st.notify_email && !st.notify_push) return json({ error: 'เปิดอีเมลหรือ Web Push ก่อน' }, 400)
      return json(await process(u.user.id, u.user.email, st, body.test, now.date, true))
    }

    // ---- cron ----
    if (req.headers.get('x-notify-secret') !== env('NOTIFY_SECRET') || !env('NOTIFY_SECRET')) return json({ error: 'forbidden' }, 403)
    const { data: all, error } = await sb.from('settings').select('user_id, notify_email, notify_push, notify_weekly, notify_morning_time, notify_evening_time')
      .or('notify_email.eq.true,notify_push.eq.true')
    if (error) throw new Error(error.message)
    const results: unknown[] = []
    for (const s of all ?? []) {
      const kinds = dueKinds(s as NotifySettings, now)
      if (!kinds.length) continue
      const { data: sent } = await sb.from('notification_log').select('kind').eq('user_id', s.user_id).eq('date', now.date)
      const { data: u } = await sb.auth.admin.getUserById(s.user_id)
      for (const kind of kinds) {
        if (sent?.some((x) => x.kind === kind)) continue
        try {
          results.push(await process(s.user_id, u.user?.email, s as NotifySettings, kind, now.date, false))
        } catch (e) {
          results.push({ kind, error: String((e as Error).message) })
        }
      }
    }
    return json({ now, results })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
