// เรียก Google Apps Script (ฐานข้อมูล Google Sheet)
// ส่งเป็น text/plain เพื่อไม่ให้เบราว์เซอร์ทำ CORS preflight (Apps Script ไม่รองรับ OPTIONS)
const GAS_URL = (import.meta.env.VITE_GAS_URL as string | undefined)?.trim()
const KEY_STORAGE = 'workout-log-key'

export const backendConfigured = Boolean(GAS_URL)

export class BackendError extends Error {}

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE)
  } catch {
    return null
  }
}
export function setKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

export async function call<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}, key = getKey()): Promise<T> {
  if (!GAS_URL) throw new BackendError('ยังไม่ได้ตั้ง VITE_GAS_URL')
  if (!key) throw new BackendError('ยังไม่ได้ล็อกอิน')
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key, action, ...payload }),
    redirect: 'follow',
  })
  if (!res.ok) throw new BackendError(`Apps Script HTTP ${res.status}`)
  const j = (await res.json()) as T & { error?: string }
  if (j.error) throw new BackendError(j.error === 'unauthorized' ? 'รหัสผ่านไม่ถูกต้อง' : j.error)
  return j
}
