import Dexie, { type Table } from 'dexie'
import type { RemoteOp } from '@/lib/store'

export interface QueuedOp extends RemoteOp {
  seq?: number
  createdAt: number
  tries: number
  lastError?: string
}

export interface Draft { key: string; value: unknown; updatedAt: number }
export interface KV { key: string; value: unknown }
export interface RecordRow { t: string; id: string; row: Record<string, unknown> }

class OfflineDb extends Dexie {
  queue!: Table<QueuedOp, number>
  drafts!: Table<Draft, string>
  kv!: Table<KV, string>
  records!: Table<RecordRow, [string, string]>
  constructor() {
    super('workout-log')
    this.version(1).stores({ queue: '++seq, table, createdAt', drafts: 'key', kv: 'key' })
    // v2: ย้ายไป Google Sheet — เก็บข้อมูลทั้งหมดในเครื่อง, ล้างคิวของ Supabase เดิม
    this.version(2).stores({ queue: '++seq, table, createdAt', drafts: 'key', kv: 'key', records: '[t+id], t' })
      .upgrade(async (tx) => {
        await tx.table('queue').clear()
        await tx.table('kv').clear()
      })
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
