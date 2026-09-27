import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { dk, invalidateDash, useExercises, useGoalProgress, useGoals, useSettings } from '@/lib/api'
import { addDays, fmtDate, todayIso } from '@/lib/date'
import { updateRows, upsertRows } from '@/lib/offline/queue'
import { Button, Empty, ErrorBox, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { confirmDialog, Modal, toast } from '@/components/overlay'
import { Confetti } from '@/components/Confetti'
import type { Goal, GoalDirection, GoalProgressRow } from '@/types/database'
import { GoalCard } from './GoalCard'
import { DIRECTION_TH, GOAL_TYPE_TH, metricInfo, metricOptions } from './goalMeta'

export function GoalsPage() {
  const goals = useGoals()
  const progress = useGoalProgress()
  const exercises = useExercises()
  const [editing, setEditing] = useState<Partial<Goal> | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  if (goals.isLoading || progress.isLoading) return <Spinner />
  const rows = progress.data ?? []
  const closed = (goals.data ?? []).filter((g) => g.status !== 'active')

  return (
    <div className="space-y-4">
      <PageTitle action={<Button size="sm" onClick={() => setEditing({})}>+ เป้าหมาย</Button>}>เป้าหมาย</PageTitle>
      <ErrorBox error={progress.error} />
      <div className="space-y-3">
        {rows.filter((r) => r.status === 'active').map((r) => (
          <GoalCard key={r.goal_id} g={r} exercises={exercises.data} onClick={() => setEditing(goals.data?.find((g) => g.id === r.goal_id) ?? null)} />
        ))}
        {!rows.some((r) => r.status === 'active') && <Empty>ยังไม่มีเป้าหมายที่กำลังทำ</Empty>}
      </div>

      {closed.length > 0 && (
        <div>
          <button type="button" className="text-sm text-blue-700 dark:text-blue-300" onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? 'ซ่อน' : 'แสดง'}เป้าหมายที่ปิดแล้ว ({closed.length})
          </button>
          {showClosed && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white text-sm dark:divide-slate-800 dark:bg-slate-900">
              {closed.map((g) => (
                <li key={g.id} className="flex items-center justify-between p-3">
                  <span>{g.status === 'done' ? '🎯' : '🗄'} {g.title}</span>
                  <span className="text-slate-500">{g.achieved_at ? fmtDate(g.achieved_at.slice(0, 10)) : g.status === 'archived' ? 'เก็บแล้ว' : ''}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>เปิด</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <GoalForm goal={editing} current={rows.find((r) => r.goal_id === editing.id)} onClose={() => setEditing(null)} />}
      <GoalCelebration rows={rows} onNext={(g) => setEditing(g)} />
    </div>
  )
}

export function GoalForm({ goal, current, onClose }: { goal: Partial<Goal>; current?: GoalProgressRow; onClose: () => void }) {
  const qc = useQueryClient()
  const exercises = useExercises()
  const settings = useSettings()
  const isNew = !goal.id
  const options = metricOptions(exercises.data ?? [], settings.data?.pinned_pain_parts ?? ['ศอกซ้าย'])
  const [f, setF] = useState({
    title: goal.title ?? '',
    metric: goal.metric ?? 'weight_kg',
    goal_type: goal.goal_type ?? 'body',
    start_value: goal.start_value != null ? String(goal.start_value) : '',
    start_date: goal.start_date ?? todayIso(),
    target_value: goal.target_value != null ? String(goal.target_value) : '',
    target_date: goal.target_date ?? '',
    direction: (goal.direction ?? 'down') as GoalDirection,
  })
  const [error, setError] = useState<unknown>(null)
  const info = metricInfo(f.metric, exercises.data)

  const save = async () => {
    setError(null)
    try {
      if (!f.title.trim()) throw new Error('กรอกชื่อเป้าหมาย')
      if (f.target_value.trim() === '' || Number.isNaN(Number(f.target_value))) throw new Error('กรอกค่าเป้าหมาย')
      const row = {
        title: f.title.trim(),
        metric: f.metric,
        goal_type: f.goal_type,
        start_value: f.start_value.trim() === '' ? null : Number(f.start_value),
        start_date: f.start_date,
        target_value: Number(f.target_value),
        target_date: f.target_date || null,
        direction: f.direction,
      }
      if (isNew) await upsertRows('goals', [{ ...row, status: 'active' as const }])
      else await updateRows('goals', [goal.id!], row)
      await invalidateDash(qc)
      onClose()
    } catch (e) {
      setError(e)
    }
  }

  const setStatus = async (status: Goal['status']) => {
    if (status === 'archived' && !(await confirmDialog('ปิด/เก็บเป้าหมายนี้?'))) return
    await updateRows('goals', [goal.id!], { status, achieved_at: status === 'done' ? new Date().toISOString() : goal.achieved_at ?? null })
    await invalidateDash(qc)
    onClose()
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'เป้าหมายใหม่' : 'แก้ไขเป้าหมาย'}
      footer={<><Button variant="secondary" block onClick={onClose}>ยกเลิก</Button><Button block onClick={save}>บันทึก</Button></>}
    >
      <div className="space-y-3">
        <Input label="ชื่อ" value={f.title} onChange={set('title')} placeholder="เช่น น้ำหนัก 76 กก." />
        <Select label="วัดจาก" value={f.metric} onChange={(e) => {
          const o = options.find((x) => x.value === e.target.value)
          setF({ ...f, metric: e.target.value, goal_type: o?.type ?? f.goal_type })
        }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {!options.some((o) => o.value === f.metric) && <option value={f.metric}>{info.label}</option>}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="ประเภท" value={f.goal_type} onChange={set('goal_type')}>
            {Object.entries(GOAL_TYPE_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select label="ทิศทาง" value={f.direction} onChange={set('direction')}>
            {Object.entries(DIRECTION_TH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label={`ค่าเริ่มต้น (${info.unit})`} hint="ว่าง = ใช้ค่าปัจจุบัน" inputMode="decimal" value={f.start_value} onChange={set('start_value')} />
          <Input label={`เป้าหมาย (${info.unit})`} inputMode="decimal" value={f.target_value} onChange={set('target_value')} />
          <Input label="วันเริ่ม" type="date" value={f.start_date} onChange={set('start_date')} />
          <Input label="วันเป้าหมาย" type="date" value={f.target_date} onChange={set('target_date')} />
        </div>
        {current?.current_value != null && <p className="text-sm text-slate-500">ค่าปัจจุบัน: {info.format(Number(current.current_value))} {info.unit}</p>}
        {info.recurring && <p className="text-xs text-slate-500">เป้านี้คำนวณใหม่ทุกสัปดาห์ (จันทร์-อาทิตย์)</p>}
        <ErrorBox error={error} />
        {!isNew && (
          <div className="flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {goal.status !== 'done' && <Button size="sm" variant="success" onClick={() => void setStatus('done')}>ทำสำเร็จแล้ว</Button>}
            {goal.status !== 'active' && <Button size="sm" variant="secondary" onClick={() => void setStatus('active')}>เปิดใหม่</Button>}
            {goal.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => void setStatus('archived')}>เก็บเข้าคลัง</Button>}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** เมื่อถึงเป้า: แอนิเมชันฉลอง + ถามว่าจะตั้งเป้าถัดไปหรือไม่ (ปิดเป้าเดิมเป็น done) */
export function GoalCelebration({ rows, onNext }: { rows: GoalProgressRow[]; onNext: (g: Partial<Goal>) => void }) {
  const qc = useQueryClient()
  const hit = rows.find((r) => r.status === 'active' && r.state === 'done' && !metricInfo(r.metric).recurring)
  if (!hit) return null
  const close = async (next: boolean) => {
    await updateRows('goals', [hit.goal_id], { status: 'done', achieved_at: new Date().toISOString() })
    await qc.invalidateQueries({ queryKey: dk.all })
    toast(`🎯 ${hit.title} สำเร็จ!`)
    if (next) {
      const dir = hit.direction
      const cur = hit.current_value != null ? Number(hit.current_value) : null
      onNext({
        metric: hit.metric,
        goal_type: hit.goal_type,
        direction: dir,
        start_value: cur,
        start_date: todayIso(),
        target_date: addDays(todayIso(), 56),
        title: '',
      })
    }
  }
  return (
    <>
      <Confetti />
      <Modal
        open
        onClose={() => void close(false)}
        footer={<><Button variant="secondary" block onClick={() => void close(false)}>ไว้ทีหลัง</Button><Button block onClick={() => void close(true)}>ตั้งเป้าถัดไป</Button></>}
      >
        <div className="py-2 text-center">
          <div className="text-6xl">🎉</div>
          <h2 className="mt-2 text-2xl font-bold">ถึงเป้าแล้ว!</h2>
          <p className="mt-1 text-lg">{hit.title}</p>
          <p className="mt-2 text-slate-500">จะตั้งเป้าหมายถัดไปเลยไหม?</p>
        </div>
      </Modal>
    </>
  )
}
