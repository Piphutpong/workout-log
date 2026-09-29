import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useSettings } from '@/lib/api'
import { call } from '@/lib/backend'
import { store } from '@/lib/store'
import { todayIso } from '@/lib/date'
import { notificationPayload } from '@/lib/engine/stats'
import { buildEvening, buildMorning, buildWeekly, type Payload } from '@/lib/notify/messages'
import { updateRows } from '@/lib/offline/queue'
import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push'
import { Button, Card, Input } from '@/components/ui'
import { toast } from '@/components/overlay'

/** ตั้งค่าการแจ้งเตือน: อีเมล (เช้า/ค่ำ/สรุปวันจันทร์) + Web Push */
export function NotificationSettings() {
  const qc = useQueryClient()
  const settings = useSettings()
  const s = settings.data
  const [morning, setMorning] = useState('06:30')
  const [evening, setEvening] = useState('20:30')
  const [pushOn, setPushOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!s) return
    setMorning((s.notify_morning_time ?? '06:30').slice(0, 5))
    setEvening((s.notify_evening_time ?? '20:30').slice(0, 5))
  }, [s])
  useEffect(() => {
    void currentSubscription().then((sub) => setPushOn(Boolean(sub)))
  }, [])
  if (!s) return null

  const save = async (patch: Parameters<typeof updateRows<'settings'>>[2]) => {
    await updateRows('settings', [s.id], patch)
    await qc.invalidateQueries({ queryKey: qk.settings })
  }

  const togglePush = async () => {
    setBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        await save({ notify_push: false })
        setPushOn(false)
      } else {
        await enablePush()
        await save({ notify_push: true })
        setPushOn(true)
        toast('เปิด Web Push แล้ว')
      }
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const test = async (kind: 'morning' | 'evening' | 'weekly') => {
    setBusy(true)
    try {
      const appUrl = location.href.split('#')[0]
      const p = notificationPayload(store.db, todayIso(), kind === 'weekly') as unknown as Payload
      const m = kind === 'morning' ? buildMorning(p, appUrl) : kind === 'evening' ? buildEvening(p, appUrl) : buildWeekly(p, appUrl)
      if (!m) return toast('ค่ำนี้บันทึกครบแล้ว ไม่มีอะไรต้องเตือน 👍')
      const sent: string[] = []
      if (s.notify_email) {
        const r = await call<{ to: string }>('send_email', { subject: `[ทดสอบ] ${m.title}`, html: m.html, text: m.body })
        sent.push(`อีเมล (${r.to})`)
      }
      if (s.notify_push && pushOn) {
        const reg = await navigator.serviceWorker.ready
        await reg.showNotification(m.title, { body: m.body, icon: 'pwa-192.png', tag: 'test' })
        sent.push('แจ้งเตือนบนเครื่องนี้')
      }
      toast(sent.length ? `ส่งแล้ว: ${sent.join(', ')}` : 'เปิดอีเมลหรือ Web Push ก่อน', { ms: 6000 })
    } catch (e) {
      toast(`ส่งทดสอบไม่สำเร็จ: ${(e as Error).message}`, { ms: 6000 })
    } finally {
      setBusy(false)
    }
  }

  const Toggle = ({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" className="size-6" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )

  return (
    <Card title="🔔 การแจ้งเตือน">
      <Toggle label="📧 อีเมล" on={s.notify_email} onChange={(v) => void save({ notify_email: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="เช้า: ชั่งน้ำหนัก + แผนวันนี้" type="time" value={morning} onChange={(e) => setMorning(e.target.value)}
          onBlur={() => void save({ notify_morning_time: morning })} />
        <Input label="ค่ำ: ยังไม่บันทึกอะไร" type="time" value={evening} onChange={(e) => setEvening(e.target.value)}
          onBlur={() => void save({ notify_evening_time: evening })} />
      </div>
      <Toggle label="📊 สรุปรายสัปดาห์ (วันจันทร์ตอนเช้า)" on={s.notify_weekly} onChange={(v) => void save({ notify_weekly: v })} />
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span>📱 Web Push {!pushSupported() && <span className="text-xs text-slate-500">(ไม่รองรับบนเบราว์เซอร์นี้)</span>}</span>
        <Button size="sm" variant={pushOn ? 'secondary' : 'primary'} disabled={busy || !pushSupported()} onClick={() => void togglePush()}>
          {pushOn ? 'ปิด' : 'เปิด'}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        ส่งตามเวลาที่ตั้ง (ตรวจทุก 15 นาที) · iPhone: ต้องติดตั้งแอปลงหน้าจอโฮมก่อนจึงจะเปิด Web Push ได้ · อีเมลส่งไปที่อีเมลที่ใช้ล็อกอิน
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void test('morning')}>ทดสอบเช้า</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void test('evening')}>ทดสอบค่ำ</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void test('weekly')}>ทดสอบสรุป</Button>
      </div>
    </Card>
  )
}
