// เก็บ cache ของ TanStack Query ลง IndexedDB เพื่อให้เปิดแอปแบบออฟไลน์แล้วยังเห็นข้อมูลล่าสุด
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import { offlineDb } from './db'

const KEY = 'react-query-cache'

export const idbPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    await offlineDb.kv.put({ key: KEY, value: client })
  },
  restoreClient: async () => (await offlineDb.kv.get(KEY))?.value as PersistedClient | undefined,
  removeClient: async () => {
    await offlineDb.kv.delete(KEY)
  },
}
