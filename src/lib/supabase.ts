import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// ใช้เฉพาะ anon key + RLS เท่านั้น ห้ามใส่ service_role key ในโค้ดหน้าเว็บ
export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'workout-log-auth' },
})

let cachedUserId: string | null = null
supabase.auth.onAuthStateChange((_e, session) => {
  cachedUserId = session?.user.id ?? null
})

/** user id ปัจจุบัน (ใช้ได้แม้ออฟไลน์ เพราะ session เก็บใน localStorage) */
export async function currentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId
  const { data } = await supabase.auth.getSession()
  cachedUserId = data.session?.user.id ?? null
  if (!cachedUserId) throw new Error('ยังไม่ได้ล็อกอิน')
  return cachedUserId
}
