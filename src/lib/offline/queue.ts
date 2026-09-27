// คิวบันทึกข้อมูลแบบออฟไลน์: ถ้าส่งไม่ได้ เก็บใน IndexedDB แล้วส่งอัตโนมัติเมื่อกลับมาออนไลน์
// ทุกแถวมี id (uuid) ที่สร้างฝั่ง client ทำให้ส่งซ้ำได้โดยไม่เกิดข้อมูลซ้ำ (upsert)
import { supabase, currentUserId } from '@/lib/supabase'
import type { InsertOf, TableName } from '@/types/database'
import { offlineDb, type QueuedOp } from './db'

type Listener = () => void
const listeners = new Set<Listener>()
export function subscribeQueue(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const emit = () => listeners.forEach((fn) => fn())

export const uuid = () => crypto.randomUUID()

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = String((e as { message?: string })?.message ?? e)
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(msg)
}

export class WriteError extends Error {}

async function exec(op: QueuedOp): Promise<void> {
  // supabase-js typing ต่อตารางแบบ dynamic ทำได้ยาก จึง cast เฉพาะจุดนี้
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = supabase.from(op.table) as any
  let res: { error: { message: string } | null }
  if (op.op === 'upsert') res = await t.upsert(op.payload, op.onConflict ? { onConflict: op.onConflict } : undefined)
  else if (op.op === 'update') res = await t.update(op.payload).in('id', op.ids)
  else res = await t.delete().in('id', op.ids)
  if (res.error) {
    if (isNetworkError(res.error)) throw res.error
    throw new WriteError(res.error.message)
  }
}

export interface WriteResult { queued: boolean }

async function run(op: Omit<QueuedOp, 'createdAt' | 'tries'>): Promise<WriteResult> {
  const full: QueuedOp = { ...op, createdAt: Date.now(), tries: 0 }
  // ถ้ายังมีรายการค้างในคิว ต้องต่อท้ายคิวเพื่อรักษาลำดับ (เช่น session ต้องไปก่อน sets)
  const pending = await offlineDb.queue.count()
  if (!pending && navigator.onLine) {
    try {
      await exec(full)
      return { queued: false }
    } catch (e) {
      if (!isNetworkError(e)) throw e
    }
  }
  await offlineDb.queue.add(full)
  emit()
  return { queued: true }
}

/** เพิ่ม/แก้แถว (ใส่ id และ user_id ให้อัตโนมัติ) */
export async function upsertRows<T extends TableName>(
  table: T,
  rows: (Omit<InsertOf<T>, 'user_id'> & { id?: string })[],
  onConflict?: string,
): Promise<WriteResult & { ids: string[] }> {
  const uid = await currentUserId()
  const withIds = rows.map((r) => ({ ...r, id: r.id ?? uuid(), user_id: uid }))
  const res = await run({ table, op: 'upsert', payload: withIds, onConflict })
  return { ...res, ids: withIds.map((r) => r.id) }
}

export async function updateRows<T extends TableName>(table: T, ids: string[], patch: Partial<InsertOf<T>>) {
  return run({ table, op: 'update', payload: patch, ids })
}

export async function deleteRows(table: TableName, ids: string[]) {
  return run({ table, op: 'delete', payload: null, ids })
}

let flushing: Promise<number> | null = null

/** ส่งรายการในคิวทีละรายการตามลำดับ คืนจำนวนที่ส่งสำเร็จ */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    try {
      for (;;) {
        const op = await offlineDb.queue.orderBy('seq').first()
        if (!op || !navigator.onLine) break
        try {
          await exec(op)
          await offlineDb.queue.delete(op.seq!)
          sent++
        } catch (e) {
          if (isNetworkError(e)) break
          // ข้อมูลขัด constraint: ลองใหม่ได้ 3 ครั้ง แล้วย้ายไปรายการที่ล้มเหลว ไม่ให้ขวางคิวตลอดไป
          const tries = op.tries + 1
          if (tries >= 3) {
            await offlineDb.queue.delete(op.seq!)
            await offlineDb.kv.put({ key: `failed:${op.seq}`, value: { ...op, tries, lastError: (e as Error).message } })
          } else {
            await offlineDb.queue.update(op.seq!, { tries, lastError: (e as Error).message })
            break
          }
        }
      }
    } finally {
      flushing = null
      emit()
    }
    return sent
  })()
  return flushing
}

export async function pendingCount(): Promise<number> {
  return offlineDb.queue.count()
}

export async function failedOps(): Promise<QueuedOp[]> {
  const rows = await offlineDb.kv.where('key').startsWith('failed:').toArray()
  return rows.map((r) => r.value as QueuedOp)
}

export async function clearFailedOps() {
  const rows = await offlineDb.kv.where('key').startsWith('failed:').primaryKeys()
  await offlineDb.kv.bulkDelete(rows)
  emit()
}
