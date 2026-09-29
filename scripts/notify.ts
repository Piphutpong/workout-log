// ส่งการแจ้งเตือน (GitHub Actions ทุก 15 นาที): อีเมลผ่าน Apps Script MailApp + Web Push
// ใช้ engine และข้อความชุดเดียวกับแอป · รัน: npx tsx --tsconfig tsconfig.scripts.json scripts/notify.ts
// env: GAS_URL, GAS_KEY, VAPID_PRIVATE_KEY (ถ้าจะใช้ push), APP_URL, FORCE=morning|evening|weekly (ทดสอบ)
import webpush from 'web-push'
import { dbFrom } from '@/lib/engine/db'
import { notificationPayload } from '@/lib/engine/stats'
import { buildEvening, buildMorning, buildWeekly, dueKinds, type Kind, type Message, type NotifySettings, type Payload } from '@/lib/notify/messages'
import { VAPID_PUBLIC_KEY } from '@/lib/vapid'
import type { TableName } from '@/types/database'
import { gas, requireGas } from './lib/gas'

requireGas()
const APP_URL = process.env.APP_URL?.trim() || 'https://piphutpong.github.io/workout-log/'
const FORCE = process.env.FORCE?.trim() as Kind | undefined
if (FORCE && !['morning', 'evening', 'weekly'].includes(FORCE)) throw new Error(`FORCE ต้องเป็น morning/evening/weekly (ได้ "${FORCE}")`)
const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim()
if (vapidPrivate) webpush.setVapidDetails(APP_URL, VAPID_PUBLIC_KEY, vapidPrivate)

function bkkNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) }
}

type Row = Record<string, unknown> & { id: string }
const { tables } = await gas<{ tables: Record<string, Row[]> }>('pull')
const db = dbFrom(tables as Partial<Record<TableName, unknown[]>>)
const settings = tables.settings?.[0] as unknown as NotifySettings | undefined
const now = bkkNow()
if (!settings) {
  console.log('ยังไม่มีข้อมูลผู้ใช้')
  process.exit(0)
}

// GitHub Actions cron อาจช้าได้ → ถือว่า "ถึงเวลา" ภายใน 3 ชม. หลังเวลาที่ตั้ง และส่งครั้งเดียวต่อวัน (ดู notification_log)
const sent = new Set((tables.notification_log ?? []).filter((n) => n.date === now.date).map((n) => n.kind as string))
const kinds: Kind[] = FORCE ? [FORCE] : dueKinds(settings, now, 180).filter((k) => !sent.has(k))
console.log(now, 'due:', kinds)

const ops: Record<string, unknown>[] = []
for (const kind of kinds) {
  const p = notificationPayload(db, now.date, kind === 'weekly') as unknown as Payload
  let m: Message | null
  if (kind === 'morning') m = buildMorning(p, APP_URL)
  else if (kind === 'evening') m = buildEvening(p, APP_URL)
  else {
    const losing = (tables.goals ?? []).some((g) => g.metric === 'weight_kg' && g.status === 'active' && g.direction === 'down')
    const w = buildWeekly(p, APP_URL, losing)
    if (!p.review && p.week_start) {
      ops.push({ table: 'weekly_reviews', op: 'upsert', rows: [{ id: crypto.randomUUID(), user_id: 'owner', week_start: p.week_start, good: w.good,
        improve: w.improve, stats: p.stats, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] })
    }
    m = w
  }
  const channels: string[] = []
  if (m && settings.notify_email) {
    try {
      await gas('send_email', { subject: m.title, html: m.html, text: m.body })
      channels.push('email')
    } catch (e) {
      console.error('email:', (e as Error).message)
    }
  }
  if (m && settings.notify_push && vapidPrivate) {
    for (const s of tables.push_subscriptions ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: kind }), { TTL: 6 * 3600 })
        if (!channels.includes('push')) channels.push('push')
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) ops.push({ table: 'push_subscriptions', op: 'delete', ids: [s.id] })
        else console.error('push:', (e as Error).message)
      }
    }
  }
  console.log(kind, m ? `"${m.title}" → ${channels.join(', ') || '-'}` : 'ไม่มีอะไรต้องเตือน')
  if (!FORCE) {
    ops.push({ table: 'notification_log', op: 'upsert', rows: [{ id: crypto.randomUUID(), user_id: 'owner', date: now.date, kind, channels,
      title: m?.title ?? null, body: m?.body ?? null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] })
  }
}
if (ops.length) await gas('push', { ops })
