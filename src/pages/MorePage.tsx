import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useSettings } from '@/lib/api'
import { useAuth } from '@/features/auth/AuthProvider'
import { updateRows } from '@/lib/offline/queue'
import { clearFailedOps, failedOps } from '@/lib/offline/queue'
import type { QueuedOp } from '@/lib/offline/db'
import { useSyncQueue } from '@/lib/offline/useSync'
import { rangeWarnings } from '@/lib/validation'
import { Button, Card, Input, PageTitle, Spinner } from '@/components/ui'
import { confirmDialog, confirmWarnings, toast } from '@/components/overlay'
import { NotificationSettings } from './NotificationSettings'
import { NutritionTargetsCard, ProfileCard, SupplementsCard } from './SettingsCards'

export function MorePage() {
  const qc = useQueryClient()
  const settings = useSettings()
  const sync = useSyncQueue()
  const [f, setF] = useState({ max_hr: '', default_rest_sec: '', weight_step_lb: '', pinned: '' })
  const [failed, setFailed] = useState<QueuedOp[]>([])
  const { signOut } = useAuth()

  useEffect(() => {
    const s = settings.data
    if (s) setF({ max_hr: String(s.max_hr), default_rest_sec: String(s.default_rest_sec), weight_step_lb: String(s.weight_step_lb), pinned: s.pinned_pain_parts.join(', ') })
  }, [settings.data])
  useEffect(() => {
    void failedOps().then(setFailed)
  }, [sync.failed])

  if (settings.isLoading || !settings.data) return <Spinner />

  const save = async () => {
    const maxHr = Number(f.max_hr)
    if (!(await confirmWarnings(rangeWarnings({ max_hr: maxHr })))) return
    await updateRows('settings', [settings.data!.id], {
      max_hr: maxHr || 186,
      default_rest_sec: Number(f.default_rest_sec) || 90,
      weight_step_lb: Number(f.weight_step_lb) || 2.5,
      pinned_pain_parts: f.pinned.split(',').map((s) => s.trim()).filter(Boolean),
    })
    await qc.invalidateQueries({ queryKey: qk.settings })
    toast('บันทึกการตั้งค่าแล้ว')
  }

  const logout = async () => {
    if (sync.pending && !(await confirmDialog(`ยังมี ${sync.pending} รายการรอส่ง ถ้าออกจากระบบตอนนี้อาจส่งไม่ได้ ออกจากระบบต่อ?`, { danger: true }))) return
    await signOut()
    qc.clear()
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="space-y-4">
      <PageTitle>เพิ่มเติม</PageTitle>

      <Card title="ทางลัด">
        <div className="grid grid-cols-2 gap-2">
          <Link to="/more/data"><Button block variant="secondary">💾 Export / Import</Button></Link>
          <Link to="/more/shoes"><Button block variant="secondary">👟 รองเท้า</Button></Link>
          <Link to="/more/exercises"><Button block variant="secondary">📚 คลังท่า</Button></Link>
          <Link to="/nutrition/foods"><Button block variant="secondary">🥗 คลังอาหาร</Button></Link>
          <Link to="/nutrition/recipes"><Button block variant="secondary">🍱 สูตรอาหาร</Button></Link>
          <Link to="/goals"><Button block variant="secondary">🎯 เป้าหมาย</Button></Link>
          <Link to="/progress"><Button block variant="secondary">📈 ความก้าวหน้า</Button></Link>
          <Link to="/body"><Button block variant="secondary">🧬 ร่างกาย</Button></Link>
          <Link to="/history"><Button block variant="secondary">🗂 ประวัติ</Button></Link>
          <Link to="/workout/programs"><Button block variant="secondary">🏋️ โปรแกรมเวท</Button></Link>
          <Link to="/plans"><Button block variant="secondary">📅 แผนวิ่ง</Button></Link>
          <Link to="/run/timer"><Button block variant="secondary">⏱ Interval timer</Button></Link>
          <Link to="/body?tab=pain"><Button block variant="secondary">🩹 อาการเจ็บ</Button></Link>
        </div>
      </Card>

      <ProfileCard />

      <Card title="ตั้งค่า">
        <div className="grid grid-cols-2 gap-3">
          <Input label="MaxHR (bpm)" inputMode="numeric" value={f.max_hr} onChange={set('max_hr')} />
          <Input label="Rest timer เริ่มต้น (วิ)" inputMode="numeric" value={f.default_rest_sec} onChange={set('default_rest_sec')} />
          <Input label="ปุ่ม +/- น้ำหนัก (lb)" inputMode="decimal" value={f.weight_step_lb} onChange={set('weight_step_lb')} />
          <Input label="จุดเจ็บที่ติดตาม" hint="คั่นด้วย ," value={f.pinned} onChange={set('pinned')} />
        </div>
        <Button className="mt-3" block onClick={save}>บันทึก</Button>
      </Card>

      <NutritionTargetsCard />
      <SupplementsCard />
      <NotificationSettings />

      <Card title="การซิงก์ข้อมูล">
        <p>{sync.online ? '🟢 ออนไลน์' : '⚪ ออฟไลน์'} · รอส่ง {sync.pending} รายการ</p>
        {failed.length > 0 && (
          <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            ส่งไม่สำเร็จ {failed.length} รายการ:
            <ul className="list-disc pl-5">{failed.map((o, i) => <li key={i}>{o.table}: {o.lastError}</li>)}</ul>
            <Button size="sm" variant="ghost" onClick={async () => { await clearFailedOps(); setFailed([]) }}>ล้างรายการ</Button>
          </div>
        )}
        <Button className="mt-2" variant="secondary" disabled={!sync.online} onClick={() => void sync.syncNow()}>ซิงก์ตอนนี้</Button>
      </Card>

      <Card title="บัญชี">
        <p className="mb-2 text-sm text-slate-500">ข้อมูลเก็บใน Google Sheet ของคุณ · ออกจากระบบจะล้างข้อมูลในเครื่องนี้ (ข้อมูลใน Sheet ยังอยู่)</p>
        <Button variant="danger" onClick={logout}>ออกจากระบบ</Button>
      </Card>

      <Card title="เกี่ยวกับ">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Workout Log — ใช้ส่วนตัว ตัวเลขโภชนาการ แคลอรี่ และคำแนะนำทั้งหมดเป็น<b>ค่าประมาณ</b> ไม่ใช่คำแนะนำทางการแพทย์
          หากมีอาการเจ็บต่อเนื่องควรปรึกษาแพทย์หรือนักกายภาพบำบัด แผนวิ่งอ้างอิงตาราง FASTBULL RUN (ใช้ส่วนตัว)
        </p>
      </Card>
    </div>
  )
}
