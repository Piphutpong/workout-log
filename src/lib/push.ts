// Web Push (ตัวเลือกเสริม) — บน iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน (iOS 16.4+)
import { supabase } from './supabase'
import { upsertRows } from './offline/queue'

/** public key (เปิดเผยได้) คู่กับ VAPID_PRIVATE_KEY ใน Supabase secrets */
export const VAPID_PUBLIC_KEY = 'BFw4gG2lAHnzk1651SKL2b6Ge1QD5NsVbwIcquYQWKu9eqUtNTGJ6Pc0nUCFVwrfBmdB77Qt9_K6ZUV0H0Qoubg'

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Push (iPhone: ติดตั้งลงหน้าจอโฮมก่อน)')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('ไม่ได้อนุญาตการแจ้งเตือน')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await upsertRows('push_subscriptions', [{ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent }], 'user_id,endpoint')
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
