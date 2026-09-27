import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { failedOps, flushQueue, pendingCount, subscribeQueue } from './queue'

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}

/** จำนวนรายการที่รอส่ง + ส่งอัตโนมัติเมื่อออนไลน์ */
export function useSyncQueue() {
  const qc = useQueryClient()
  const online = useOnline()
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)

  useEffect(() => {
    const refresh = () => {
      void pendingCount().then(setPending)
      void failedOps().then((f) => setFailed(f.length))
    }
    refresh()
    return subscribeQueue(refresh)
  }, [])

  useEffect(() => {
    if (!online) return
    const sync = async () => {
      const sent = await flushQueue()
      if (sent > 0) await qc.invalidateQueries()
    }
    void sync()
    const t = setInterval(sync, 30_000)
    return () => clearInterval(t)
  }, [online, qc])

  return { online, pending, failed, syncNow: () => flushQueue().then(() => qc.invalidateQueries()) }
}
