// บันทึกในเครื่องทันที แล้วต่อคิวส่งไป Google Sheet (ส่งเป็นชุดเมื่อออนไลน์)
import { BackendError, call } from '@/lib/backend'
import { store, type RemoteOp, type Row } from '@/lib/store'
import type { InsertOf, TableName } from '@/types/database'
import type { SheetTable } from '@/lib/schema'
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
  if (e instanceof BackendError) return /HTTP 5\d\d/.test(e.message)
  const msg = String((e as { message?: string })?.message ?? e)
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(msg)
}

export interface WriteResult { queued: boolean }

async function enqueue(ops: RemoteOp[]): Promise<WriteResult> {
  if (!ops.length) return { queued: false }
  await offlineDb.queue.bulkAdd(ops.map((op) => ({ ...op, createdAt: Date.now(), tries: 0 })))
  emit()
  scheduleFlush()
  return { queued: !navigator.onLine }
}

/** เพิ่ม/แก้แถว (ใส่ id ให้อัตโนมัติ, ใช้ onConflict เป็น key ธรรมชาติ เช่น 'user_id,date') */
export async function upsertRows<T extends TableName>(
  table: T,
  rows: (Omit<InsertOf<T>, 'user_id'> & { id?: string })[],
  onConflict?: string,
): Promise<WriteResult & { ids: string[] }> {
  const final = store.applyUpsert(table as SheetTable, rows as unknown as Row[], onConflict)
  const res = await enqueue([{ table: table as SheetTable, op: 'upsert', rows: final }])
  return { ...res, ids: final.map((r) => r.id) }
}

export async function updateRows<T extends TableName>(table: T, ids: string[], patch: Partial<InsertOf<T>>) {
  const final = store.applyUpdate(table as SheetTable, ids, patch as Record<string, unknown>)
  // ส่งทั้งแถว (upsert) เพื่อให้ updated_at และค่าที่คำนวณ (เช่น pace) ตรงกัน
  return enqueue(final.length ? [{ table: table as SheetTable, op: 'upsert', rows: final }] : [])
}

export async function deleteRows(table: TableName, ids: string[]) {
  return enqueue(store.applyDelete(table as SheetTable, ids))
}

let flushing: Promise<number> | null = null
let timer: ReturnType<typeof setTimeout> | null = null
function scheduleFlush() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushQueue(), 800) // รวมหลายการบันทึกติดกันเป็นชุดเดียว
}

/** ส่งรายการในคิวเป็นชุด คืนจำนวนที่ส่งสำเร็จ */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    try {
      for (;;) {
        if (!navigator.onLine) break
        const batch = await offlineDb.queue.orderBy('seq').limit(100).toArray()
        if (!batch.length) break
        try {
          await call('push', { ops: batch.map(({ table, op, rows, ids, patch }) => ({ table, op, rows, ids, patch })) })
          await offlineDb.queue.bulkDelete(batch.map((b) => b.seq!))
          sent += batch.length
        } catch (e) {
          if (isNetworkError(e)) break
          const first = batch[0]
          const tries = first.tries + 1
          if (tries >= 3) {
            await offlineDb.queue.delete(first.seq!)
            await offlineDb.kv.put({ key: `failed:${first.seq}`, value: { ...first, tries, lastError: (e as Error).message } })
          } else {
            await offlineDb.queue.update(first.seq!, { tries, lastError: (e as Error).message })
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

let pulling: Promise<void> | null = null
/** ดึงข้อมูลทั้งหมดจาก Sheet มาแทนในเครื่อง (ส่งคิวก่อน แล้วใช้รายการที่ยังค้างซ้ำ) */
export function pullAll(): Promise<void> {
  if (pulling) return pulling
  pulling = (async () => {
    try {
      await flushQueue()
      const res = await call<{ tables: Record<string, Row[]> }>('pull')
      const pending = await offlineDb.queue.orderBy('seq').toArray()
      await store.replaceAll(res.tables)
      if (pending.length) store.reapply(pending)
      await offlineDb.kv.put({ key: 'last-pull', value: Date.now() })
    } finally {
      pulling = null
    }
  })()
  return pulling
}

export async function lastPullAt(): Promise<number> {
  return ((await offlineDb.kv.get('last-pull'))?.value as number) ?? 0
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
