import { useEffect, useState, useSyncExternalStore } from 'react'
import { failedOps, flushQueue, lastPullAt, pendingCount, pullAll, subscribeQueue } from './queue'

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

/** จำนวนรายการที่รอส่ง + ส่งอัตโนมัติเมื่อออนไลน์ + ดึงข้อมูลใหม่เมื่อกลับมาที่แอป */
export function useSyncQueue() {
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
    void flushQueue()
    const t = setInterval(() => void flushQueue(), 30_000)
    // กลับมาเปิดแอป/สลับแท็บ: ดึงข้อมูลใหม่ถ้าเกิน 2 นาที (เผื่อบันทึกจากอีกเครื่อง)
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - (await lastPullAt()) > 120_000) void pullAll().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    void onVisible()
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [online])

  return { online, pending, failed, syncNow: () => pullAll() }
}
