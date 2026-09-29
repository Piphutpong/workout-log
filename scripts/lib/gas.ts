// เรียก Apps Script จาก Node (GitHub Actions / สคริปต์ในเครื่อง)
const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']|["']$/g, '').replace(/^[A-Z_]+=/, '').trim()

export const GAS_URL = clean(process.env.GAS_URL)
export const GAS_KEY = clean(process.env.GAS_KEY)

export function requireGas() {
  if (!GAS_URL || !GAS_KEY) {
    console.error('::error::ต้องตั้ง GAS_URL และ GAS_KEY (URL ของ Apps Script Web App และรหัสผ่าน API_KEY)')
    process.exit(1)
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(GAS_URL) && !GAS_URL.startsWith('http://localhost')) {
    console.error(`::error::GAS_URL ต้องเป็นรูปแบบ https://script.google.com/macros/s/.../exec (ได้ความยาว ${GAS_URL.length})`)
    process.exit(1)
  }
}

export async function gas<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: GAS_KEY, action, ...payload }),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`)
  const j = (await res.json()) as T & { error?: string }
  if (j.error) throw new Error(`Apps Script: ${j.error}`)
  return j
}
