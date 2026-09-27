import Dexie, { type Table } from 'dexie'
import type { TableName } from '@/types/database'

export interface QueuedOp {
  seq?: number
  table: TableName
  op: 'upsert' | 'update' | 'delete'
  /** upsert: rows[], update: patch, delete: null */
  payload: unknown
  /** update/delete: id ของแถว */
  ids?: string[]
  onConflict?: string
  createdAt: number
  tries: number
  lastError?: string
}

export interface Draft { key: string; value: unknown; updatedAt: number }
export interface KV { key: string; value: unknown }

class OfflineDb extends Dexie {
  queue!: Table<QueuedOp, number>
  drafts!: Table<Draft, string>
  kv!: Table<KV, string>
  constructor() {
    super('workout-log')
    this.version(1).stores({ queue: '++seq, table, createdAt', drafts: 'key', kv: 'key' })
  }
}

export const offlineDb = new OfflineDb()

// ---- drafts (เช่น บันทึกเวทระหว่างเล่น) -------------------------------------
export async function saveDraft(key: string, value: unknown) {
  await offlineDb.drafts.put({ key, value, updatedAt: Date.now() })
}
export async function loadDraft<T>(key: string): Promise<{ value: T; updatedAt: number } | null> {
  const d = await offlineDb.drafts.get(key)
  return d ? { value: d.value as T, updatedAt: d.updatedAt } : null
}
export async function clearDraft(key: string) {
  await offlineDb.drafts.delete(key)
}
