import { useState } from 'react'
import { call, setKey } from '@/lib/backend'
import { pullAll } from '@/lib/offline/queue'
import { Button, Card, ErrorBox, Input } from '@/components/ui'
import { useAuth } from './AuthProvider'

/** ล็อกอินด้วยรหัสผ่านที่ตั้งไว้ใน Apps Script (Script property: API_KEY) */
export function LoginPage() {
  const { signIn } = useAuth()
  const [key, setKeyText] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const k = key.trim()
      await call('ping', {}, k)
      setKey(k)
      await pullAll() // ดึงข้อมูลเดิมจาก Sheet ก่อนเข้าแอป
      signIn(k)
    } catch (err) {
      setKey(null)
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-5xl">🏋️‍♂️🏃</div>
        <h1 className="mt-3 text-3xl font-bold">Workout Log</h1>
        <p className="text-slate-500">ข้อมูลเก็บใน Google Sheet ของคุณ</p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <Input label="รหัสผ่าน" type="password" autoComplete="current-password" value={key} onChange={(e) => setKeyText(e.target.value)}
            hint="API_KEY ใน Apps Script" />
          <ErrorBox error={error} />
          <Button type="submit" block size="lg" disabled={busy || key.trim().length < 6}>
            {busy ? 'กำลังเชื่อมต่อ Google Sheet…' : 'เข้าสู่ระบบ'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
